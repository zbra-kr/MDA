"""
worker/dart/main.py — DART 워커 CLI.

사용:
    # 단일 회사 재무 fetch (개발·검증용)
    python -m worker.dart.main --mode single --corp-code 00207108 --year 2024

    # 전체 재무 부트스트랩 (정호철 직접 실행 — 33분 소요)
    python -m worker.dart.main --mode bootstrap-financials --years 2016-2025

    # 단일 회사 공시 fetch (개발·검증용)
    python -m worker.dart.main --mode disclosures-single --corp-code 00207108 \
        --start 2025-01-01 --end 2026-05-16

    # 전체 공시 부트스트랩 (정호철 직접 실행 — 30분 소요)
    python -m worker.dart.main --mode bootstrap-disclosures --start 2016-01-01

    # [운영 cron] 주간 공시 폴링 (매주 일요일 06:00 cron)
    python -m worker.dart.main --mode weekly-disclosures

    # [운영 cron] 분기 재무 갱신 (분기 첫날 07:00 cron)
    python -m worker.dart.main --mode quarterly-financials
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta

import OpenDartReader
from loguru import logger
from worker.dart.config import get_dart_api_key
from worker.dart.disclosures import fetch_disclosures_for_company
from worker.dart.financials import fetch_company_financials
from worker.ingest.dart_writer import (
    update_company_financials_cache,
    upsert_disclosures,
    upsert_financials,
)
from worker.ingest.supabase_writer import get_client


def _parse_year_range(s: str) -> list[int]:
    """'2016-2025' → [2016, ..., 2025]. 단일 숫자도 허용."""
    if '-' in s:
        start, end = s.split('-', 1)
        return list(range(int(start), int(end) + 1))
    return [int(s)]


def cmd_single(args: argparse.Namespace) -> None:
    """단일 회사·연도 fetch → 화면 출력 (DB 적재 없음)."""
    if not args.corp_code or not args.year:
        logger.error("--mode single 에는 --corp-code 와 --year 가 필요합니다.")
        sys.exit(1)

    key = get_dart_api_key()
    dart = OpenDartReader(key)

    # dart_corp_codes에서 company_id 조회
    client = get_client()
    res = (
        client.table('dart_corp_codes')
        .select('company_id')
        .eq('corp_code', args.corp_code)
        .single()
        .execute()
    )
    if not res.data:
        logger.error(f"corp_code={args.corp_code} 가 dart_corp_codes 에 없습니다.")
        sys.exit(1)
    company_id = res.data['company_id']

    reprt_codes = args.reprt_codes.split(',') if args.reprt_codes else ['11011']
    results = fetch_company_financials(
        dart, company_id, args.corp_code,
        years=[args.year],
        reprt_codes=reprt_codes,
    )

    for r in results:
        if r.error:
            print(f"  ERROR  reprt={r.reprt_code}: {r.error}")
        elif r.skipped:
            print(f"  SKIP   reprt={r.reprt_code}: {r.skip_reason}")
        else:
            for f in r.financials:
                print(
                    f"  OK     reprt={r.reprt_code} year={f.fiscal_year} q={f.fiscal_quarter} "
                    f"consolidated={f.is_consolidated}"
                )
                print(f"         revenue={f.revenue_mkrw:,} mkrw" if f.revenue_mkrw else "         revenue=None")
                print(f"         op_income={f.operating_income_mkrw:,} mkrw" if f.operating_income_mkrw else "         op_income=None")
                print(f"         net_income={f.net_income_mkrw:,} mkrw" if f.net_income_mkrw else "         net_income=None")
                print(f"         assets={f.total_assets_mkrw:,} mkrw" if f.total_assets_mkrw else "         assets=None")

    # DB 적재 여부
    if args.write:
        all_financials = [f for r in results for f in r.financials]
        ir = upsert_financials(client, all_financials)
        print(f"\n  DB 적재: upserted={ir.upserted} errors={ir.errors}")
        if all_financials:
            update_company_financials_cache(client, company_id, all_financials)
            print("  companies 캐시 갱신 완료")


def cmd_bootstrap_financials(args: argparse.Namespace) -> None:
    """98개사 전체 재무 부트스트랩. 정호철 직접 실행."""
    years = _parse_year_range(args.years or '2016-2025')
    reprt_codes = args.reprt_codes.split(',') if args.reprt_codes else ['11011']

    logger.info(f"bootstrap_financials_start: years={years[0]}~{years[-1]} reprt={reprt_codes}")

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    # dart_corp_codes 전체 로드
    res = client.table('dart_corp_codes').select('company_id, corp_code, corp_name').execute()
    corps = res.data or []
    logger.info(f"bootstrap_target: {len(corps)}개사")

    total_upserted = 0
    total_skipped = 0
    total_errors = 0

    for corp in corps:
        company_id = corp['company_id']
        corp_code = corp['corp_code']
        corp_name = corp['corp_name']

        fetch_results = fetch_company_financials(
            dart, company_id, corp_code,
            years=years,
            reprt_codes=reprt_codes,
        )

        all_financials = [f for r in fetch_results for f in r.financials]
        skipped = sum(1 for r in fetch_results if r.skipped)
        errors = [r.error for r in fetch_results if r.error]

        if all_financials:
            ir = upsert_financials(client, all_financials)
            total_upserted += ir.upserted
            total_errors += len(ir.errors)
            update_company_financials_cache(client, company_id, all_financials)

        total_skipped += skipped
        total_errors += len(errors)

        logger.bind(
            corp_name=corp_name,
            fetched=len(all_financials),
            skipped=skipped,
        ).info('bootstrap_corp_done')

    logger.info(
        f"bootstrap_financials_done: upserted={total_upserted} "
        f"skipped={total_skipped} errors={total_errors}"
    )


def cmd_disclosures_single(args: argparse.Namespace) -> None:
    """단일 회사 공시 fetch → 화면 출력 (기본 DB 적재 없음)."""
    if not args.corp_code:
        logger.error("--mode disclosures-single 에는 --corp-code 가 필요합니다.")
        sys.exit(1)

    start = args.start or '2025-01-01'
    end = args.end or date.today().isoformat()

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    res = (
        client.table('dart_corp_codes')
        .select('company_id, corp_name')
        .eq('corp_code', args.corp_code)
        .single()
        .execute()
    )
    if not res.data:
        logger.error(f"corp_code={args.corp_code} 가 dart_corp_codes 에 없습니다.")
        sys.exit(1)

    company_id = res.data['company_id']
    corp_name = res.data['corp_name']
    disclosures = fetch_disclosures_for_company(dart, company_id, args.corp_code, start, end)

    print(f"  {corp_name}  {start} ~ {end}  총 {len(disclosures)}건")
    for d in disclosures[:20]:
        print(f"  {d.rcept_dt}  [{d.disclosure_type}]  {d.report_nm}")

    if args.write:
        ir = upsert_disclosures(client, disclosures, bootstrap_mode=False)
        print(f"\n  DB 적재: inserted={ir.disclosures_inserted} "
              f"skipped={ir.disclosures_skipped} "
              f"companies_updated={ir.companies_updated}")


def _weekly_date_range() -> tuple[str, str]:
    """주간 공시 폴링용 날짜 범위: (7일 전, 오늘)."""
    today = date.today()
    start = (today - timedelta(days=7)).isoformat()
    return start, today.isoformat()


def _quarterly_params() -> tuple[int, str]:
    """현재 시점 기준 직전 분기 재무 파라미터.

    cron 실행 시점(분기 첫날) 기준으로 직전 분기를 결정:
      1월 → 전년도 연간  (11011, year-1)
      4월 → 당해 Q1     (11013, year)
      7월 → 당해 반기   (11012, year)
     10월 → 당해 Q3     (11014, year)

    Returns:
        (bsns_year, reprt_code)
    """
    today = date.today()
    m, y = today.month, today.year
    if m <= 3:
        return y - 1, '11011'
    elif m <= 6:
        return y, '11013'
    elif m <= 9:
        return y, '11012'
    else:
        return y, '11014'


def cmd_weekly_disclosures(args: argparse.Namespace) -> None:
    """[운영 cron] 모든 회사 최근 7일 공시 fetch + upsert.

    새 공시 ON CONFLICT DO NOTHING. notified_to_slack=False (Phase 2 Slack 발송 대기).
    자사 공시도 정상 적재 — Slack 제외는 Phase 2 단계 H 의 SQL WHERE c.is_own=false 처리.
    """
    start, end = _weekly_date_range()
    logger.info(f"weekly_disclosures_start: {start} ~ {end}")

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    res = client.table('dart_corp_codes').select('company_id, corp_code, corp_name').execute()
    corps = res.data or []
    total_corps = len(corps)
    logger.info(f"weekly_target: {total_corps}개사")

    total_inserted = 0
    total_skipped = 0

    for corp in corps:
        disclosures = fetch_disclosures_for_company(
            dart, corp['company_id'], corp['corp_code'], start, end,
        )
        if not disclosures:
            continue
        ir = upsert_disclosures(client, disclosures, bootstrap_mode=False)
        total_inserted += ir.disclosures_inserted
        total_skipped += ir.disclosures_skipped

        if ir.disclosures_inserted > 0:
            logger.bind(
                corp_name=corp['corp_name'],
                inserted=ir.disclosures_inserted,
            ).info('weekly_disclosures_new')

    logger.info(
        f"weekly_disclosures_done: inserted={total_inserted} skipped={total_skipped}"
    )


def cmd_quarterly_financials(args: argparse.Namespace) -> None:
    """[운영 cron] 현재 시점 직전 분기 재무 갱신.

    분기 매핑: 1월→전년연간(11011), 4월→Q1(11013), 7월→반기(11012), 10월→Q3(11014).
    companies.latest_* 컬럼 갱신.
    """
    bsns_year, reprt_code = _quarterly_params()
    logger.info(f"quarterly_financials_start: year={bsns_year} reprt={reprt_code}")

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    res = client.table('dart_corp_codes').select('company_id, corp_code, corp_name').execute()
    corps = res.data or []
    logger.info(f"quarterly_target: {len(corps)}개사")

    total_upserted = 0
    total_skipped = 0

    for corp in corps:
        results = fetch_company_financials(
            dart, corp['company_id'], corp['corp_code'],
            years=[bsns_year],
            reprt_codes=[reprt_code],
        )
        all_financials = [f for r in results for f in r.financials]
        skipped = sum(1 for r in results if r.skipped)

        if all_financials:
            ir = upsert_financials(client, all_financials)
            total_upserted += ir.upserted
            update_company_financials_cache(client, corp['company_id'], all_financials)

        total_skipped += skipped

    logger.info(
        f"quarterly_financials_done: upserted={total_upserted} skipped={total_skipped}"
    )


def cmd_bootstrap_disclosures(args: argparse.Namespace) -> None:
    """98개사 전체 공시 부트스트랩. 정호철 직접 실행.

    ⚠️ bootstrap_mode=True 필수 — notified_to_slack=True 로 INSERT (ADR-014).
    """
    start = args.start or '2016-01-01'
    end = args.end or date.today().isoformat()

    logger.info(f"bootstrap_disclosures_start: {start} ~ {end}")

    key = get_dart_api_key()
    dart = OpenDartReader(key)
    client = get_client()

    res = client.table('dart_corp_codes').select('company_id, corp_code, corp_name').execute()
    corps = res.data or []
    total_corps = len(corps)
    logger.info(f"bootstrap_target: {total_corps}개사")

    total_inserted = 0
    total_skipped = 0
    total_failed = 0

    for idx, corp in enumerate(corps, 1):
        company_id = corp['company_id']
        corp_code = corp['corp_code']
        corp_name = corp['corp_name']

        disclosures = fetch_disclosures_for_company(
            dart, company_id, corp_code, start, end,
        )

        ir = upsert_disclosures(client, disclosures, bootstrap_mode=True)
        total_inserted += ir.disclosures_inserted
        total_skipped += ir.disclosures_skipped
        total_failed += ir.failed

        logger.bind(
            corp_n=f"{idx}/{total_corps}",
            corp_name=corp_name,
            fetched=len(disclosures),
            inserted=ir.disclosures_inserted,
            skipped=ir.disclosures_skipped,
        ).info('bootstrap_disclosures_corp_done')

    logger.info(
        f"bootstrap_disclosures_done: inserted={total_inserted} "
        f"skipped={total_skipped} failed={total_failed}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description='DART 워커')
    parser.add_argument(
        '--mode',
        choices=[
            'single',
            'bootstrap-financials',
            'disclosures-single',
            'bootstrap-disclosures',
            'weekly-disclosures',
            'quarterly-financials',
        ],
        required=True,
    )
    parser.add_argument('--corp-code', help='DART 8자리 고유번호')
    parser.add_argument('--year', type=int, help='사업연도 (single 모드)')
    parser.add_argument('--years', default='2016-2025', help='재무 연도 범위 (e.g. 2016-2025)')
    parser.add_argument('--reprt-codes', help='보고서유형 콤마구분 (기본 11011)')
    parser.add_argument('--start', help='공시 조회 시작일 YYYY-MM-DD (기본 2016-01-01)')
    parser.add_argument('--end', help='공시 조회 종료일 YYYY-MM-DD (기본 오늘)')
    parser.add_argument('--write', action='store_true', help='DB 적재 (single 모드 기본 read-only)')
    args = parser.parse_args()

    if args.mode == 'single':
        cmd_single(args)
    elif args.mode == 'bootstrap-financials':
        cmd_bootstrap_financials(args)
    elif args.mode == 'disclosures-single':
        cmd_disclosures_single(args)
    elif args.mode == 'bootstrap-disclosures':
        cmd_bootstrap_disclosures(args)
    elif args.mode == 'weekly-disclosures':
        cmd_weekly_disclosures(args)
    elif args.mode == 'quarterly-financials':
        cmd_quarterly_financials(args)


if __name__ == '__main__':
    main()
