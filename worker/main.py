"""
B.CAVE Competitor Radar — 수집·적재 엔트리포인트.

사용법:
    cd /path/to/MDA
    python -m worker.main --mode ranking --categories all
    python -m worker.main --mode detail --top 150
    python -m worker.main --mode both --categories all --top 150
    python -m worker.main --categories all          # 하위 호환 (ranking 기본값)

exit code:
    0 — 전체 성공
    1 — 일부 상품/카테고리 실패 (n8n 알림 트리거)
    2 — 봇 차단 감지 (전체 즉시 중단)
  130 — 사용자 Ctrl+C 중단
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from datetime import timedelta, timezone
from pathlib import Path

from loguru import logger
from worker.categories import get_active_codes
from worker.ingest.detail_writer import (
    DetailIngestResult,
    ingest_product_details,
    select_priority_products,
)
from worker.ingest.supabase_writer import IngestResult, get_client, ingest_ranking_items
from worker.scrapers.base import BotBlockedError
from worker.scrapers.musinsa_product import MusinsaProductScraper
from worker.scrapers.musinsa_ranking import MusinsaRankingScraper

_KST = timezone(timedelta(hours=9))


# ---------------------------------------------------------------------------
# .env 로더 (로컬 개발용 — Docker/n8n 환경에서는 불필요)
# ---------------------------------------------------------------------------

def _load_env() -> None:
    """worker/.env 를 os.environ 에 로드. 이미 설정된 변수는 덮어쓰지 않는다."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="worker.main",
        description="B.CAVE 무신사 수집·적재",
    )
    p.add_argument(
        "--mode",
        choices=["ranking", "detail", "both"],
        default="ranking",
        help="수집 모드 — ranking(기본): 랭킹 수집+적재 | detail: 상품상세 수집+적재 | both: 순차 실행",
    )
    p.add_argument(
        "--categories",
        default=None,
        metavar="all|CODE,...",
        help=(
            "ranking/both 모드 필수. "
            "'all' = DB categories 테이블 is_active=true depth-1 전체  |  "
            "콤마 구분 코드 (예: 001,002,003)"
        ),
    )
    p.add_argument(
        "--top",
        type=int,
        default=150,
        metavar="N",
        help="detail 모드 전용 — 수집할 상위 N개 상품 (기본 150)",
    )
    return p.parse_args()


# ---------------------------------------------------------------------------
# ranking 모드
# ---------------------------------------------------------------------------

async def _run_ranking(category_codes: list[str], client) -> int:  # type: ignore[type-arg]
    """카테고리별 순차 수집·적재. 0=성공 1=일부실패. BotBlockedError → re-raise."""
    total = len(category_codes)
    succeeded = 0
    failed_codes: list[str] = []
    total_scraped = 0
    total_ingested = 0

    logger.bind(total_categories=total, codes=category_codes).info("ranking_run_start")

    async with MusinsaRankingScraper() as scraper:
        for idx, cat_code in enumerate(category_codes, 1):
            logger.bind(
                category_code=cat_code,
                progress=f"{idx}/{total}",
            ).info("category_started")

            try:
                items = await scraper.scrape([cat_code])
            except BotBlockedError:
                logger.bind(category_code=cat_code).critical("bot_blocked_halt")
                raise
            except Exception as exc:
                logger.bind(category_code=cat_code, error=str(exc)).error("scrape_failed")
                failed_codes.append(cat_code)
                continue

            total_scraped += len(items)

            try:
                result: IngestResult = ingest_ranking_items(client, items)
            except Exception as exc:
                logger.bind(category_code=cat_code, error=str(exc)).error("ingest_failed")
                failed_codes.append(cat_code)
                continue

            total_ingested += result.snapshots_written
            succeeded += 1

            logger.bind(
                category_code=cat_code,
                progress=f"{idx}/{total}",
                scraped=len(items),
                brands_created=result.brands_created,
                products_created=result.products_created,
                snapshots_written=result.snapshots_written,
            ).info("category_done")

    logger.bind(
        total_categories=total,
        succeeded=succeeded,
        failed_count=len(failed_codes),
        total_scraped=total_scraped,
        total_ingested=total_ingested,
    ).info("ranking_run_complete")

    bar = "=" * 54
    print(f"\n{bar}")
    print(f"  [ranking] 카테고리  {succeeded}/{total} 성공   실패 {len(failed_codes)}건")
    print(f"  [ranking] 총 수집   {total_scraped:,}건   총 적재 {total_ingested:,}건")
    if failed_codes:
        print(f"  [ranking] 실패 코드 {', '.join(failed_codes)}")
    print(f"{bar}\n")

    return 0 if not failed_codes else 1


