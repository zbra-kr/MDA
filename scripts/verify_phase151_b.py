"""
scripts/verify_phase151_b.py — Phase 1.5.1 Stage B 단일 분류 검증.

3개 brand 분류 결과를 출력하고 사람 검토용으로 공유한다.
(적재 안 함)

실행:
    worker/.venv/bin/python3 scripts/verify_phase151_b.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# worker 패키지 경로 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from worker.enrichment.brand_metadata import _get_client, _load_env, classify_brand
from worker.ingest.supabase_writer import get_client as get_supabase

_load_env()

_VERIFY_SLUGS = ['covernat', 'musinsastandard', 'nike']


def _print_result(meta) -> None:
    print(f'  description:     {meta.description}')
    print(f'  brand_category:  {meta.brand_category}')
    print(f'  price_tier:      {meta.price_tier}')
    print(f'  target_age:      {meta.target_age}')
    print(f'  target_gender:   {meta.target_gender}')
    print(f'  hq_country:      {meta.hq_country}')
    print(f'  confidence:      {meta.confidence}')
    print(f'  reasoning:       {meta.reasoning}')


def main() -> None:
    supabase = get_supabase()
    client = _get_client()

    resp = (
        supabase.table('brands')
        .select('id, slug, name')
        .in_('slug', _VERIFY_SLUGS)
        .execute()
    )
    found = {b['slug']: b for b in (resp.data or [])}

    print('\n' + '=' * 65)
    print('Phase 1.5.1 Stage B — 단일 분류 검증 (3개 brand)')
    print('=' * 65)

    for slug in _VERIFY_SLUGS:
        b = found.get(slug)
        if b is None:
            print(f'\n[SKIP] slug={slug!r} — DB에 없음')
            continue

        print(f'\n[{slug}] {b["name"]}')
        meta = classify_brand(b['id'], b['slug'], b['name'], client=client)
        if meta is None:
            print('  → 분류 실패 (FAIL)')
        else:
            _print_result(meta)

    print('\n' + '=' * 65)
    print('완료. 적재 안 함 (정호철 검토 후 --mode apply-from-csv 사용)')
    print('=' * 65)


if __name__ == '__main__':
    main()
