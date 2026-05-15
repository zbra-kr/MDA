#!/usr/bin/env python3
"""
scripts/dart_verify_phase17_d.py — Phase 1.7 단계 D 검증.

비케이브 FY2024 감사보고서 XML 파싱 결과 확인 (적재 안 함).

실행:
    cd /Users/macmini/projects/MDA
    worker/.venv/bin/python3 scripts/dart_verify_phase17_d.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv('worker/.env')

import OpenDartReader

from worker.dart.pdf_parsing.xml_fetcher import fetch_audit_xml
from worker.dart.pdf_parsing.xml_parser import parse_audit_xml

# 비케이브
BCAVE_COMPANY_ID = 'e360a29c-c4fe-4978-828b-2177989283b0'
BCAVE_CORP_CODE  = '01461509'

# FY2024 감사보고서 (2025-03-27 제출)
FY2024_RCEPT_NO = '20250327001163'
FY2024_RCEPT_DT = '2025-03-27'
FY2024_YEAR     = 2024

# FY2025 감사보고서 (2026-04-03 제출) — 선택적 교차검증
FY2025_RCEPT_NO = '20260403001129'
FY2025_RCEPT_DT = '2026-04-03'
FY2025_YEAR     = 2025

# 기대값 (백만원)
EXPECT_FY2024 = {
    'revenue_mkrw':        318_860,   # ≈ 3,189억
    'total_assets_mkrw':   224_900,   # ≈ 2,249억
    'net_income_mkrw':      15_400,   # ≈  154억
    'total_equity_mkrw':   113_100,   # ≈ 1,131억
}
EXPECT_FY2025 = {
    'revenue_mkrw':    274_342,
    'total_assets_mkrw': 236_082,
    'total_liabilities_mkrw': 122_194,
    'net_income_mkrw':   697,
    'total_equity_mkrw': 113_888,
}
TOLERANCE = 0.02   # 2% 허용 오차


def _pct_diff(actual: int | None, expect: int) -> float | None:
    if actual is None:
        return None
    return abs(actual - expect) / abs(expect) if expect else None


def _check(label: str, actual: int | None, expect: int) -> bool:
    diff = _pct_diff(actual, expect)
    ok = diff is not None and diff <= TOLERANCE
    status = 'OK' if ok else ('MISS' if diff is not None else 'NONE')
    diff_str = f'{diff*100:+.1f}%' if diff is not None else 'N/A'
    actual_str = str(actual) if actual is not None else 'None'
    print(f'  [{status}] {label:35s}  actual={actual_str:>10}  expect={expect:>10}  diff={diff_str}')
    return ok


def run_one(
    dart_api,
    label: str,
    rcept_no: str,
    rcept_dt: str,
    fiscal_year: int,
    expects: dict,
) -> bool:
    print(f'\n{"="*60}')
    print(f'  {label}  (rcept_no={rcept_no})')
    print('=' * 60)

    xml_str = fetch_audit_xml(dart_api, rcept_no)
    if xml_str is None:
        print('  [FAIL] fetch_audit_xml returned None')
        return False

    print(f'  XML 수신: {len(xml_str):,}자')

    fin, meta = parse_audit_xml(
        xml_str,
        company_id=BCAVE_COMPANY_ID,
        fiscal_year=fiscal_year,
        rcept_no=rcept_no,
        rcept_dt=rcept_dt,
    )

    if fin is None:
        print('  [FAIL] parse_audit_xml returned None')
        return False

    print(f'  corp_code:      {fin.corp_code}')
    print(f'  is_consolidated:{fin.is_consolidated}')
    print(f'  equity_method:  {meta["equity_method"]}')
    print()

    all_ok = True
    for field, expect_val in expects.items():
        actual_val = getattr(fin, field, None)
        if not _check(field, actual_val, expect_val):
            all_ok = False

    # 나머지 추출된 필드도 표시
    extra_fields = [
        'operating_income_mkrw', 'total_liabilities_mkrw',
    ]
    for f in extra_fields:
        if f not in expects:
            v = getattr(fin, f, None)
            print(f'  [   ] {f:35s}  actual={str(v):>10}')

    return all_ok


def main() -> None:
    import os
    dart_api_key = os.environ.get('DART_API_KEY', '')
    if not dart_api_key:
        print('[ERROR] DART_API_KEY not set in worker/.env')
        sys.exit(1)

    dart_api = OpenDartReader(dart_api_key)

    print('Phase 1.7 단계 D 검증 — 비케이브 감사보고서 XML 파싱')

    ok_fy2024 = run_one(
        dart_api,
        label='비케이브 FY2024',
        rcept_no=FY2024_RCEPT_NO,
        rcept_dt=FY2024_RCEPT_DT,
        fiscal_year=FY2024_YEAR,
        expects=EXPECT_FY2024,
    )

    ok_fy2025 = run_one(
        dart_api,
        label='비케이브 FY2025',
        rcept_no=FY2025_RCEPT_NO,
        rcept_dt=FY2025_RCEPT_DT,
        fiscal_year=FY2025_YEAR,
        expects=EXPECT_FY2025,
    )

    print(f'\n{"="*60}')
    print(f'  FY2024: {"PASS" if ok_fy2024 else "FAIL"}')
    print(f'  FY2025: {"PASS" if ok_fy2025 else "FAIL"}')
    overall = ok_fy2024 and ok_fy2025
    print(f'  전체:   {"PASS — 단계 E 진행 가능" if overall else "FAIL — 파서 검토 필요"}')
    print('=' * 60)

    sys.exit(0 if overall else 1)


if __name__ == '__main__':
    main()
