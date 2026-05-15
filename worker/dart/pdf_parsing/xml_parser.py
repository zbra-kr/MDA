"""
worker/dart/pdf_parsing/xml_parser.py — Phase 1.7 단계 D.

감사보고서 XML → CompanyFinancials 파싱.

DART document() XML 구조:
  <SUMMARY>
    <EXTRACTION ACODE="TOT_SALES">274342</EXTRACTION>   ← 이미 백만원 단위
    <EXTRACTION ACODE="TOT_ASSETS">236082</EXTRACTION>
    <EXTRACTION ACODE="TOT_DEBTS">122194</EXTRACTION>
    <EXTRACTION ACODE="TOT_EQUITY">...</EXTRACTION>     ← 없는 경우 다수
  </SUMMARY>
  <BODY>
    <TITLE ATOCID="9">손 익 계 산 서</TITLE>
    <TR><TE>Ⅴ. 영업이익</TE><TE>3,223,753,459</TE>...  ← 원 단위
"""

from __future__ import annotations

import re
from typing import Any

import lxml.etree as ET  # noqa: N812
from loguru import logger
from worker.dart.models import CompanyFinancials

_XML_PARSER_VERSION = '1.0'
_LXML_PARSER = ET.XMLParser(recover=True, encoding='utf-8')


# ---------------------------------------------------------------------------
# 내부 파싱 헬퍼
# ---------------------------------------------------------------------------

def _parse_summary_mkrw(s: str) -> int | None:
    """SUMMARY EXTRACTION 값 (이미 백만원) → int."""
    s = s.strip().replace(',', '')
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _parse_body_won_mkrw(s: str) -> int | None:
    """BODY TE 금액 (원 단위) → 백만원 (// 1_000_000).

    '274,342,139,045' → 274342
    '(3,223,753,459)' → -3223    '-56,570,000,000' → -56570
    """
    s = s.strip().replace(',', '').replace('\xa0', '').replace('　', '')
    if not s or s == '-':
        return None
    neg = s.startswith('(') or s.startswith('−') or s.startswith('-')
    s = re.sub(r'[\(\)−\-]', '', s)
    if not s.isdigit():
        return None
    v = int(s) // 1_000_000
    return -v if neg else v


def _get_text(elem: ET.Element) -> str:
    return ''.join(elem.itertext()).strip().replace('　', '').replace('\xa0', '')


def _get_summary(root: ET.Element) -> dict[str, str]:
    return {
        ex.get('ACODE', ''): (ex.text or '').strip()
        for ex in root.findall('.//EXTRACTION')
    }


def _parse_income_stmt(root: ET.Element) -> tuple[int | None, int | None]:
    """BODY 손익계산서 TE 섹션 → (영업이익_mkrw, 당기순이익_mkrw).

    BODY 내 TITLE 텍스트가 '손익계산서'인 섹션의 TE 태그 행을 순서대로 스캔.
    ATOCID 번호는 문서마다 달라 텍스트로 판단 (ATOCID='5' 또는 '9' 등).
    영업이익/손실, 당기순이익/손실 첫 번째 등장 값을 사용.
    """
    body = root.find('BODY')
    if body is None:
        return None, None

    in_income = False
    income_atocid: str = ''
    op_income: int | None = None
    net_income: int | None = None

    for elem in body.iter():
        if elem.tag == 'TITLE':
            atocid = elem.get('ATOCID', '')
            title_text = re.sub(r'\s+', '', elem.text or '')
            # 손익계산서 섹션 진입 (최상위 TOC 항목만, ATOCID 비어있으면 하위 절)
            if '손익계산서' in title_text and atocid:
                in_income = True
                income_atocid = atocid
                continue
            # 다음 최상위 TOC 섹션 시작 → 종료
            if in_income and atocid and atocid != income_atocid:
                break
            continue
        if not in_income or elem.tag != 'TR':
            continue

        cells = [_get_text(c) for c in elem if c.tag == 'TE']
        cells = [c for c in cells if c]
        if len(cells) < 2:
            continue

        label = cells[0]
        amount_str = cells[1]   # 당기 금액 (첫 번째 컬럼)

        # 영업이익 / 영업손실
        if op_income is None:
            if '영업이익' in label and '외' not in label:
                op_income = _parse_body_won_mkrw(amount_str)
            elif '영업손실' in label and '외' not in label:
                v = _parse_body_won_mkrw(amount_str)
                op_income = -abs(v) if v is not None else None

        # 당기순이익 / 당기순손실
        if net_income is None:
            if '당기순이익' in label:
                net_income = _parse_body_won_mkrw(amount_str)
            elif '당기순손실' in label:
                v = _parse_body_won_mkrw(amount_str)
                net_income = -abs(v) if v is not None else None

        if op_income is not None and net_income is not None:
            break

    return op_income, net_income


