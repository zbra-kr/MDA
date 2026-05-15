"""
worker/dart/financials.py — DART finstate() API 호출 + 파싱.

공개 함수:
    fetch_financials_for_company(dart, company_id, corp_code, year, reprt_code)
        → FetchResult

    fetch_company_financials(dart, company_id, corp_code, years, reprt_codes)
        → list[FetchResult]
"""

from __future__ import annotations

import time

import pandas as pd
from loguru import logger
from worker.dart.models import (
    REPRT_CODE_MAP,
    REPRT_QUARTER_MAP,
    CompanyFinancials,
    FetchResult,
)

# DART API 호출 사이 최소 대기 (초)
_API_DELAY_SEC = 1.0


# ---------------------------------------------------------------------------
# 내부 파싱 헬퍼
# ---------------------------------------------------------------------------

def _parse_amount(val) -> int | None:
    """DART thstrm_amount 문자열 → 백만원 정수. 파싱 실패시 None."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        raw = int(str(val).replace(',', '').strip())
        return raw // 1_000_000
    except (ValueError, TypeError):
        return None


def _get_account(df_fs: pd.DataFrame, sj_div: str, name_contains: str) -> int | None:
    """재무제표 DataFrame에서 특정 계정 금액 추출.

    sj_div: 'IS'(손익계산서) | 'BS'(재무상태표)
    name_contains: account_nm 부분 문자열
    """
    mask = (df_fs['sj_div'] == sj_div) & (
        df_fs['account_nm'].str.contains(name_contains, na=False)
    )
    rows = df_fs[mask].sort_values('ord')
    if rows.empty:
        return None
    return _parse_amount(rows.iloc[0]['thstrm_amount'])


def _parse_fs(
    df: pd.DataFrame,
    company_id: str,
    corp_code: str,
    year: int,
    reprt_code: str,
) -> CompanyFinancials | None:
    """DataFrame → CompanyFinancials. 유효 행 없으면 None."""
    if df is None or df.empty:
        return None

    # CFS(연결) 우선, 없으면 OFS(별도)
    df_cfs = df[df['fs_div'] == 'CFS']
    if not df_cfs.empty:
        df_fs = df_cfs
        is_consolidated = True
    else:
        df_ofs = df[df['fs_div'] == 'OFS']
        if df_ofs.empty:
            return None
        df_fs = df_ofs
        is_consolidated = False

    return CompanyFinancials(
        company_id=company_id,
        corp_code=corp_code,
        fiscal_year=year,
        fiscal_quarter=REPRT_QUARTER_MAP[reprt_code],
        report_type=REPRT_CODE_MAP[reprt_code],
        is_consolidated=is_consolidated,
        revenue_mkrw=_get_account(df_fs, 'IS', '매출액'),
        operating_income_mkrw=_get_account(df_fs, 'IS', '영업이익'),
        net_income_mkrw=_get_account(df_fs, 'IS', '당기순이익'),
        total_assets_mkrw=_get_account(df_fs, 'BS', '자산총계'),
        total_liabilities_mkrw=_get_account(df_fs, 'BS', '부채총계'),
        total_equity_mkrw=_get_account(df_fs, 'BS', '자본총계'),
    )


# ---------------------------------------------------------------------------
# 공개 함수
# ---------------------------------------------------------------------------

def fetch_financials_for_company(
    dart,
    company_id: str,
    corp_code: str,
    year: int,
    reprt_code: str,
) -> FetchResult:
    """단일 회사·연도·보고서 유형 finstate 호출 + 파싱.

    Args:
        dart:        OpenDartReader 인스턴스
        company_id:  Supabase companies.id (UUID)
        corp_code:   DART 8자리 고유번호
        year:        사업연도 (e.g. 2024)
        reprt_code:  '11011'|'11012'|'11013'|'11014'

    Returns:
        FetchResult (financials 0~1건)
    """
    result = FetchResult(corp_code=corp_code, year=year, reprt_code=reprt_code)

    try:
        time.sleep(_API_DELAY_SEC)
        df = dart.finstate(corp_code, year, reprt_code=reprt_code)

        if df is None or (hasattr(df, 'empty') and df.empty):
            result.skipped = True
            result.skip_reason = f'empty result: corp={corp_code} year={year} reprt={reprt_code}'
            logger.bind(corp_code=corp_code, year=year, reprt_code=reprt_code).debug(
                'dart_finstate_empty'
            )
            return result

        parsed = _parse_fs(df, company_id, corp_code, year, reprt_code)
        if parsed is None:
            result.skipped = True
            result.skip_reason = f'no CFS/OFS rows: corp={corp_code}'
        else:
            result.financials.append(parsed)

        logger.bind(
            corp_code=corp_code,
            year=year,
            reprt_code=reprt_code,
            is_consolidated=parsed.is_consolidated if parsed else None,
            revenue_mkrw=parsed.revenue_mkrw if parsed else None,
        ).debug('dart_finstate_parsed')

    except Exception as exc:
        result.error = str(exc)
        logger.bind(corp_code=corp_code, year=year, reprt_code=reprt_code).warning(
            f'dart_finstate_error: {exc}'
        )

    return result


def fetch_company_financials(
    dart,
    company_id: str,
    corp_code: str,
    years: list[int],
    reprt_codes: list[str] | None = None,
) -> list[FetchResult]:
    """여러 연도·보고서 유형 일괄 fetch.

    Args:
        dart:        OpenDartReader 인스턴스
        company_id:  Supabase companies.id
        corp_code:   DART 8자리 고유번호
        years:       연도 목록 (e.g. list(range(2016, 2026)))
        reprt_codes: 보고서 유형 목록 (기본 연간만: ['11011'])

    Returns:
        FetchResult 목록 (연도 × 보고서유형)
    """
    if reprt_codes is None:
        reprt_codes = ['11011']

    results: list[FetchResult] = []
    for year in years:
        for reprt_code in reprt_codes:
            r = fetch_financials_for_company(dart, company_id, corp_code, year, reprt_code)
            results.append(r)
    return results
