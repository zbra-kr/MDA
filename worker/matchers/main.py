"""
worker.matchers — 통합 CLI (Phase 2.1 단계 C-5).

사용법:
    python -m worker.matchers.main --mode pull
    python -m worker.matchers.main --mode embed --batch 100
    python -m worker.matchers.main --mode match --date 2026-05-17
    python -m worker.matchers.main --mode all --date 2026-05-17
    python -m worker.matchers.main --mode all --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime
from pathlib import Path

from loguru import logger


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


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="worker.matchers.main",
        description="자사 매칭 파이프라인",
    )
    p.add_argument(
        "--mode",
        choices=["pull", "embed", "match", "all"],
        default="all",
        help="실행 모드 (기본: all)",
    )
    p.add_argument(
        "--brands",
        default="covernat,lee,wakywilly",
        metavar="slug1,slug2,...",
        help="pull 모드 대상 브랜드 (기본: 3개 모두)",
    )
    p.add_argument(
        "--batch",
        type=int,
        default=100,
        metavar="N",
        help="embed 모드 배치 크기 (기본: 100)",
    )
    p.add_argument(
        "--date",
        default=None,
        metavar="YYYY-MM-DD",
        help="match 모드 기준 날짜 (기본: 오늘)",
    )
    p.add_argument("--force-embed", action="store_true", help="기존 embedding 덮어쓰기")
    p.add_argument("--dry-run", action="store_true", help="DB 쓰기 생략")
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
    modes = ["pull", "embed", "match"] if args.mode == "all" else [args.mode]

    from worker.ingest.supabase_writer import get_client
    sb = get_client()

    failed: list[str] = []

    for mode in modes:
        logger.info(f"[matchers] mode={mode} 시작")
        try:
            if mode == "pull":
                from worker.matchers.snowflake_pull import pull_skus, upsert_skus

                brands = [b.strip() for b in args.brands.split(",") if b.strip()]
                rows   = pull_skus(brands)
                n      = upsert_skus(sb, rows, args.dry_run)
                print(f"[pull] Snowflake → own_skus: {len(rows)}건 조회, {n}건 upsert")

            elif mode == "embed":
                from worker.matchers.embedder import run_embedding

                stats = run_embedding(
                    sb=sb,
                    batch_size=args.batch,
                    force=args.force_embed,
                    ollama_host=ollama_host,
                    dry_run=args.dry_run,
                )
                print(
                    f"[embed] 임베딩: 대상={stats['total']} 성공={stats['success']}"
                    f" 실패={stats['failed']} 건너뜀={stats['skipped']}"
                )

            elif mode == "match":
                from worker.matchers.vector_match import run_match

                stats = run_match(
                    sb=sb,
                    target_date=target_date,
                    ollama_host=ollama_host,
                    dry_run=args.dry_run,
                )
                print(
                    f"[match] 경쟁상품={stats['competitors']}"
                    f" 매칭성공={stats['matched']} 쌍={stats['pairs']}"
                )

        except Exception as exc:
            logger.exception(f"[matchers] mode={mode} 실패: {exc}")
            failed.append(mode)

    if failed:
        print(f"\n[ERROR] 실패한 모드: {', '.join(failed)}")
        sys.exit(1)
    else:
        print("\n[OK] 전 모드 완료.")
        sys.exit(0)


if __name__ == "__main__":
    main()
