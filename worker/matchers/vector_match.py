"""
벡터 유사도 매칭 (Phase 2.1 단계 C-4).

최근 1주일 anomalies의 경쟁 상품 → Ollama bge-m3 임베딩 → own_skus 임베딩과
코사인 유사도 계산 → 임계값(0.8) 이상 매칭 → product_matches 적재.

사용법:
    python -m worker.matchers.vector_match --date 2026-05-17
    python -m worker.matchers.vector_match --date 2026-05-17 --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from loguru import logger
from supabase import Client

from worker.matchers.embedder import embed_text

# 코드 상수 — ADR-024 준수 (DB 설정 테이블로 이동은 Phase 4 이후)
SIMILARITY_THRESHOLD = 0.80
TOP_K = 5


# ─── 유사도 계산 ─────────────────────────────────────────────────────────────


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a, dtype=np.float32), np.array(b, dtype=np.float32)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)


# ─── 매칭 파이프라인 ─────────────────────────────────────────────────────────


def _get_competitor_products(sb: Client, target_date: date) -> list[dict]:
    """지정 날짜 기준 최근 7일 anomalies의 경쟁 상품 목록."""
    since = (target_date - timedelta(days=7)).isoformat()

    resp = (
        sb.table("anomalies")
        .select("product_id, products(id, name, category_id, list_price, embedding)")
        .gte("detected_on", since)
        .lte("detected_on", target_date.isoformat())
        .execute()
    )
    rows = resp.data or []

    seen: set[str] = set()
    products: list[dict] = []
    for r in rows:
        p = r.get("products") or {}
        pid = p.get("id") or r.get("product_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        products.append({
            "id":         pid,
            "name":       p.get("name") or "",
            "category_id": p.get("category_id"),
            "list_price": p.get("list_price"),
            "embedding":  p.get("embedding"),
        })
    return products


def _get_own_skus_with_embedding(sb: Client) -> list[dict]:
    """embedding 있는 own_skus 전체 조회."""
    resp = (
        sb.table("own_skus")
        .select("id, brand_slug, sku_code, product_name, category, price, embedding")
        .not_.is_("embedding", "null")
        .execute()
    )
    return resp.data or []


def _upsert_match(
    sb: Client,
    competitor_product_id: str,
    own_sku_id: str,
    similarity_score: float,
    dry_run: bool,
) -> None:
    if dry_run:
        return
    sb.table("product_matches").upsert(
        {
            "competitor_product_id": competitor_product_id,
            "own_sku_id":            own_sku_id,
            "similarity_score":      round(similarity_score, 4),
            "match_method":          "vector",
            "diff_summary":          {},
            "detected_at":           datetime.now(tz=timezone.utc).isoformat(),
            "is_active":             True,
        },
        on_conflict="competitor_product_id,own_sku_id",
    ).execute()


def run_match(
    sb: Client,
    target_date: date,
    ollama_host: str | None,
    dry_run: bool,
) -> dict[str, int]:
    stats = {"competitors": 0, "matched": 0, "pairs": 0}

    competitors = _get_competitor_products(sb, target_date)
    own_skus    = _get_own_skus_with_embedding(sb)
    stats["competitors"] = len(competitors)

    if not own_skus:
        logger.warning("vector_match: own_skus에 embedding 없음 — embedder 선행 실행 필요")
        return stats

    logger.info(f"vector_match: 경쟁상품 {len(competitors)}건 × 자사SKU {len(own_skus)}건")

    # own_sku 임베딩 행렬 구성
    sku_ids:   list[str]   = []
    sku_embs:  list[list[float]] = []
    for s in own_skus:
        emb = s.get("embedding")
        if emb is None:
            continue
        sku_ids.append(s["id"])
        sku_embs.append(emb if isinstance(emb, list) else list(emb))

    if not sku_embs:
        logger.warning("vector_match: own_skus embedding 파싱 실패")
        return stats

    sku_matrix = np.array(sku_embs, dtype=np.float32)
    sku_norms  = np.linalg.norm(sku_matrix, axis=1, keepdims=True)
    sku_normed = sku_matrix / np.where(sku_norms == 0, 1, sku_norms)

    for comp in competitors:
        cid = comp["id"]

        # 경쟁 상품 임베딩: products.embedding 사용, 없으면 Ollama로 생성
        comp_emb: list[float] | None = None
        raw_emb = comp.get("embedding")
        if raw_emb is not None:
            comp_emb = raw_emb if isinstance(raw_emb, list) else list(raw_emb)
        else:
            text = " ".join(filter(None, [comp.get("name"), str(comp.get("category_id") or "")]))
            comp_emb = embed_text(text, ollama_host)

        if comp_emb is None:
            continue

        va = np.array(comp_emb, dtype=np.float32)
        norm = np.linalg.norm(va)
        if norm == 0:
            continue
        va_normed = va / norm

        # 전체 own_sku와 dot product (= cosine similarity)
        sims = sku_normed @ va_normed
        top_indices = np.argsort(sims)[::-1][:TOP_K]

        matched_any = False
        for idx in top_indices:
            score = float(sims[idx])
            if score < SIMILARITY_THRESHOLD:
                break
            _upsert_match(sb, cid, sku_ids[idx], score, dry_run)
            stats["pairs"] += 1
            matched_any = True
            logger.debug(
                f"match: {cid[:8]}… ↔ {sku_ids[idx][:8]}… score={score:.4f}"
            )

        if matched_any:
            stats["matched"] += 1

    logger.bind(**stats).info("vector_match_done")
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
        prog="worker.matchers.vector_match",
        description="경쟁상품 ↔ 자사SKU 벡터 매칭",
    )
    p.add_argument(
        "--date",
        default=None,
        metavar="YYYY-MM-DD",
        help="기준 날짜 (기본: 오늘)",
    )
    p.add_argument("--dry-run", action="store_true", help="DB INSERT 생략")
    return p.parse_args()


def main() -> None:
    _load_env()
    args = _parse_args()

    target_date = (
        datetime.strptime(args.date, "%Y-%m-%d").date()
        if args.date
        else date.today()
    )
    ollama_host = os.environ.get("OLLAMA_HOST")
    logger.info(f"[vector_match] date={target_date} dry_run={args.dry_run}")

    from worker.ingest.supabase_writer import get_client
    sb = get_client()

    stats = run_match(sb, target_date, ollama_host, args.dry_run)

    bar = "=" * 48
    print(f"\n{bar}")
    print(f"  벡터 매칭  날짜={target_date}  임계값={SIMILARITY_THRESHOLD}")
    print(f"  경쟁상품:    {stats['competitors']:>6}건")
    print(f"  매칭 성공:   {stats['matched']:>6}건")
    print(f"  매칭 쌍:     {stats['pairs']:>6}건")
    if args.dry_run:
        print("  [DRY-RUN] DB INSERT 생략")
    print(f"{bar}\n")

    sys.exit(0)


if __name__ == "__main__":
    main()
