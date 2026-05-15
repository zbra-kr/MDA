"""
worker/dart/pdf_parsing/main.py — Phase 1.7 단계 E.

감사보고서 XML 파싱 → 재무 적재 CLI.

모드:
    single               단일 rcept_no 파싱 (검증용, 적재 없음)
    bootstrap-audit-financials   45개사 전체 적재 (정호철 승인 후)

실행 예시:
    # 단일 검증 (적재 안 함)
    worker/.venv/bin/python3 -m worker.dart.pdf_parsing.main \\
        --mode single \\
        --rcept-no 20250327001163 \\
        --company-id e360a29c-c4fe-4978-828b-2177989283b0 \\
        --fiscal-year 2024

    # 전체 부트스트랩 (dry-run)
    worker/.venv/bin/python3 -m worker.dart.pdf_parsing.main \\
        --mode bootstrap-audit-financials --dry-run

    # 전체 부트스트랩 (실제 적재 — 정호철 승인 후)
    worker/.venv/bin/python3 -m worker.dart.pdf_parsing.main \\
        --mode bootstrap-audit-financials
"""

from __future__ import annotations

import argparse
import sys

import OpenDartReader
from loguru import logger
from worker.dart.config import get_dart_api_key
from worker.dart.pdf_parsing.target_selector import select_audit_targets
from worker.dart.pdf_parsing.xml_fetcher import fetch_audit_xml
from worker.dart.pdf_parsing.xml_parser import parse_audit_xml
from worker.ingest.dart_writer import update_company_financials_cache, upsert_financials
from worker.ingest.supabase_writer import get_client

_DATA_SOURCE = 'audit_report_xml'


def _run_single(dart_api, company_id: str, rcept_no: str, fiscal_year: int) -> None:
    """단일 rcept_no 파싱 결과 출력 (적재 안 함)."""
    print(f'\n단일 파싱: rcept_no={rcept_no}, fiscal_year={fiscal_year}')

    xml_str = fetch_audit_xml(dart_api, rcept_no)
    if xml_str is None:
        print('[FAIL] XML 수신 실패')
        sys.exit(1)

    print(f'XML 수신: {len(xml_str):,}자')

    fin, meta = parse_audit_xml(
        xml_str,
        company_id=company_id,
        fiscal_year=fiscal_year,
        rcept_no=rcept_no,
    )

    if fin is None:
        print('[FAIL] 파싱 실패 — 모든 필드 None')
        sys.exit(1)

    print(f'corp_code:               {fin.corp_code}')
    print(f'is_consolidated:         {fin.is_consolidated}')
    print(f'equity_method:           {meta["equity_method"]}')
    print(f'revenue_mkrw:            {fin.revenue_mkrw}')
    print(f'operating_income_mkrw:   {fin.operating_income_mkrw}')
    print(f'net_income_mkrw:         {fin.net_income_mkrw}')
    print(f'total_assets_mkrw:       {fin.total_assets_mkrw}')
    print(f'total_liabilities_mkrw:  {fin.total_liabilities_mkrw}')
    print(f'total_equity_mkrw:       {fin.total_equity_mkrw}')
    print('\n[OK] 적재 안 함 (single 모드). 전체 적재는 bootstrap-audit-financials 사용.')


def _guess_fiscal_year(target, rcept_no: str) -> int:
    """audit_rcept_nos 인덱스로 fiscal_year 추정.

    audit_rcept_nos는 최신순. latest_audit 연도를 기준으로 인덱스만큼 이전 연도.
    (예: latest_audit=2026-04-03 → base_year=2025, idx=0→FY2025, idx=1→FY2024)
    """
    try:
        idx = target.audit_rcept_nos.index(rcept_no)
    except ValueError:
        idx = 0
    base_year = (target.latest_audit.year - 1) if target.latest_audit else 2024
    return base_year - idx


def _run_bootstrap(dart_api, dry_run: bool) -> None:
    """45개사 전체 감사보고서 XML 파싱 → 재무 적재."""
    client = get_client()
    targets = select_audit_targets(client)

    print(f'\n대상: {len(targets)}개사')
    print(f'dry_run: {dry_run}')
    print('=' * 60)

    total_ok = 0
    total_skip = 0
    total_fail = 0

    for t in targets:
        print(f'\n[{t.name}] {t.corp_code}  감사보고서={t.audit_count}건')

        fins: list = []
        metas: list = []

        for rcept_no in t.audit_rcept_nos:
            xml_str = fetch_audit_xml(dart_api, rcept_no)
            if xml_str is None:
                logger.bind(corp_code=t.corp_code, rcept_no=rcept_no).warning(
                    'bootstrap_audit_xml_skip'
                )
                total_skip += 1
                continue

            fiscal_year = _guess_fiscal_year(t, rcept_no)

            fin, meta = parse_audit_xml(
                xml_str,
                company_id=t.company_id,
                fiscal_year=fiscal_year,
                rcept_no=rcept_no,
            )

            if fin is None:
                logger.bind(corp_code=t.corp_code, rcept_no=rcept_no).warning(
                    'bootstrap_audit_parse_fail'
                )
                total_fail += 1
                continue

            fins.append(fin)
            metas.append(meta)
            print(
                f'  rcept={rcept_no}  FY{fiscal_year}'
                f'  rev={fin.revenue_mkrw}  op={fin.operating_income_mkrw}'
                f'  net={fin.net_income_mkrw}  eq_method={meta["equity_method"]}'
            )

        if not fins:
            continue

        if dry_run:
            print(f'  [dry-run] {len(fins)}건 적재 생략')
            total_ok += len(fins)
        else:
            result = upsert_financials(
                client,
                fins,
                data_source=_DATA_SOURCE,
                audit_metadata_list=metas,
            )
            total_ok += result.upserted
            if result.errors:
                logger.warning(f'upsert_errors: {result.errors}')
                total_fail += len(result.errors)

            update_company_financials_cache(client, t.company_id, fins)

    print('\n' + '=' * 60)
    print(f'완료  ok={total_ok}  skip={total_skip}  fail={total_fail}')
    if dry_run:
        print('dry-run 완료 — 실제 적재 없음. --dry-run 제거 후 재실행하면 적재됩니다.')


def main() -> None:
    parser = argparse.ArgumentParser(description='감사보고서 XML 파싱 CLI')
    parser.add_argument('--mode', required=True,
                        choices=['single', 'bootstrap-audit-financials'])
    parser.add_argument('--rcept-no',    help='DART 접수번호 (single 모드)')
    parser.add_argument('--company-id',  help='companies.id UUID (single 모드)')
    parser.add_argument('--fiscal-year', type=int, help='회계연도 (single 모드)')
    parser.add_argument('--dry-run', action='store_true',
                        help='파싱만 하고 적재는 건너뜀 (bootstrap 모드)')
    args = parser.parse_args()

    dart_api = OpenDartReader(get_dart_api_key())

    if args.mode == 'single':
        if not args.rcept_no or not args.company_id or not args.fiscal_year:
            parser.error('single 모드: --rcept-no, --company-id, --fiscal-year 필수')
        _run_single(dart_api, args.company_id, args.rcept_no, args.fiscal_year)

    elif args.mode == 'bootstrap-audit-financials':
        _run_bootstrap(dart_api, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
