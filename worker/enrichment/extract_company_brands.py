"""
worker/enrichment/extract_company_brands.py — Phase 1.5.2 Stage A.

98개 companies 에서 LLM 으로 소속 brand 후보를 추출 → CSV 출력 (적재 없음).

모드:
    single    단일 회사 테스트 (company_id 로)
    bulk      전체 회사 → /tmp/company_brand_candidates.csv
    retry     지정 회사만 재시도 (max_tokens 확대) → 기존 CSV 에 append

실행 예시:
    worker/.venv/bin/python3 -m worker.enrichment.extract_company_brands \\
        --mode single --company-id <uuid>

    worker/.venv/bin/python3 -m worker.enrichment.extract_company_brands \\
        --mode bulk

    worker/.venv/bin/python3 -m worker.enrichment.extract_company_brands \\
        --mode retry --companies "LF,신세계인터내셔날"
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import anthropic
from loguru import logger
from worker.enrichment.brand_metadata import _get_client, _load_env
from worker.enrichment.prompts import EXTRACT_COMPANY_BRANDS_PROMPT
from worker.ingest.supabase_writer import get_client as get_supabase

_load_env()

_OUT_CSV = Path('/tmp/company_brand_candidates.csv')
_CSV_FIELDS = [
    'company_id', 'company_name', 'listing_type',
    'name_ko', 'name_en', 'confidence', 'reasoning',
]
_LLM_MODEL = 'claude-opus-4-5'
_MAX_TOKENS = 4096
_MAX_TOKENS_RETRY = 16384
_RATE_DELAY_SEC = 1.0  # LLM API (not scraping) — 1s 간격으로 충분


def _fetch_companies(supabase) -> list[dict]:
    resp = (
        supabase.table('companies')
        .select('id, name, listing_type, notes')
        .order('name')
        .execute()
    )
    return resp.data or []


def _extract_brands(
    company: dict,
    client: anthropic.Anthropic,
    max_tokens: int = _MAX_TOKENS,
) -> list[dict] | None:
    listing = '상장' if company.get('listing_type') == 'listed' else '비상장'
    prompt = EXTRACT_COMPANY_BRANDS_PROMPT.format(
        company_name=company.get('name', ''),
        listing_type=listing,
        notes=company.get('notes') or '없음',
    )
    try:
        msg = client.messages.create(
            model=_LLM_MODEL,
            max_tokens=max_tokens,
            messages=[{'role': 'user', 'content': prompt}],
        )
        raw = msg.content[0].text.strip()
        # JSON 블록 추출 (```json ... ``` 감싸는 경우)
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        data = json.loads(raw)
        return data.get('brands', [])
    except Exception as exc:
        logger.warning(f'extract_brands_error: company={company.get("name")} err={exc}')
        return None


def _run_single(company_id: str, client: anthropic.Anthropic, supabase) -> None:
    resp = (
        supabase.table('companies')
        .select('id, name, listing_type, notes')
        .eq('id', company_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        print(f'[ERROR] company not found: id={company_id}')
        sys.exit(1)

    company = resp.data[0]
    print(f'\n=== 단일 추출: {company["name"]} ===')
    brands = _extract_brands(company, client)
    if brands is None:
        print('[FAIL] 추출 실패')
        sys.exit(1)
    if not brands:
        print('[OK] brand 없음 (LLM 응답)')
        return
    for b in brands:
        print(f'  {b.get("name_ko")} / {b.get("name_en")} [{b.get("confidence")}] — {b.get("reasoning")}')
    print(f'\n[OK] {len(brands)}개 후보 (적재 안 함)')


def _run_bulk(supabase, client: anthropic.Anthropic) -> None:
    companies = _fetch_companies(supabase)
    print(f'\n대상: {len(companies)}개 회사')
    print(f'출력: {_OUT_CSV}')
    print('=' * 60)

    rows_out: list[dict] = []
    fail_names: list[str] = []

    for i, company in enumerate(companies, 1):
        name = company.get('name', '')
        cid = company.get('id', '')
        print(f'[{i:3d}/{len(companies)}] {name} ...', end=' ', flush=True)

        brands = _extract_brands(company, client)
        if brands is None:
            print('FAIL')
            fail_names.append(name)
        elif not brands:
            print('0개')
        else:
            print(f'{len(brands)}개')
            listing = '상장' if company.get('listing_type') == 'listed' else '비상장'
            for b in brands:
                rows_out.append({
                    'company_id':   cid,
                    'company_name': name,
                    'listing_type': listing,
                    'name_ko':      b.get('name_ko', ''),
                    'name_en':      b.get('name_en', ''),
                    'confidence':   b.get('confidence', ''),
                    'reasoning':    b.get('reasoning', ''),
                })

        if i < len(companies):
            time.sleep(_RATE_DELAY_SEC)

    _OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with _OUT_CSV.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows_out)

    print('\n' + '=' * 60)
    print(f'완료  회사={len(companies)}  brand 후보={len(rows_out)}  실패={len(fail_names)}')
    if fail_names:
        print(f'실패 회사: {fail_names}')
    print(f'\nCSV 저장: {_OUT_CSV}')
    print('다음 단계: Stage B — 무신사 검색 API 검증')


def _run_retry(company_names: list[str], supabase, client: anthropic.Anthropic) -> None:
    """지정 회사들만 재추출 (max_tokens 확대) → 기존 CSV 에 append."""
    all_companies = _fetch_companies(supabase)
    targets = [c for c in all_companies if c.get('name', '') in company_names]
    missing = set(company_names) - {c['name'] for c in targets}
    if missing:
        print(f'[WARN] DB에서 찾지 못한 회사: {missing}')

    print(f'\n재시도 대상: {len(targets)}개 회사 (max_tokens={_MAX_TOKENS_RETRY})')
    print(f'append 대상: {_OUT_CSV}')
    print('=' * 60)

    rows_out: list[dict] = []
    fail_names: list[str] = []

    for i, company in enumerate(targets, 1):
        name = company.get('name', '')
        cid = company.get('id', '')
        print(f'[{i}/{len(targets)}] {name} ...', end=' ', flush=True)

        brands = _extract_brands(company, client, max_tokens=_MAX_TOKENS_RETRY)
        if brands is None:
            print('FAIL')
            fail_names.append(name)
        elif not brands:
            print('0개')
        else:
            print(f'{len(brands)}개')
            listing = '상장' if company.get('listing_type') == 'listed' else '비상장'
            for b in brands:
                rows_out.append({
                    'company_id':   cid,
                    'company_name': name,
                    'listing_type': listing,
                    'name_ko':      b.get('name_ko', ''),
                    'name_en':      b.get('name_en', ''),
                    'confidence':   b.get('confidence', ''),
                    'reasoning':    b.get('reasoning', ''),
                })

        if i < len(targets):
            time.sleep(_RATE_DELAY_SEC)

    # 기존 CSV 에 append
    write_header = not _OUT_CSV.exists()
    with _OUT_CSV.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_FIELDS)
        if write_header:
            writer.writeheader()
        writer.writerows(rows_out)

    print('\n' + '=' * 60)
    print(f'재시도 완료  brand 후보={len(rows_out)}  실패={len(fail_names)}')
    if fail_names:
        print(f'여전히 실패: {fail_names}')
    print(f'CSV append: {_OUT_CSV}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Company brand 후보 추출 CLI')
    parser.add_argument('--mode', required=True, choices=['single', 'bulk', 'retry'])
    parser.add_argument('--company-id', help='대상 company UUID (single 모드)')
    parser.add_argument('--companies', help='재시도 회사명 콤마 구분 (retry 모드)')
    args = parser.parse_args()

    supabase = get_supabase()
    client = _get_client()

    if args.mode == 'single':
        if not args.company_id:
            parser.error('single 모드: --company-id 필수')
        _run_single(args.company_id, client, supabase)
    elif args.mode == 'bulk':
        _run_bulk(supabase, client)
    elif args.mode == 'retry':
        if not args.companies:
            parser.error('retry 모드: --companies 필수')
        names = [n.strip() for n in args.companies.split(',') if n.strip()]
        _run_retry(names, supabase, client)


if __name__ == '__main__':
    main()
