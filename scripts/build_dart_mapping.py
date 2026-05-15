#!/usr/bin/env python3
"""
scripts/build_dart_mapping.py — DART corp_code 반자동 매핑 실행.

출력: /tmp/dart_mapping.csv (정호철 검토용)

실행:
    cd /Users/macmini/projects/MDA
    python scripts/build_dart_mapping.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from worker.dart.config import get_dart_api_key
from worker.dart.corp_mapping import CorpMapping, build_mapping
from worker.ingest.supabase_writer import get_client

import OpenDartReader

OUTPUT = "/tmp/dart_mapping.csv"
FIELDNAMES = [
    "company_id", "company_name", "company_name_alt", "listing_type",
    "corp_code", "dart_corp_name", "stock_code", "corp_cls",
    "confidence", "match_note",
]


def _print_stats(results: list[CorpMapping]) -> None:
    total = len(results)
    listed   = [r for r in results if r.listing_type == 'listed']
    unlisted = [r for r in results if r.listing_type == 'unlisted']

    def _dist(rows: list[CorpMapping]) -> dict[str, int]:
        d: dict[str, int] = {'high': 0, 'medium': 0, 'none': 0}
        for r in rows:
            d[r.confidence] = d.get(r.confidence, 0) + 1
        return d

    total_dist   = _dist(results)
    listed_dist  = _dist(listed)
    unlisted_dist = _dist(unlisted)

    mapped_total   = total_dist['high'] + total_dist['medium']
    mapped_listed  = listed_dist['high'] + listed_dist['medium']
    mapped_unlisted = unlisted_dist['high'] + unlisted_dist['medium']

    bar = "=" * 60
    print(f"\n{bar}")
    print(f"  DART 매핑 결과 ({total}개사)")
    print(f"{bar}")
    print(f"  전체:     high {total_dist['high']:2d}건  medium {total_dist['medium']:2d}건  none {total_dist['none']:2d}건  → 매핑률 {mapped_total}/{total}")
    print(f"  상장({len(listed):2d}): high {listed_dist['high']:2d}건  medium {listed_dist['medium']:2d}건  none {listed_dist['none']:2d}건  → {mapped_listed}/{len(listed)}")
    print(f"  비상장({len(unlisted):2d}): high {unlisted_dist['high']:2d}건  medium {unlisted_dist['medium']:2d}건  none {unlisted_dist['none']:2d}건  → {mapped_unlisted}/{len(unlisted)}")
    print(f"{bar}")

    # none 목록 출력 (검토 참고)
    nones = [r for r in results if r.confidence == 'none']
    if nones:
        print(f"\n  [매핑 실패 {len(nones)}건]")
        for r in nones:
            tag = '상장' if r.listing_type == 'listed' else '비상장'
            print(f"  - {r.company_name} ({tag})")

    # medium 목록 출력 (사람 검토 필요)
    mediums = [r for r in results if r.confidence == 'medium']
    if mediums:
        print(f"\n  [사람 검토 필요 (medium) {len(mediums)}건]")
        for r in mediums:
            tag = '상장' if r.listing_type == 'listed' else '비상장'
            print(f"  - {r.company_name} ({tag}) → {r.dart_corp_name} [{r.corp_code}]  ← {r.match_note}")

    print()


def main() -> None:
    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    print("DART corp_code 매핑 시작...")
    results = build_mapping(dart, client)

    # CSV 출력
    with open(OUTPUT, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for r in results:
            writer.writerow({
                'company_id': r.company_id,
                'company_name': r.company_name,
                'company_name_alt': r.company_name_alt or '',
                'listing_type': r.listing_type,
                'corp_code': r.corp_code or '',
                'dart_corp_name': r.dart_corp_name or '',
                'stock_code': r.stock_code or '',
                'corp_cls': r.corp_cls or '',
                'confidence': r.confidence,
                'match_note': r.match_note,
            })

    print(f"CSV 저장: {OUTPUT}")
    _print_stats(results)


if __name__ == "__main__":
    main()
