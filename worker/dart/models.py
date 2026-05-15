"""
worker/dart/models.py — DART 재무·공시 데이터 모델.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

REPRT_CODE_MAP = {
    '11011': 'annual',
    '11012': 'half',
    '11013': 'q1',
    '11014': 'q3',
}

REPRT_QUARTER_MAP = {
    '11011': None,   # 연간
    '11012': 2,
    '11013': 1,
    '11014': 3,
}


@dataclass
class CompanyFinancials:
    """company_financials_history 1행에 대응.

    금액 단위: 백만원(mkrw). None = 해당 항목 없음.
    """
    company_id: str
    corp_code: str
    fiscal_year: int
    fiscal_quarter: int | None        # None=연간, 1/2/3=분기·반기
    report_type: str                  # 'annual'|'half'|'q1'|'q3'
    is_consolidated: bool             # True=CFS, False=OFS

    revenue_mkrw: int | None = None
    operating_income_mkrw: int | None = None
    net_income_mkrw: int | None = None

    total_assets_mkrw: int | None = None
    total_liabilities_mkrw: int | None = None
    total_equity_mkrw: int | None = None

    reporting_currency: str = 'KRW'


@dataclass
class FetchResult:
    """단일 회사·연도·보고서 유형 fetch 결과."""
    corp_code: str
    year: int
    reprt_code: str
    financials: list[CompanyFinancials] = field(default_factory=list)
    skipped: bool = False
    skip_reason: str = ''
    error: str = ''


@dataclass
class Disclosure:
    """disclosures 1행에 대응.

    notified_to_slack: 부트스트랩 적재 시 dart_writer 에서 True 로 override.
    llm_* 필드: Phase 2 에서 채움 — 기본 None.
    """
    company_id: str
    rcept_no: str            # DART 접수번호 14자리
    report_nm: str
    flr_nm: str | None
    rcept_dt: date           # DART 'YYYYMMDD' 문자열 → date
    rm: str | None           # 비고 (정정·첨부 표시)
    disclosure_type: str     # 'A'|'B'|'D'
    disclosure_subtype: str | None
    dart_url: str
    raw_summary: str | None = None
    llm_summary: str | None = None
    llm_severity: str | None = None
    llm_processed_at: str | None = None
    notified_to_slack: bool = False