# ---------------------------------------------------------------------------
# 공개 함수
# ---------------------------------------------------------------------------

def parse_audit_xml(
    xml_str: str,
    company_id: str,
    fiscal_year: int,
    rcept_no: str = '',
    rcept_dt: str = '',
) -> tuple[CompanyFinancials | None, dict[str, Any]]:
    """감사보고서 XML → CompanyFinancials + 추출 메타데이터.

    Args:
        xml_str:     fetch_audit_xml() 반환값
        company_id:  Supabase companies.id (UUID)
        fiscal_year: 사업연도 (e.g. 2024)
        rcept_no:    DART 접수번호 (메타데이터용)
        rcept_dt:    DART 접수일 'YYYY-MM-DD' (메타데이터용)

    Returns:
        (CompanyFinancials | None, metadata_dict)
        6개 재무 필드 모두 None 이면 CompanyFinancials = None.
    """
    metadata: dict[str, Any] = {
        'source_rcept_no': rcept_no,
        'source_rcept_dt': rcept_dt,
        'equity_method': 'calculated',
        'xml_parser_version': _XML_PARSER_VERSION,
    }

    try:
        root = ET.fromstring(xml_str.encode('utf-8'), _LXML_PARSER)
    except ET.XMLSyntaxError as exc:
        logger.bind(rcept_no=rcept_no).warning(f'parse_audit_xml_parse_error: {exc}')
        return None, metadata

    # corp_code: COMPANY-NAME 의 AREGCIK 속성
    corp_code = ''
    comp_elem = root.find('.//COMPANY-NAME')
    if comp_elem is not None:
        corp_code = comp_elem.get('AREGCIK', '')

    # is_consolidated: DOCUMENT-NAME 에 '연결' 포함 여부
    doc_name_elem = root.find('.//DOCUMENT-NAME')
    doc_name = (doc_name_elem.text or '') if doc_name_elem is not None else ''
    is_consolidated = '연결' in doc_name

    # SUMMARY 추출 (이미 백만원 단위)
    summary = _get_summary(root)
    revenue = _parse_summary_mkrw(summary.get('TOT_SALES', ''))
    assets = _parse_summary_mkrw(summary.get('TOT_ASSETS', ''))
    liabilities = _parse_summary_mkrw(summary.get('TOT_DEBTS', ''))

    # 자본총계: TOT_EQUITY 우선, 없으면 assets - liabilities
    equity_raw = summary.get('TOT_EQUITY', '')
    equity: int | None = None
    if equity_raw:
        equity = _parse_summary_mkrw(equity_raw)
        if equity is not None:
            metadata['equity_method'] = 'extracted'

    if equity is None and assets is not None and liabilities is not None:
        equity = assets - liabilities
        metadata['equity_method'] = 'calculated'

    # 손익계산서 BODY 파싱 (원 단위 → 백만원)
    op_income, net_income = _parse_income_stmt(root)

    # 6개 모두 None → 파싱 실패
    if all(v is None for v in [revenue, op_income, net_income, assets, liabilities, equity]):
        logger.bind(rcept_no=rcept_no, fiscal_year=fiscal_year).warning(
            'parse_audit_xml_all_none'
        )
        return None, metadata

    fin = CompanyFinancials(
        company_id=company_id,
        corp_code=corp_code,
        fiscal_year=fiscal_year,
        fiscal_quarter=None,
        report_type='annual',
        is_consolidated=is_consolidated,
        revenue_mkrw=revenue,
        operating_income_mkrw=op_income,
        net_income_mkrw=net_income,
        total_assets_mkrw=assets,
        total_liabilities_mkrw=liabilities,
        total_equity_mkrw=equity,
    )

    logger.bind(
        rcept_no=rcept_no,
        fiscal_year=fiscal_year,
        corp_code=corp_code,
        revenue_mkrw=revenue,
        equity_method=metadata['equity_method'],
    ).debug('parse_audit_xml_ok')

    return fin, metadata
