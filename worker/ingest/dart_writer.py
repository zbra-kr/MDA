"""
worker/ingest/dart_writer.py — DART 재무·공시 데이터 Supabase 적재.

공개 함수:
    upsert_financials(client, financials) → IngestResult
    update_company_financials_cache(client, company_id, financials) → None
    upsert_disclosures(client, disclosures, bootstrap_mode=False) → IngestResult
    update_company_disclosure_cache(client, company_id) → bool
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from loguru import logger
from worker.dart.models import CompanyFinancials, Disclosure


@dataclass
class IngestResult:
    # 재무 upsert 필드
    upserted: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)
    # 공시 upsert 필드
    disclosures_inserted: int = 0
    disclosures_skipped: int = 0
    companies_updated: int = 0
    failed: int = 0


def upsert_financials(
    client,
    financials: list[CompanyFinancials],
    *,
    data_source: str = 'finstate_api',
    audit_metadata_list: list[dict | None] | None = None,
) -> IngestResult:
    """company_financials_history upsert.

    UNIQUE 키: (company_id, fiscal_year, fiscal_quarter, is_consolidated).

    data_source='finstate_api'  → 기존 행 덮어씀 (더 정확한 데이터 우선).
    data_source='audit_report_xml' → ON CONFLICT 시 기존 행 보존 (finstate_api 우선).

    Args:
        client:             Supabase service_role 클라이언트
        financials:         CompanyFinancials 목록
        data_source:        'finstate_api' | 'audit_report_xml'
        audit_metadata_list: 각 항목의 audit_extraction_metadata dict (audit_report_xml 시)

    Returns:
        IngestResult
    """
    result = IngestResult()
    if not financials:
        return result

    rows = []
    for i, f in enumerate(financials):
        meta = (audit_metadata_list[i] if audit_metadata_list and i < len(audit_metadata_list)
                else None)
        rows.append({
            'company_id':                  f.company_id,
            'fiscal_year':                 f.fiscal_year,
            'fiscal_quarter':              f.fiscal_quarter,
            'report_type':                 f.report_type,
            'revenue_mkrw':                f.revenue_mkrw,
            'operating_income_mkrw':       f.operating_income_mkrw,
            'net_income_mkrw':             f.net_income_mkrw,
            'total_assets_mkrw':           f.total_assets_mkrw,
            'total_liabilities_mkrw':      f.total_liabilities_mkrw,
            'total_equity_mkrw':           f.total_equity_mkrw,
            'is_consolidated':             f.is_consolidated,
            'reporting_currency':          f.reporting_currency,
            'data_source':                 data_source,
            'audit_extraction_metadata':   meta,
        })

    # finstate_api: 덮어쓰기 / audit_report_xml: 기존 행 보존
    ignore_dup = data_source != 'finstate_api'

    try:
        resp = (
            client.table('company_financials_history')
            .upsert(
                rows,
                on_conflict='company_id,fiscal_year,fiscal_quarter,is_consolidated',
                ignore_duplicates=ignore_dup,
            )
            .execute()
        )
        upserted = len(resp.data) if resp.data else 0
        result.upserted = upserted
        logger.bind(upserted=upserted, data_source=data_source).info('dart_financials_upserted')
    except Exception as exc:
        msg = str(exc)
        result.errors.append(msg)
        logger.warning(f'dart_financials_upsert_error: {msg}')

    return result


def update_company_financials_cache(
    client,
    company_id: str,
    financials: list[CompanyFinancials],
) -> None:
    """companies 테이블의 latest_* 캐시 컬럼 갱신.

    가장 최신 연간(annual) 재무를 기준으로 갱신.
    annual 없으면 모든 report_type 중 가장 최신.

    Args:
        client:     Supabase service_role 클라이언트
        company_id: companies.id (UUID)
        financials: 해당 회사의 CompanyFinancials 목록
    """
    if not financials:
        return

    # 연간 우선, 없으면 전체
    annual = [f for f in financials if f.report_type == 'annual']
    pool = annual if annual else financials

    # fiscal_year 내림차순 정렬 → 가장 최신 1건
    latest = sorted(pool, key=lambda f: f.fiscal_year, reverse=True)[0]

    payload = {
        'latest_fiscal_year':            latest.fiscal_year,
        'latest_fiscal_quarter':         latest.fiscal_quarter,
        'latest_revenue_mkrw':           latest.revenue_mkrw,
        'latest_operating_income_mkrw':  latest.operating_income_mkrw,
        'latest_financials_synced_at':   datetime.now(UTC).isoformat(),
    }

    try:
        client.table('companies').update(payload).eq('id', company_id).execute()
        logger.bind(company_id=company_id, latest_year=latest.fiscal_year).debug(
            'dart_company_cache_updated'
        )
    except Exception as exc:
        logger.warning(f'dart_company_cache_update_error: {exc}')


def upsert_disclosures(
    client,
    disclosures: list[Disclosure],
    bootstrap_mode: bool = False,
) -> IngestResult:
    """disclosures 테이블 INSERT ON CONFLICT (rcept_no) DO NOTHING.

    멱등성: 같은 rcept_no 면 SKIP. 정정공시는 별도 rcept_no 라 자연 분리.

    Args:
        client:         Supabase service_role 클라이언트
        disclosures:    Disclosure 목록
        bootstrap_mode: True 면 notified_to_slack=True 로 적재 (ADR-014 폭증 방지)

    Returns:
        IngestResult (disclosures_inserted, disclosures_skipped, companies_updated, failed)
    """
    result = IngestResult()
    if not disclosures:
        return result

    rows = []
    for d in disclosures:
        rows.append({
            'company_id':         d.company_id,
            'rcept_no':           d.rcept_no,
            'report_nm':          d.report_nm,
            'flr_nm':             d.flr_nm,
            'rcept_dt':           d.rcept_dt.isoformat(),
            'rm':                 d.rm,
            'disclosure_type':    d.disclosure_type,
            'disclosure_subtype': d.disclosure_subtype,
            'dart_url':           d.dart_url,
            'raw_summary':        d.raw_summary,
            'notified_to_slack':  bool(bootstrap_mode),
        })

    try:
        resp = (
            client.table('disclosures')
            .upsert(rows, on_conflict='rcept_no', ignore_duplicates=True)
            .execute()
        )
        inserted = len(resp.data) if resp.data else 0
        skipped = len(rows) - inserted
        result.disclosures_inserted = inserted
        result.disclosures_skipped = skipped
        logger.bind(inserted=inserted, skipped=skipped, bootstrap=bootstrap_mode).info(
            'dart_disclosures_upserted'
        )
    except Exception as exc:
        msg = str(exc)
        result.errors.append(msg)
        result.failed = len(rows)
        logger.warning(f'dart_disclosures_upsert_error: {msg}')
        return result

    # companies 캐시 갱신 — 고유 company_id 별로 1회
    company_ids = {d.company_id for d in disclosures}
    for cid in company_ids:
        updated = update_company_disclosure_cache(client, cid)
        if updated:
            result.companies_updated += 1

    return result


def update_company_disclosure_cache(client, company_id: str) -> bool:
    """companies.last_disclosure_date, last_disclosure_rcept_no 갱신.

    disclosures 테이블에서 해당 company_id 의 최신 rcept_dt 1건을 DB에서 조회해 갱신.
    부트스트랩 중 일부 행이 DO NOTHING 으로 skip 됐어도 DB 기준 최신값으로 정확히 갱신.

    Returns:
        True = 갱신 성공 / False = 실패 또는 데이터 없음
    """
    try:
        res = (
            client.table('disclosures')
            .select('rcept_dt, rcept_no')
            .eq('company_id', company_id)
            .order('rcept_dt', desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return False

        row = res.data[0]
        client.table('companies').update({
            'last_disclosure_date':    row['rcept_dt'],
            'last_disclosure_rcept_no': row['rcept_no'],
        }).eq('id', company_id).execute()

        logger.bind(company_id=company_id, last_dt=row['rcept_dt']).debug(
            'dart_disclosure_cache_updated'
        )
        return True
    except Exception as exc:
        logger.warning(f'dart_disclosure_cache_update_error: {exc}')
        return False
