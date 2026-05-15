"""
worker/dart/corp_mapping.py — DB companies ↔ DART corp_code 반자동 매핑.

전략:
  1. dart.corp_codes 로 전체 DART 등록사 1회 다운로드 (단일 API 호출)
  2. companies 테이블 각 행에 대해 이름 기반 매핑:
       high   = 정규화 후 완전 일치 (corp_name 또는 name_alt 기준)
       medium = 일방향 포함 (우리 이름 ⊆ DART 이름 또는 반대)
       none   = 매칭 실패
  3. 결과: List[CorpMapping]

사용:
  from worker.dart.corp_mapping import build_mapping
  results = build_mapping(dart_client, supabase_client)
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from loguru import logger


# ---------------------------------------------------------------------------
# 결과 모델
# ---------------------------------------------------------------------------

@dataclass
class CorpMapping:
    company_id: str
    company_name: str
    company_name_alt: str | None
    listing_type: str          # 'listed' | 'unlisted'
    corp_code: str | None      # DART 8자리 코드 (None=매핑 실패)
    dart_corp_name: str | None # DART 등록 회사명
    stock_code: str | None     # 종목코드 (상장사만)
    corp_cls: str | None       # Y/K/N/E
    confidence: str            # 'high' | 'medium' | 'none'
    match_note: str            # 매칭 근거 설명


# ---------------------------------------------------------------------------
# 이름 정규화
# ---------------------------------------------------------------------------

def _normalize(name: str) -> str:
    """회사명 정규화 — 법인격·사업부문·특수문자 제거 후 소문자."""
    n = name
    # 사업부문 접미사 제거: (패션부문), (FnC부문) 등
    n = re.sub(r'\([^)]*부문\)', '', n)
    n = re.sub(r'\([^)]*부문$', '', n)
    # 법인 접미사 제거: (주), (유), (합), 주식회사, 유한회사
    n = re.sub(r'\(주\)', '', n)
    n = re.sub(r'\(유\)', '', n)
    n = re.sub(r'\(합\)', '', n)
    n = re.sub(r'주식회사\s*', '', n)
    n = re.sub(r'\s*주식회사', '', n)
    n = re.sub(r'유한회사\s*', '', n)
    # 괄호 전체 제거: (구 태평양물산), (FnC부문) 등
    n = re.sub(r'\([^)]+\)', '', n)
    # 공백 제거
    n = re.sub(r'\s+', '', n)
    return n.strip().lower()


def _build_dart_index(corp_codes_df) -> dict[str, dict]:
    """DART corp_codes DataFrame → 정규화 이름 기준 검색 인덱스.

    Returns:
        {normalized_name: {corp_code, corp_name, stock_code, corp_cls}}
    """
    index: dict[str, dict] = {}
    for _, row in corp_codes_df.iterrows():
        raw = str(row.get('corp_name', '') or '')
        norm = _normalize(raw)
        if norm:
            index[norm] = {
                'corp_code': str(row.get('corp_code', '') or '').strip(),
                'corp_name': raw,
                'stock_code': str(row.get('stock_code', '') or '').strip() or None,
                'corp_cls': str(row.get('corp_cls', '') or '').strip() or None,
            }
    return index


def _match_one(
    name: str,
    name_alt: str | None,
    dart_index: dict[str, dict],
    corp_codes_df,
) -> tuple[str | None, str | None, str | None, str | None, str, str]:
    """단일 회사 매핑 시도.

    Returns: (corp_code, dart_corp_name, stock_code, corp_cls, confidence, note)
    """
    candidates: list[tuple[str, dict, str, str]] = []  # (norm_key, entry, confidence, note)

    norm_name = _normalize(name)
    norm_alt = _normalize(name_alt) if name_alt else None

    # 1. 정확 일치 (high)
    if norm_name in dart_index:
        e = dart_index[norm_name]
        return e['corp_code'], e['corp_name'], e['stock_code'], e['corp_cls'], 'high', f'name 정확일치: {name}'
    if norm_alt and norm_alt in dart_index:
        e = dart_index[norm_alt]
        return e['corp_code'], e['corp_name'], e['stock_code'], e['corp_cls'], 'high', f'name_alt 정확일치: {name_alt}'

    # 2. 포함 관계 (medium) — 정규화 이름이 DART 이름에 포함되거나 반대
    medium_hits: list[tuple[str, dict, str]] = []
    for dk, entry in dart_index.items():
        if norm_name and (norm_name in dk or dk in norm_name):
            medium_hits.append((dk, entry, f'name 포함: {name}⊆{entry["corp_name"]}'))
        elif norm_alt and (norm_alt in dk or dk in norm_alt):
            medium_hits.append((dk, entry, f'name_alt 포함: {name_alt}⊆{entry["corp_name"]}'))

    if medium_hits:
        # 길이 차이 최소인 것 선택 (가장 유사한 것)
        best = min(medium_hits, key=lambda x: abs(len(x[0]) - len(norm_name)))
        e = best[1]
        return e['corp_code'], e['corp_name'], e['stock_code'], e['corp_cls'], 'medium', best[2]

    return None, None, None, None, 'none', f'매핑 실패: {name}'


# ---------------------------------------------------------------------------
# 공개 함수
# ---------------------------------------------------------------------------

def build_mapping(dart_client, supabase_client) -> list[CorpMapping]:
    """98개 companies 행 → CorpMapping 목록 반환.

    Args:
        dart_client:     OpenDartReader 인스턴스
        supabase_client: Supabase 클라이언트 (service_role)

    Returns:
        CorpMapping 목록 (98건)
    """
    logger.info("dart_corp_codes_download_start")
    corp_codes_df = dart_client.corp_codes
    logger.bind(total_dart_corps=len(corp_codes_df)).info("dart_corp_codes_downloaded")

    dart_index = _build_dart_index(corp_codes_df)
    logger.bind(index_size=len(dart_index)).debug("dart_index_built")

    # DB에서 companies 전체 로드
    res = supabase_client.table("companies").select("id, name, name_alt, listing_type").execute()
    companies = res.data or []
    logger.bind(company_count=len(companies)).info("companies_loaded")

    results: list[CorpMapping] = []
    for c in companies:
        corp_code, dart_name, stock_code, corp_cls, confidence, note = _match_one(
            c['name'],
            c.get('name_alt'),
            dart_index,
            corp_codes_df,
        )
        results.append(CorpMapping(
            company_id=c['id'],
            company_name=c['name'],
            company_name_alt=c.get('name_alt'),
            listing_type=c['listing_type'],
            corp_code=corp_code,
            dart_corp_name=dart_name,
            stock_code=stock_code,
            corp_cls=corp_cls,
            confidence=confidence,
            match_note=note,
        ))
        logger.bind(
            name=c['name'],
            confidence=confidence,
            corp_code=corp_code,
        ).debug("corp_mapped")

    return results