# ---------------------------------------------------------------------------
# detail 모드
# ---------------------------------------------------------------------------

async def _run_detail(top: int, client) -> int:  # type: ignore[type-arg]
    """우선순위 상위 top 개 상품 상세 수집·적재. 0=성공 1=일부실패. BotBlockedError → re-raise."""
    t_wall = time.monotonic()

    # 우선순위 상품 선정
    priority = select_priority_products(client, top)
    if not priority:
        print("ERROR: 오늘 랭킹 데이터 없음 — --mode ranking 을 먼저 실행하세요.")
        return 1

    nos = [p["musinsa_no"] for p in priority]
    logger.bind(total=len(nos), top=top).info("detail_run_start")
    print(f"[INFO] 우선순위 상품 {len(nos)}개 선정 (--top {top})")

    # 상세 수집
    all_details: list[dict] = []
    failed_count = 0

    async with MusinsaProductScraper() as scraper:
        all_details = await scraper.scrape(nos)
        # scrape() 내부에서 BotBlockedError re-raise, PageNotFoundError/Timeout skip

    # scraper.scrape()는 성공한 것만 반환 → 실패 = 요청 - 성공
    failed_count = len(nos) - len(all_details)

    # 적재
    dr: DetailIngestResult = ingest_product_details(client, all_details)
    elapsed = time.monotonic() - t_wall

    bar = "=" * 54
    print(f"\n{bar}")
    print(f"  [detail] 상품 선정  {len(nos)}개  (top={top})")
    print(f"  [detail] 수집 성공  {len(all_details)}개  실패 {failed_count}개")
    print(f"  [detail] products   updated         : {dr.products_updated}")
    print(f"  [detail] snapshots  updated         : {dr.snapshots_updated}")
    print(f"  [detail] recs       inserted        : {dr.recommendations_inserted}")
    print(f"  [detail] snaps      inserted        : {dr.snaps_inserted}")
    print(f"  [detail] reviews    upserted        : {dr.review_summaries_upserted}")
    print(f"  [detail] skipped={dr.skipped}  failed={dr.failed}")
    print(f"  [detail] 총 소요    {elapsed:.0f}초")
    print(f"{bar}\n")

    has_failure = failed_count > 0 or dr.failed > 0
    return 1 if has_failure else 0


# ---------------------------------------------------------------------------
# 진입점
# ---------------------------------------------------------------------------

def main() -> None:
    _load_env()
    args = _parse_args()
    client = get_client()

    mode = args.mode

    # categories 처리 (ranking / both 에서 필요)
    codes: list[str] = []
    if mode in ("ranking", "both"):
        if args.categories is None:
            print(f"ERROR: --mode {mode} 에는 --categories 인자가 필요합니다.")
            sys.exit(1)
        if args.categories == "all":
            codes = get_active_codes(client, depth=1)
            if not codes:
                print("ERROR: categories 테이블에 is_active=true depth-1 코드가 없습니다.")
                sys.exit(1)
            print(
                f"[INFO] DB에서 {len(codes)}개 카테고리 코드 로드: "
                f"{codes[:5]}{'...' if len(codes) > 5 else ''}"
            )
        else:
            codes = [c.strip() for c in args.categories.split(",") if c.strip()]
            if not codes:
                print("ERROR: --categories 인자에 유효한 코드가 없습니다.")
                sys.exit(1)

    try:
        if mode == "ranking":
            exit_code = asyncio.run(_run_ranking(codes, client))

        elif mode == "detail":
            exit_code = asyncio.run(_run_detail(args.top, client))

        else:  # both
            ranking_exit = asyncio.run(_run_ranking(codes, client))
            if ranking_exit != 0:
                logger.warning("ranking_had_failures_proceeding_to_detail")
            detail_exit = asyncio.run(_run_detail(args.top, client))
            exit_code = max(ranking_exit, detail_exit)

    except BotBlockedError:
        print("\n[CRITICAL] 봇 차단 감지 — 전체 수집 즉시 중단 (exit 2)")
        sys.exit(2)
    except KeyboardInterrupt:
        print("\n[INFO] 사용자 중단 (Ctrl+C)")
        sys.exit(130)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
