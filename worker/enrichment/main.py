"""
worker/enrichment/main.py — Phase 1.5.1 Brand 메타데이터 풍부화 CLI.

모드:
    single            단일 brand 분류 결과 출력 (적재 안 함)
    bulk-classify     대상 brand 전체 분류 → CSV 출력 (적재 안 함)
    apply-from-csv    사람 검증한 CSV → brands 테이블 UPDATE

실행 예시:
    # 단일 검증
    worker/.venv/bin/python3 -m worker.enrichment.main \\
        --mode single --brand-slug covernat

    # 전체 분류 (CSV 출력, 적재 안 함)
    worker/.venv/bin/python3 -m worker.enrichment.main --mode bulk-classify

    # 검증 완료 CSV 적재 (정호철 승인 후)
    worker/.venv/bin/python3 -m worker.enrichment.main \\
        --mode apply-from-csv --csv /tmp/brand_enrichment_verified.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import anthropic
from loguru import logger
from worker.enrichment.brand_metadata import BrandMetadata, _get_client, _load_env, classify_brand
from worker.ingest.supabase_writer import get_client as get_supabase

_load_env()

_BULK_CSV_PATH = Path('/tmp/brand_enrichment.csv')
_PENDING_CSV_PATH = Path('/tmp/brand_enrichment_pending_review.csv')

_CSV_FIELDS = [
    'brand_id', 'slug', 'name',
    'description', 'brand_category', 'price_tier',
    'target_age', 'target_gender', 'hq_country',
    'confidence', 'reasoning',
]


def _fetch_targets(supabase) -> list[dict]:
    """풍부화 대상 brand 목록 조회.

    기준: is_own=true OR company_id IS NOT NULL OR product_count >= 10
    """
    # 제품 수가 10개 이상인 brand_id 집합
    prod_resp = (
        supabase.table('products')
        .select('brand_id')
        .execute()
    )
    prod_counts = Counter(r['brand_id'] for r in (prod_resp.data or []))
    prod10_ids = {bid for bid, cnt in prod_counts.items() if cnt >= 10}

    # brands 전체 조회
    resp = (
        supabase.table('brands')
        .select('id, slug, name, is_own, company_id, brand_category, metadata_source')
        .execute()
    )
    brands = resp.data or []

    targets = [
        b for b in brands
        if b.get('is_own')
        or b.get('company_id') is not None
        or b['id'] in prod10_ids
    ]
    return targets


def _print_result(meta: BrandMetadata) -> None:
    print(f'  slug:            {meta.slug}')
    print(f'  name:            {meta.name}')
    print(f'  description:     {meta.description}')
    print(f'  brand_category:  {meta.brand_category}')
    print(f'  price_tier:      {meta.price_tier}')
    print(f'  target_age:      {meta.target_age}')
    print(f'  target_gender:   {meta.target_gender}')
    print(f'  hq_country:      {meta.hq_country}')
    print(f'  confidence:      {meta.confidence}')
    print(f'  reasoning:       {meta.reasoning}')


def _run_single(brand_slug: str) -> None:
    supabase = get_supabase()
    resp = (
        supabase.table('brands')
        .select('id, slug, name')
        .eq('slug', brand_slug)
        .limit(1)
        .execute()
    )
    if not resp.data:
        print(f'[ERROR] brand not found: slug={brand_slug!r}')
        sys.exit(1)

    b = resp.data[0]
    client = _get_client()

    print(f'\n=== 단일 분류: {b["name"]} ({brand_slug}) ===')
    meta = classify_brand(b['id'], b['slug'], b['name'], client=client)
    if meta is None:
        print('[FAIL] 분류 실패')
        sys.exit(1)
    _print_result(meta)
    print('\n[OK] 적재 안 함 (single 모드)')


def _run_bulk(supabase, llm_client: anthropic.Anthropic) -> None:
    """전체 대상 brand 분류 → CSV 저장 (적재 없음)."""
    targets = _fetch_targets(supabase)
    print(f'\n대상: {len(targets)}개 brand')
    print(f'출력: {_BULK_CSV_PATH}')
    print('=' * 60)

    results: list[BrandMetadata] = []
    fail_slugs: list[str] = []
    token_acc: list[tuple[int, int]] = []

    for i, b in enumerate(targets, 1):
        slug = b.get('slug', '')
        name = b.get('name', '')
        bid  = b.get('id', '')
        print(f'[{i:3d}/{len(targets)}] {name} ({slug}) ...', end=' ', flush=True)

        meta = classify_brand(bid, slug, name, client=llm_client, _token_acc=token_acc)
        if meta is None:
            print('FAIL')
            fail_slugs.append(slug)
            continue

        results.append(meta)
        print(f'OK ({meta.confidence})')

    # CSV 저장
    _BULK_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _BULK_CSV_PATH.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_FIELDS)
        writer.writeheader()
        for m in results:
            writer.writerow({
                'brand_id':       m.brand_id,
                'slug':           m.slug,
                'name':           m.name,
                'description':    m.description,
                'brand_category': m.brand_category,
                'price_tier':     m.price_tier,
                'target_age':     m.target_age,
                'target_gender':  m.target_gender,
                'hq_country':     m.hq_country,
                'confidence':     m.confidence,
                'reasoning':      m.reasoning,
            })

    print('\n' + '=' * 60)
    print(f'완료  성공={len(results)}  실패={len(fail_slugs)}')
    if fail_slugs:
        print(f'실패 slug: {fail_slugs}')
    print(f'\nCSV 저장: {_BULK_CSV_PATH}')
    print('검증 후 적재: --mode apply-from-csv --csv /tmp/brand_enrichment_verified.csv')

    if token_acc:
        total_in  = sum(t[0] for t in token_acc)
        total_out = sum(t[1] for t in token_acc)
        est_cost  = total_in / 1_000_000 * 3.0 + total_out / 1_000_000 * 15.0
        print(f'[anthropic] session total: in={total_in:,}, out={total_out:,}, est_cost=${est_cost:.4f}')


def _run_apply_high(csv_path: Path, supabase) -> None:
    """bulk-classify CSV 중 confidence='high' 행만 brands 테이블 UPDATE.

    metadata_source = 'llm'  (사람 검증 없음)
    medium/low 행은 _PENDING_CSV_PATH 로 분리 저장.
    """
    if not csv_path.exists():
        print(f'[ERROR] CSV 없음: {csv_path}')
        sys.exit(1)

    now = datetime.now(UTC).isoformat()
    ok = 0
    fail = 0
    pending_rows: list[dict] = []

    with csv_path.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    for row in rows:
        bid = row.get('brand_id', '').strip()
        if not bid:
            continue
        if row.get('confidence') != 'high':
            pending_rows.append(row)
            continue

        payload = {
            'description':          row.get('description', ''),
            'brand_category':       row.get('brand_category', ''),
            'price_tier':           row.get('price_tier', ''),
            'target_age':           row.get('target_age', ''),
            'target_gender':        row.get('target_gender', ''),
            'hq_country':           row.get('hq_country', ''),
            'metadata_source':      'llm',
            'metadata_enriched_at': now,
        }
        try:
            supabase.table('brands').update(payload).eq('id', bid).execute()
            ok += 1
            logger.bind(slug=row.get('slug')).debug('brand_metadata_high_applied')
        except Exception as exc:
            logger.warning(f'brand_metadata_apply_error: {exc}')
            fail += 1

    # medium/low 는 별도 CSV 저장 (사람 검증 단계)
    if pending_rows:
        pending_fields = _CSV_FIELDS + ['llm_suggestion_accepted']
        _PENDING_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _PENDING_CSV_PATH.open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=pending_fields)
            writer.writeheader()
            for r in pending_rows:
                r['llm_suggestion_accepted'] = 'yes'  # 기본값 yes, 정호철이 no 로 변경 가능
                writer.writerow({k: r.get(k, '') for k in pending_fields})

    print(f'\n완료  high 적재={ok}  실패={fail}  medium/low 보류={len(pending_rows)}')
    if pending_rows:
        print(f'검토 CSV: {_PENDING_CSV_PATH}')
        print(f'적재 명령: worker/.venv/bin/python3 -m worker.enrichment.main --mode apply-from-csv --csv {_PENDING_CSV_PATH}')


def _run_apply(csv_path: Path, supabase) -> None:
    """검증 완료 CSV → brands 테이블 UPDATE."""
    if not csv_path.exists():
        print(f'[ERROR] CSV 없음: {csv_path}')
        sys.exit(1)

    now = datetime.now(UTC).isoformat()
    ok = 0
    fail = 0

    with csv_path.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            bid = row.get('brand_id', '').strip()
            if not bid:
                continue
            payload = {
                'description':          row.get('description', ''),
                'brand_category':       row.get('brand_category', ''),
                'price_tier':           row.get('price_tier', ''),
                'target_age':           row.get('target_age', ''),
                'target_gender':        row.get('target_gender', ''),
                'hq_country':           row.get('hq_country', ''),
                'metadata_source':      'verified',
                'metadata_enriched_at': now,
            }
            try:
                supabase.table('brands').update(payload).eq('id', bid).execute()
                ok += 1
                logger.bind(slug=row.get('slug')).debug('brand_metadata_applied')
            except Exception as exc:
                logger.warning(f'brand_metadata_apply_error: {exc}')
                fail += 1

    print(f'\n완료  업데이트={ok}  실패={fail}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Brand 메타데이터 풍부화 CLI')
    parser.add_argument('--mode', required=True,
                        choices=['single', 'bulk-classify', 'apply-auto-high', 'apply-from-csv'])
    parser.add_argument('--brand-slug', help='대상 slug (single 모드)')
    parser.add_argument('--csv', help='입력 CSV 경로 (apply-from-csv 모드)',
                        default=str(_BULK_CSV_PATH))
    args = parser.parse_args()

    if args.mode == 'single':
        if not args.brand_slug:
            parser.error('single 모드: --brand-slug 필수')
        _run_single(args.brand_slug)

    elif args.mode == 'bulk-classify':
        supabase = get_supabase()
        llm = _get_client()
        _run_bulk(supabase, llm)

    elif args.mode == 'apply-auto-high':
        supabase = get_supabase()
        _run_apply_high(Path(args.csv), supabase)

    elif args.mode == 'apply-from-csv':
        supabase = get_supabase()
        _run_apply(Path(args.csv), supabase)


if __name__ == '__main__':
    main()
