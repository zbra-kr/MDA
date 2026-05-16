"""
worker/enrichment/verify_brand_musinsa.py — Phase 1.5.2 Stage B.

/tmp/company_brand_candidates.csv 를 읽어 무신사 브랜드 검색 API 로 검증.

엔드포인트: GET https://api.musinsa.com/api2/dp/v1/search/brand?gf=A&keyword={name}
Rate limit: 1.5초/건

출력:
  /tmp/company_brand_verified.csv   — musinsa 확인된 brand (exact + fuzzy)
  /tmp/company_brand_not_found.csv  — musinsa 미확인 brand

실행 예시:
    worker/.venv/bin/python3 -m worker.enrichment.verify_brand_musinsa
    worker/.venv/bin/python3 -m worker.enrichment.verify_brand_musinsa \\
        --input /tmp/company_brand_candidates.csv
"""

from __future__ import annotations

import argparse
import csv
import time
import unicodedata
from pathlib import Path

import httpx
from loguru import logger

_IN_CSV = Path('/tmp/company_brand_candidates.csv')
_VERIFIED_CSV = Path('/tmp/company_brand_verified.csv')
_NOT_FOUND_CSV = Path('/tmp/company_brand_not_found.csv')

_API_URL = 'https://api.musinsa.com/api2/dp/v1/search/brand'
_RATE_DELAY_SEC = 1.5
_FUZZY_MIN_RATIO = 0.7

_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'application/json',
    'Referer': 'https://www.musinsa.com/',
}

_VERIFIED_FIELDS = [
    'company_id', 'company_name', 'candidate_name_ko', 'candidate_name_en',
    'confidence_llm', 'musinsa_slug', 'musinsa_brand_name', 'musinsa_brand_url',
    'match_method', 'match_ratio',
]
_NOT_FOUND_FIELDS = [
    'company_id', 'company_name', 'candidate_name_ko', 'candidate_name_en',
    'confidence_llm', 'reasoning_llm', 'musinsa_search_hits',
]


def normalize(text: str) -> str:
    """공백·중점(·)·하이픈(-)·언더스코어 제거 후 NFC 소문자 정규화."""
    text = unicodedata.normalize('NFC', text)
    for ch in (' ', '·', '-', '_', '.'):
        text = text.replace(ch, '')
    return text.lower()


def _search_musinsa(keyword: str, client: httpx.Client) -> list[dict]:
    """무신사 브랜드 검색 API 호출. 실패 시 빈 리스트 반환."""
    try:
        r = client.get(
            _API_URL,
            params={'gf': 'A', 'keyword': keyword},
            timeout=10,
        )
        if r.status_code != 200:
            logger.warning(f'musinsa_api_error: status={r.status_code} keyword={keyword!r}')
            return []
        data = r.json()
        return data.get('data', {}).get('items', []) or []
    except Exception as exc:
        logger.warning(f'musinsa_api_exception: keyword={keyword!r} err={exc}')
        return []


def match_brand(
    name_ko: str,
    name_en: str,
    items: list[dict],
) -> tuple[dict, str, float] | None:
    """
    1차 (exact_ko): name_ko 정규화 완전일치
    2차 (fuzzy_substring): name_ko 가 brandName 에 포함 + 길이 비율 >= 0.7
    3차 (exact_en): name_en 정규화 완전일치

    반환: (item, match_method, match_ratio) 또는 None
    """
    name_ko_norm = normalize(name_ko)
    name_en_norm = normalize(name_en) if name_en else ''

    exact_matches: list[tuple[dict, str, float]] = []
    fuzzy_matches: list[tuple[dict, str, float]] = []

    for item in items:
        brand_norm = normalize(item.get('brandName', ''))

        # 1차 — ko 완전일치
        if brand_norm == name_ko_norm and name_ko_norm:
            exact_matches.append((item, 'exact_ko', 1.0))
            continue

        # 2차 — ko substring + 길이 비율
        if name_ko_norm and name_ko_norm in brand_norm and brand_norm:
            ratio = len(name_ko_norm) / len(brand_norm)
            if ratio >= _FUZZY_MIN_RATIO:
                fuzzy_matches.append((item, 'fuzzy_substring', round(ratio, 3)))

        # 3차 — en 완전일치 (exact_ko 이미 처리 안 된 경우에만)
        if name_en_norm and brand_norm == name_en_norm:
            exact_matches.append((item, 'exact_en', 1.0))

    if exact_matches:
        return exact_matches[0]
    if fuzzy_matches:
        return sorted(fuzzy_matches, key=lambda x: -x[2])[0]
    return None


