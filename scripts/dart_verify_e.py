#!/usr/bin/env python3
"""
scripts/dart_verify_e.py — Stage E 검증 스크립트.

이랜드월드 최근 1년 공시를 fetch → DB 적재 → 검증 쿼리 실행.

실행:
    cd /Users/macmini/projects/MDA
    worker/.venv/bin/python3 scripts/dart_verify_e.py

전제조건:
    - 마이그레이션 00009, 00010 적용 완료
    - dart_corp_codes 에 이랜드월드 행 적재 완료
    - .env 에 DART_API_KEY, SUPABASE_URL, SUPABASE_KEY (service_role)
"""

from __future__ import annotations

import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import OpenDartReader
from worker.dart.config import get_dart_api_key
from worker.dart.disclosures import fetch_disclosures_for_company
from worker.ingest.dart_writer import upsert_disclosures
from worker.ingest.supabase_writer import get_client

ELAND_CORP_CODE = '00207108'
FETCH_START = '2025-05-16'
FETCH_END = '2026-05-16'


def main() -> None:
    print("=" * 60)
    print("  Stage E 검증 — 이랜드월드 최근 1년 공시 fetch + 적재")
    print("=" * 60)

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    # dart_corp_codes 에서 company_id 확인
    res = (
        client.table('dart_corp_codes')
        .select('company_id, corp_name')
        .eq('corp_code', ELAND_CORP_CODE)
        .single()
        .execute()
    )
    if not res.data:
        print(f"\n[FAIL] dart_corp_codes 에 corp_code={ELAND_CORP_CODE} 없음.")
        sys.exit(1)

    company_id = res.data['company_id']
    corp_name = res.data['corp_name']
    print(f"\n[1] dart_corp_codes 조회 OK: {corp_name}  company_id={company_id}")

    # fetch
    t0 = time.perf_counter()
    print(f"\n[2] DART list 호출: {FETCH_START} ~ {FETCH_END} (A/B/D)")
    disclosures = fetch_disclosures_for_company(
        dart, company_id, ELAND_CORP_CODE, FETCH_START, FETCH_END,
    )
    elapsed = time.perf_counter() - t0

    print(f"  총 {len(disclosures)}건  (fetch {elapsed:.1f}s)")

    # type 분포
    type_count = Counter(d.disclosure_type for d in disclosures)
    print(f"  type 분포: A={type_count.get('A',0)} / B={type_count.get('B',0)} / D={type_count.get('D',0)}")

    # 최근 5건
    print("\n  최근 5건 샘플:")
    for d in disclosures[:5]:
        print(f"    {d.rcept_dt}  [{d.disclosure_type}]  {d.report_nm}")

    # DB 적재 (bootstrap_mode=False — 단일 검증은 정상 모드)
    print("\n[3] DB 적재 (bootstrap_mode=False)")
    ir = upsert_disclosures(client, disclosures, bootstrap_mode=False)
    if ir.errors:
        print(f"[FAIL] 적재 오류: {ir.errors}")
        sys.exit(1)
    print(f"  disclosures_inserted={ir.disclosures_inserted}")
    print(f"  disclosures_skipped ={ir.disclosures_skipped}")
    print(f"  companies_updated   ={ir.companies_updated}")

    # DB 검증 SQL 1
    print("\n[4] DB 검증 — 최근 10건")
    db_rows = (
        client.table('disclosures')
        .select('rcept_dt, report_nm, disclosure_type, disclosure_subtype, notified_to_slack, dart_url')
        .eq('company_id', company_id)
        .order('rcept_dt', desc=True)
        .limit(10)
        .execute()
    )
    if not db_rows.data:
        print("[FAIL] disclosures 에서 조회 결과 없음")
        sys.exit(1)

    print(f"  {'rcept_dt':<12} {'type':<4} {'subtype':<12} {'slack':<6} report_nm")
    print("  " + "-" * 70)
    for row in db_rows.data:
        print(
            f"  {row['rcept_dt']:<12} "
            f"{row['disclosure_type']:<4} "
            f"{(row['disclosure_subtype'] or ''):<12} "
            f"{str(row['notified_to_slack']):<6} "
            f"{row['report_nm']}"
        )

    # DB 검증 SQL 2 — companies 캐시
    print("\n[5] companies 캐시 확인")
    comp = (
        client.table('companies')
        .select('name, last_disclosure_date, last_disclosure_rcept_no')
        .eq('id', company_id)
        .single()
        .execute()
    )
    if comp.data:
        print(f"  name                    : {comp.data['name']}")
        print(f"  last_disclosure_date    : {comp.data['last_disclosure_date']}")
        print(f"  last_disclosure_rcept_no: {comp.data['last_disclosure_rcept_no']}")

    # 부트스트랩 예상 시간
    print("\n[6] 부트스트랩 예상 시간")
    if len(disclosures) > 0 and elapsed > 0:
        per_company_sec = elapsed  # 1년치 1개사
        # 10년치는 약 10배, 98개사
        bootstrap_sec = per_company_sec * 10 * 98
        print(f"  이랜드월드 1년 fetch: {elapsed:.1f}s ({len(disclosures)}건)")
        print(f"  98개사 × 10년 부트스트랩 예상: {bootstrap_sec/60:.0f}분")

    print("\n" + "=" * 60)
    print("  Stage E 검증 PASS")
    print("=" * 60)


if __name__ == '__main__':
    main()
