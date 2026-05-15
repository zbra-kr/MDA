#!/usr/bin/env python3
"""
scripts/build_audit_target_list.py — Phase 1.7 단계 B 검증.

감사보고서 XML 파싱 대상 회사 목록 생성 → /tmp/audit_targets.csv 출력.

실행:
    cd /Users/macmini/projects/MDA
    worker/.venv/bin/python3 scripts/build_audit_target_list.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv('worker/.env')

from worker.dart.pdf_parsing.target_selector import print_targets_table, select_audit_targets
from worker.ingest.supabase_writer import get_client

OUT_PATH = Path('/tmp/audit_targets.csv')


def main() -> None:
    print('=' * 60)
    print('  Phase 1.7 단계 B — 감사보고서 파싱 대상 회사 선정')
    print('=' * 60)

    client = get_client()
    targets = select_audit_targets(client)

    if not targets:
        print('\n[결과] 대상 없음')
        sys.exit(0)

    print_targets_table(targets)

    # listing_type 분포
    from collections import Counter
    dist = Counter(t.listing_type or '-' for t in targets)
    print('listing_type 분포:')
    for lt, cnt in dist.most_common():
        print(f'  {lt}: {cnt}개사')
    print()

    # 자사(비케이브) 확인
    bcave = next(
        (t for t in targets if '비케이브' in t.name or t.corp_code == '01461509'),
        None,
    )
    if bcave:
        print('[자사] 비케이브 포함:')
        print(f'  audit_count:  {bcave.audit_count}건')
        print(f'  oldest_audit: {bcave.oldest_audit}')
        print(f'  latest_audit: {bcave.latest_audit}')
        print(f'  latest_rcept_no: {bcave.audit_rcept_nos[0]}')
    else:
        print('[자사] ⚠️ 비케이브 미포함')

    # CSV 출력
    fieldnames = [
        'company_id', 'name', 'listing_type', 'corp_code',
        'audit_count', 'oldest_audit', 'latest_audit', 'latest_rcept_no',
    ]
    with OUT_PATH.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for t in targets:
            writer.writerow({
                'company_id': t.company_id,
                'name': t.name,
                'listing_type': t.listing_type or '',
                'corp_code': t.corp_code,
                'audit_count': t.audit_count,
                'oldest_audit': t.oldest_audit.isoformat() if t.oldest_audit else '',
                'latest_audit': t.latest_audit.isoformat() if t.latest_audit else '',
                'latest_rcept_no': t.audit_rcept_nos[0] if t.audit_rcept_nos else '',
            })

    print(f'\nCSV 출력: {OUT_PATH}  ({len(targets)}행)')
    print('=' * 60)


if __name__ == '__main__':
    main()
