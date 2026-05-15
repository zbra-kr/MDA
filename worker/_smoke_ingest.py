"""
Smoke test: scrape 1 category → ingest → print result.

실행:
  cd /Users/macmini/projects/MDA/worker
  python3 _smoke_ingest.py

확인 (Supabase Table Editor):
  products         → musinsa_no 행들 확인
  product_snapshots → snapshot_date = 오늘 KST
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# worker/.env 로드
_ENV_PATH = Path(__file__).parent / ".env"
if _ENV_PATH.exists():
    for line in _ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            v = v.split("#")[0].strip()  # strip inline comments
            os.environ.setdefault(k.strip(), v)

# worker 패키지를 path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from worker.ingest.supabase_writer import IngestResult, get_client, ingest_ranking_items  # noqa: E402
from worker.scrapers.musinsa_ranking import MusinsaRankingScraper  # noqa: E402


def _print_result(label: str, r: IngestResult) -> None:
    print(f"\n=== {label} ===")
    print(f"  total            : {r.total}")
    print(f"  brands_created   : {r.brands_created}")
    print(f"  products_created : {r.products_created}")
    print(f"  snapshots_written: {r.snapshots_written}")
    print(f"  failed           : {r.failed}")


async def main() -> None:
    print("=== B.CAVE Ingest Smoke Test (멱등성 포함) ===\n")

    # 1. 수집 (한 번만)
    print("[1/3] Scraping category 001 (상의) ...")
    async with MusinsaRankingScraper() as scraper:
        items = await scraper.scrape(["001"])
    print(f"      수집 완료: {len(items)}건\n")

    client = get_client()

    # 2. 첫 번째 적재
    print("[2/3] Ingest run #1 ...")
    r1: IngestResult = ingest_ranking_items(client, items)
    _print_result("Run #1", r1)

    # 3. 동일 데이터로 두 번째 적재 (멱등성 검증)
    print("\n[3/3] Ingest run #2 (same data — idempotency check) ...")
    r2: IngestResult = ingest_ranking_items(client, items)
    _print_result("Run #2", r2)

    # 판정
    print()
    ok = r2.brands_created == 0 and r2.products_created == 0 and r2.failed == 0
    if ok:
        print("✓ PASS — brands_created=0, products_created=0 on second run")
    else:
        print("✗ FAIL — idempotency broken:")
        if r2.brands_created != 0:
            print(f"    brands_created={r2.brands_created} (expected 0)")
        if r2.products_created != 0:
            print(f"    products_created={r2.products_created} (expected 0)")
        if r2.failed != 0:
            print(f"    failed={r2.failed} (expected 0)")


if __name__ == "__main__":
    asyncio.run(main())
