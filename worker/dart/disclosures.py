"""
worker/dart/disclosures.py — DART list() API 호출 + 공시 파싱.

공개 함수:
    fetch_disclosures(dart, company_id, corp_code, start_date, end_date,
                      kinds=('A','B','D','F')) → list[Disclosure]

    fetch_disclosures_for_company(dart, company_id, corp_code,
                                   start_date, end_date) → list[Disclosure]

DART publication types:
    A: 정기공시 (사업보고서·반기·분기)
    B: 주요사항보고
    D: 지분공시
    F: 외부감사관련 (감사보고서) ← Phase 1.7 을 위해 추가
"""

from __future__ import annotations

import re
import time
from datetime import date

import pandas as pd
from loguru import logger
from worker.dart.models import Disclosure

# DART API 호출 사이 대기 (공시 list는 1회 호출로 기간 전체 — 회사당 3 kind 호출)
_API_DELAY_SEC = 0.5

_DART_URL_TEMPLATE = 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}'

# report_nm → disclosure_subtype 키워드 매핑 (우선순위 순서로 배치)
_SUBTYPE_KEYWORDS: list[str] = [
    '감사보고서',
    '사업보고서',
    '반기보고서',
    '분기보고서',
    '유상증자결정',
    '무상증자결정',
    '전환사채',
    '신주인수권부사채',
    '합병결정',
    '분할결정',
    '영업양수도결정',
    '주식의포괄적교환',
    '주식의포괄적이전',
    '대량보유보고',
    '임원ㆍ주요주주특정증권',
    '주요주주특정증권',
    '잠정실적',
    '주요사항보고서',
]

# report_nm 에서 날짜 부분 제거 패턴: " (2026.03)"
_DATE_SUFFIX_RE = re.compile(r'\s*\(\d{4}\.\d{2}\)\s*$')


def _infer_subtype(report_nm: str) -> str | None:
    """report_nm 키워드 매칭으로 disclosure_subtype 추론."""
    for kw in _SUBTYPE_KEYWORDS:
        if kw in report_nm:
            return kw
    # 날짜 접미사 제거 후 그대로 반환 (예: '분기보고서 (2026.03)' → '분기보고서')
    cleaned = _DATE_SUFFIX_RE.sub('', report_nm).strip()
    return cleaned if cleaned else None


def _parse_rcept_dt(raw: str) -> date:
    """'YYYYMMDD' 문자열 → date 객체."""
    return date(int(raw[:4]), int(raw[4:6]), int(raw[6:8]))


def _row_to_disclosure(row: pd.Series, company_id: str, disclosure_type: str) -> Disclosure:
    """DataFrame 행 → Disclosure."""
    rcept_no = str(row['rcept_no']).strip()
    report_nm = str(row.get('report_nm', '') or '').strip()
    flr_nm = str(row.get('flr_nm', '') or '').strip() or None
    rcept_dt_raw = str(row['rcept_dt']).strip()
    rm_raw = str(row.get('rm', '') or '').strip()

    rcept_dt = _parse_rcept_dt(rcept_dt_raw)
    subtype = _infer_subtype(report_nm)
    dart_url = _DART_URL_TEMPLATE.format(rcept_no=rcept_no)

    # raw_summary: LLM Phase 2 전 기본 텍스트
    raw_summary = f"{report_nm} | {flr_nm or ''} | {rcept_dt_raw}"

    return Disclosure(
        company_id=company_id,
        rcept_no=rcept_no,
        report_nm=report_nm,
        flr_nm=flr_nm,
        rcept_dt=rcept_dt,
        rm=rm_raw or None,
        disclosure_type=disclosure_type,
        disclosure_subtype=subtype,
        dart_url=dart_url,
        raw_summary=raw_summary,
    )


def fetch_disclosures(
    dart,
    company_id: str,
    corp_code: str,
    start_date: str,
    end_date: str,
    kinds: tuple[str, ...] = ('A', 'B', 'D', 'F'),
) -> list[Disclosure]:
    """단일 회사·기간·공시유형 fetch.

    Args:
        dart:         OpenDartReader 인스턴스
        company_id:   Supabase companies.id
        corp_code:    DART 8자리 고유번호
        start_date:   'YYYY-MM-DD'
        end_date:     'YYYY-MM-DD'
        kinds:        공시 종류 ('A'=정기, 'B'=주요사항, 'D'=지분, 'F'=외부감사관련)

    Returns:
        Disclosure 목록 (중복 rcept_no 제거됨)
    """
    all_disclosures: list[Disclosure] = []
    seen_rcept: set[str] = set()

    for kind in kinds:
        time.sleep(_API_DELAY_SEC)
        try:
            df = dart.list(corp_code, start=start_date, end=end_date, kind=kind)

            if df is None or (hasattr(df, 'empty') and df.empty):
                logger.bind(corp_code=corp_code, kind=kind).debug('dart_list_empty')
                continue

            for _, row in df.iterrows():
                rcept_no = str(row.get('rcept_no', '')).strip()
                if not rcept_no or rcept_no in seen_rcept:
                    continue
                seen_rcept.add(rcept_no)
                disc = _row_to_disclosure(row, company_id, kind)
                all_disclosures.append(disc)

            logger.bind(
                corp_code=corp_code,
                kind=kind,
                count=len(df),
            ).debug('dart_list_fetched')

        except Exception as exc:
            logger.bind(corp_code=corp_code, kind=kind).warning(
                f'dart_list_error: {exc}'
            )

    return all_disclosures


def fetch_disclosures_for_company(
    dart,
    company_id: str,
    corp_code: str,
    start_date: str,
    end_date: str,
) -> list[Disclosure]:
    """단일 회사의 지정 기간 공시 fetch (A/B/D 전체).

    Args:
        dart:        OpenDartReader 인스턴스
        company_id:  Supabase companies.id
        corp_code:   DART 8자리 고유번호
        start_date:  'YYYY-MM-DD'
        end_date:    'YYYY-MM-DD'

    Returns:
        Disclosure 목록 (rcept_dt 내림차순 정렬)
    """
    disclosures = fetch_disclosures(
        dart, company_id, corp_code, start_date, end_date,
    )
    disclosures.sort(key=lambda d: d.rcept_dt, reverse=True)

    logger.bind(
        corp_code=corp_code,
        total=len(disclosures),
        start=start_date,
        end=end_date,
    ).info('dart_disclosures_fetched')

    return disclosures