def _run(input_csv: Path) -> None:
    if not input_csv.exists():
        print(f'[ERROR] 입력 CSV 없음: {input_csv}')
        return

    with input_csv.open(encoding='utf-8') as f:
        candidates = list(csv.DictReader(f))

    print(f'\n대상: {len(candidates)}개 brand 후보')
    print(f'verified → {_VERIFIED_CSV}')
    print(f'not_found → {_NOT_FOUND_CSV}')
    print('=' * 60)

    verified_rows: list[dict] = []
    not_found_rows: list[dict] = []

    with httpx.Client(headers=_HEADERS, follow_redirects=True) as client:
        for i, row in enumerate(candidates, 1):
            name_ko = row.get('name_ko', '').strip()
            name_en = row.get('name_en', '').strip()
            cid = row.get('company_id', '')
            cname = row.get('company_name', '')
            conf_llm = row.get('confidence', '')
            reasoning = row.get('reasoning', '')

            print(f'[{i:3d}/{len(candidates)}] {cname} / {name_ko} ...', end=' ', flush=True)

            items = _search_musinsa(name_ko, client)
            match = match_brand(name_ko, name_en, items)

            if match:
                item, method, ratio = match
                print(f'✓ {method} → {item["brand"]} ({ratio:.2f})')
                verified_rows.append({
                    'company_id':        cid,
                    'company_name':      cname,
                    'candidate_name_ko': name_ko,
                    'candidate_name_en': name_en,
                    'confidence_llm':    conf_llm,
                    'musinsa_slug':      item['brand'],
                    'musinsa_brand_name': item.get('brandName', ''),
                    'musinsa_brand_url': item.get('brandLinkUrl', ''),
                    'match_method':      method,
                    'match_ratio':       ratio,
                })
            else:
                print(f'— not found ({len(items)} hits)')
                not_found_rows.append({
                    'company_id':          cid,
                    'company_name':        cname,
                    'candidate_name_ko':   name_ko,
                    'candidate_name_en':   name_en,
                    'confidence_llm':      conf_llm,
                    'reasoning_llm':       reasoning,
                    'musinsa_search_hits': len(items),
                })

            if i < len(candidates):
                time.sleep(_RATE_DELAY_SEC)

    # 저장
    _VERIFIED_CSV.parent.mkdir(parents=True, exist_ok=True)
    with _VERIFIED_CSV.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=_VERIFIED_FIELDS)
        writer.writeheader()
        writer.writerows(verified_rows)

    with _NOT_FOUND_CSV.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=_NOT_FOUND_FIELDS)
        writer.writeheader()
        writer.writerows(not_found_rows)

    exact_cnt = sum(1 for r in verified_rows if r['match_method'].startswith('exact'))
    fuzzy_cnt = sum(1 for r in verified_rows if r['match_method'].startswith('fuzzy'))

    print('\n' + '=' * 60)
    print(f'완료  총={len(candidates)}  verified={len(verified_rows)}  not_found={len(not_found_rows)}')
    print(f'  exact={exact_cnt}  fuzzy={fuzzy_cnt}')
    print(f'\nverified CSV: {_VERIFIED_CSV}')
    print(f'not_found CSV: {_NOT_FOUND_CSV}')


def main() -> None:
    parser = argparse.ArgumentParser(description='무신사 브랜드 검색 API 검증 CLI')
    parser.add_argument('--input', default=str(_IN_CSV), help='입력 CSV 경로')
    args = parser.parse_args()
    _run(Path(args.input))


if __name__ == '__main__':
    main()
