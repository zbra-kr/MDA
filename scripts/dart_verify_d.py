#!/usr/bin/env python3
"""
scripts/dart_verify_d.py — Stage D 검증 스크립트.

이랜드월드 2024 재무를 fetch → DB upsert → DB 조회 후 보고.

실행:
    cd /Users/macmini/projects/MDA
    python scripts/dart_verify_d.py

전제조건:
    - 마이그레이션 00009, 00010 이 적용됐을 것 (company_financials_history 테이블 필요)
    - dart_corp_codes 에 이랜드월드 행 적재됐을 것
    - .env 에 DART_API_KEY, SUPABASE_URL, SUPABASE_KEY (service_role) 설정
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


import OpenDartReader
from worker.dart.config import get_dart_api_key
from worker.dart.financials import fetch_financials_for_company
from worker.ingest.dart_writer import update_company_financials_cache, upsert_financials
from worker.ingest.supabase_writer import get_client

# 이랜드월드 — 직전 매핑 결과
ELAND_CORP_CODE = '00207108'
ELAND_YEAR = 2024
REPRT_CODE = '11011'   # 사업보고서(연간)


def _fmt(v: int | None, unit: str = 'mkrw') -> str:
    if v is None:
        return 'None'
    return f"{v:>15,} {unit}"


def main() -> None:
    print("=" * 60)
    print("  Stage D 검증 — 이랜드월드 2024 재무 fetch + DB 적재")
    print("=" * 60)

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    # dart_corp_codes에서 company_id 확인
    res = (
        client.table('dart_corp_codes')
        .select('company_id, corp_name')
        .eq('corp_code', ELAND_CORP_CODE)
        .single()
        .execute()
    )
    if not res.data:
        print(f"\n[FAIL] dart_corp_codes 에 corp_code={ELAND_CORP_CODE} 없음.")
        print("  → 마이그레이션 00009 + seed 를 먼저 적용하세요.")
        sys.exit(1)

    company_id = res.data['company_id']
    corp_name = res.data['corp_name']
    print(f"\n[1] dart_corp_codes 조회 OK: {corp_name}  company_id={company_id}")

    # finstate fetch
    print(f"\n[2] DART finstate 호출: corp={ELAND_CORP_CODE} year={ELAND_YEAR} reprt={REPRT_CODE}")
    result = fetch_financials_for_company(dart, company_id, ELAND_CORP_CODE, ELAND_YEAR, REPRT_CODE)

    if result.error:
        print(f"[FAIL] API 오류: {result.error}")
        sys.exit(1)
    if result.skipped:
        print(f"[FAIL] 결과 없음: {result.skip_reason}")
        sys.exit(1)
    if not result.financials:
        print("[FAIL] financials 빈 목록")
        sys.exit(1)

    f = result.financials[0]
    print(f"  is_consolidated : {f.is_consolidated}")
    print(f"  fiscal_year     : {f.fiscal_year}")
    print(f"  report_type     : {f.report_type}")
    print(f"  revenue         : {_fmt(f.revenue_mkrw)}")
    print(f"  operating_income: {_fmt(f.operating_income_mkrw)}")
    print(f"  net_income      : {_fmt(f.net_income_mkrw)}")
    print(f"  total_assets    : {_fmt(f.total_assets_mkrw)}")
    print(f"  total_liabilities:{_fmt(f.total_liabilities_mkrw)}")
    print(f"  total_equity    : {_fmt(f.total_equity_mkrw)}")

    # DB upsert
    print("\n[3] DB upsert: company_financials_history")
    ir = upsert_financials(client, result.financials)
    if ir.errors:
        print(f"[FAIL] upsert 오류: {ir.errors}")
        sys.exit(1)
    print(f"  upserted={ir.upserted}")

    # companies 캐시 갱신
    print("\n[4] companies 캐시 갱신")
    update_company_financials_cache(client, company_id, result.financials)

    # DB 조회 검증
    print("\n[5] DB 조회 검증")
    db = (
        client.table('company_financials_history')
        .select('*')
        .eq('company_id', company_id)
        .eq('fiscal_year', ELAND_YEAR)
        .is_('fiscal_quarter', 'null')
        .eq('is_consolidated', True)
        .single()
        .execute()
    )
    if not db.data:
        print("[FAIL] DB 에서 행을 찾을 수 없음")
        sys.exit(1)

    row = db.data
    print(f"  id              : {row['id']}")
    print(f"  revenue_mkrw    : {_fmt(row.get('revenue_mkrw'))}")
    print(f"  op_income_mkrw  : {_fmt(row.get('operating_income_mkrw'))}")
    print(f"  net_income_mkrw : {_fmt(row.get('net_income_mkrw'))}")
    print(f"  assets_mkrw     : {_fmt(row.get('total_assets_mkrw'))}")

    # companies 캐시 확인
    comp = (
        client.table('companies')
        .select('latest_fiscal_year, latest_revenue_mkrw, latest_financials_synced_at')
        .eq('id', company_id)
        .single()
        .execute()
    )
    if comp.data:
        print("\n[6] companies 캐시 확인")
        print(f"  latest_fiscal_year    : {comp.data.get('latest_fiscal_year')}")
        print(f"  latest_revenue_mkrw   : {_fmt(comp.data.get('latest_revenue_mkrw'))}")
        print(f"  latest_financials_synced_at: {comp.data.get('latest_financials_synced_at')}")

    print("\n" + "=" * 60)
    print("  Stage D 검증 PASS")
    print("=" * 60)


if __name__ == '__main__':
    main()
