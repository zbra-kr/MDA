"""
own_skus 임베딩 생성기 (Phase 2.1 단계 C-3).

Ollama gemma:e4b으로 own_skus.product_name + category 임베딩 생성 →
own_skus.embedding 컬럼 UPDATE.

사용법:
    python -m worker.matchers.embedder --batch 100
    python -m worker.matchers.embedder --batch 100 --force  # 기존 임베딩 덮어쓰기

선행 조건:
    ollama pull gemma:e4b   # Mac에서 사전 실행 필요
    ollama serve            # Ollama 서버 가동 중
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import ollama
from loguru import logger
from supabase import Client

EMBED_MODEL = "gemma:e4b"
EMBED_DIM: int | None = None  # None = 차원 검증 생략 (pgvector가 스키마 차원으로 검증)


# ─── 임베딩 생성 ─────────────────────────────────────────────────────────────


def _build_text(product_name: str | None, category: str | None) -> str:
    parts = [product_name or "", category or ""]
    return " ".join(p for p in parts if p).strip()


def embed_text(text: str, ollama_host: str | None = None) -> list[float] | None:
    """Ollama gemma:e4b로 텍스트 임베딩. 실패 시 None 반환."""
    if not text.strip():
        return None
    try:
        client_kwargs: dict = {}
        if ollama_host:
            client_kwargs["host"] = ollama_host
        client = ollama.Client(**client_kwargs)
        resp = client.embeddings(model=EMBED_MODEL, prompt=text)
        emb = resp["embedding"]
        if EMBED_DIM is not None and len(emb) != EMBED_DIM:
            logger.warning(f"embedding dim mismatch: expected {EMBED_DIM}, got {len(emb)}")
            return None
        return emb
    except Exception as exc:
        logger.warning(f"embed_text failed: {exc}")
        return None


# ─── 배치 처리 ───────────────────────────────────────────────────────────────


def run_embedding(
    sb: Client,
    batch_size: int,
    force: bool,
    ollama_host: str | None,
    dry_run: bool,
) -> dict[str, int]:
    """embedding 없는 own_skus 행을 배치 처리. 처리 통계 반환."""
    stats = {"total": 0, "success": 0, "failed": 0, "skipped": 0}

    # embedding null 인 행 (또는 force 시 전체) 조회
    q = sb.table("own_skus").select("id, product_name, category")
    if not force:
        q = q.is_("embedding", "null")
    q = q.limit(batch_size)

    resp = q.execute()
    rows = resp.data or []
    stats["total"] = len(rows)

    if not rows:
        logger.info("embedder: embedding 대상 없음")
        return stats

    logger.info(f"embedder: {len(rows)}건 처리 시작 (model={EMBED_MODEL})")

    for row in rows:
        rid = row["id"]
        text = _build_text(row.get("product_name"), row.get("category"))
        if not text:
            stats["skipped"] += 1
            continue

        emb = embed_text(text, ollama_host)
        if emb is None:
            stats["failed"] += 1
            continue

        if not dry_run:
            # pgvector는 Python list를 그대로 받음
            sb.table("own_skus").update({"embedding": emb}).eq("id", rid).execute()
        stats["success"] += 1
        time.sleep(0.05)  # Ollama 과부하 방지

    logger.bind(**stats).info("embedder_done")
    return stats


# ─── 환경 로드 ───────────────────────────────────────────────────────────────


def _load_env() -> None:
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


# ─── CLI ─────────────────────────────────────────────────────────────────────


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="worker.matchers.embedder",
        description="own_skus bge-m3 임베딩 생성",
    )
    p.add_argument("--batch", type=int, default=100, metavar="N", help="1회 처리 건수")
    p.add_argument("--force", action="store_true", help="기존 embedding 덮어쓰기")
    p.add_argument("--dry-run", action="store_true", help="DB UPDATE 생략")
    return p.parse_args()


def main() -> None:
    _load_env()
    args = _parse_args()

    ollama_host = os.environ.get("OLLAMA_HOST")
    logger.info(f"[embedder] batch={args.batch} force={args.force} dry_run={args.dry_run} host={ollama_host}")

    from worker.ingest.supabase_writer import get_client
    sb = get_client()

    stats = run_embedding(
        sb=sb,
        batch_size=args.batch,
        force=args.force,
        ollama_host=ollama_host,
        dry_run=args.dry_run,
    )

    bar = "=" * 48
    print(f"\n{bar}")
    print(f"  임베딩 결과  (model={EMBED_MODEL})")
    print(f"  대상:   {stats['total']:>6}건")
    print(f"  성공:   {stats['success']:>6}건")
    print(f"  실패:   {stats['failed']:>6}건")
    print(f"  텍스트 없음: {stats['skipped']:>3}건")
    if args.dry_run:
        print("  [DRY-RUN] DB UPDATE 생략")
    print(f"{bar}\n")

    if stats["failed"] > 0:
        print("[WARN] 실패 건 있음 — ollama pull gemma:e4b 또는 ollama serve 확인")
        sys.exit(1)


if __name__ == "__main__":
    main()
