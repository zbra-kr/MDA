#!/usr/bin/env python3
"""
scripts/build_pdf_target_list.py — Phase 1.7 단계 B 검증.

PDF 파싱 대상 회사 목록 생성 → /tmp/pdf_targets.csv 출력.

DB(disclosures) 에 kind='F' 데이터 없으면 DART 직접 조회.

실행:
    cd /Users/macmini/projects/MDA
    worker/.venv/bin/python3 scripts/build_pdf_target_list.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv('worker/.env')

import OpenDartReader
from worker.dart.config import get_dart_api_key
from worker.dart.pdf_parsing.target_selector import (
    print_targets_table,
    select_pdf_targets,
    select_pdf_targets_via_dart,
)
from worker.ingest.supabase_writer import get_client

OUT_PATH = Path('/tmp/pdf_targets.csv')


def main() -> None:
    print('=' * 60)
    print('  Phase 1.7 단계 B — PDF 파싱 대상 회사 선정')
    print('=' * 60)

    client = get_client()

    # DB 우선
    print('\n[1] DB(disclosures) 에서 감사보고서 공시 조회...')
    targets = select_pdf_targets(client)

    if not targets:
        print('  → DB 에 감사보고서 없음 (kind=F 미수집). DART 직접 조회로 전환.')
        print('\n[2] DART API 직접 조회 (46개사 × 0.5s — 약 23초)...')
        dart = OpenDartReader(get_dart_api_key())
        targets = select_pdf_targets_via_dart(client, dart, start_date='2016-01-01')
    else:
        print(f'  → DB 에서 {len(targets)}개사 감사보고서 확인.')

    if not targets:
        print('\n[결과] PDF 파싱 대상 없음')
        sys.exit(0)

    print_targets_table(targets)

    # 자사(비케이브) 확인
    bcave = next(
        (t for t in targets if '비케이브' in t.company_name or t.corp_code == '01461509'),
        None,
    )
    if bcave:
        print('[자사] 비케이브 포함:')
        print(f'  company_id:         {bcave.company_id}')
        print(f'  corp_code:          {bcave.corp_code}')
        print(f'  audit_report_count: {bcave.audit_report_count}건')
        print(f'  latest_audit_date:  {bcave.latest_audit_date}')
        print(f'  latest_rcept_no:    {bcave.latest_audit_rcept_no}')
    else:
        print('[자사] ⚠️ 비케이브 미포함 — 감사보고서 공시 없거나 이미 재무 데이터 있음')

    # CSV 출력
    fieldnames = [
        'company_id', 'name', 'listing_type', 'corp_code',
        'audit_report_count', 'latest_audit', 'latest_rcept_no',
    ]
    with OUT_PATH.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for t in targets:
            writer.writerow({
                'company_id': t.company_id,
                'name': t.company_name,
                'listing_type': t.listing_type or '',
                'corp_code': t.corp_code,
                'audit_report_count': t.audit_report_count,
                'latest_audit': t.latest_audit_date.isoformat() if t.latest_audit_date else '',
                'latest_rcept_no': t.latest_audit_rcept_no or '',
            })

    print(f'\nCSV 출력: {OUT_PATH}  ({len(targets)}행)')
    print('=' * 60)


if __name__ == '__main__':
    main()
