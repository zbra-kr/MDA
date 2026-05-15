"""
worker/dart/pdf_parsing/target_selector.py — Phase 1.7 단계 B.

disclosures.disclosure_type='F' (외부감사관련) 기반으로
finstate API 응답 없는 회사 중 감사보고서 공시가 있는 회사를 선정한다.
이 회사들이 감사보고서 XML 파싱 부트스트랩 대상이 된다.

전제: bootstrap-disclosures (kind='F' 포함) 완료 후 사용.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from loguru import logger
from supabase import Client


@dataclass
class CompanyTarget:
    """감사보고서 XML 파싱 대상 회사 1개."""

    company_id: str
    name: str
    corp_code: str
    listing_type: str | None
    audit_count: int
    oldest_audit: date | None
    latest_audit: date | None
    audit_rcept_nos: list[str] = field(default_factory=list)   # 최신순 정렬


def select_audit_targets(client: Client) -> list[CompanyTarget]:
    """감사보고서 XML 파싱 대상 회사 목록 반환.

    조건:
    1. dart_corp_codes 에 등록된 회사 (DART 수집 대상)
    2. company_financials_history 에 행이 없음 (finstate API 응답 없음)
    3. disclosures.disclosure_type='F' 공시 1건 이상 있음

    Returns:
        audit_count 내림차순 정렬된 CompanyTarget 목록
    """
    # 1. 전체 DART 등록 회사
    corps_res = (
        client.table('dart_corp_codes')
        .select('company_id, corp_code')
        .execute()
    )
    all_corps: list[dict] = corps_res.data or []
    if not all_corps:
        logger.warning('dart_corp_codes 비어 있음')
        return []

    corp_by_id = {c['company_id']: c['corp_code'] for c in all_corps}
    all_ids = list(corp_by_id.keys())
    logger.info(f'dart_corp_codes: {len(all_ids)}개사')

    # 2. finstate 재무 보유 company_id 집합
    fin_res = (
        client.table('company_financials_history')
        .select('company_id')
        .in_('company_id', all_ids)
        .execute()
    )
    has_fin: set[str] = {r['company_id'] for r in (fin_res.data or [])}
    no_fin_ids = [cid for cid in all_ids if cid not in has_fin]
    logger.info(f'재무 보유 {len(has_fin)}개사 / 미보유 {len(no_fin_ids)}개사')

    if not no_fin_ids:
        return []

    # 3. disclosure_type='F' 공시 조회 (부트스트랩 후 DB 기반)
    f_res = (
        client.table('disclosures')
        .select('company_id, rcept_no, rcept_dt')
        .in_('company_id', no_fin_ids)
        .eq('disclosure_type', 'F')
        .order('rcept_dt', desc=True)
        .execute()
    )
    f_rows: list[dict] = f_res.data or []
    if not f_rows:
        logger.warning('disclosure_type=F 공시 없음. bootstrap-disclosures (kind=F) 완료 후 재실행.')
        return []

    # 4. company_id 별 그룹화
    by_company: dict[str, list[dict]] = defaultdict(list)
    for row in f_rows:
        by_company[row['company_id']].append(row)

    target_ids = list(by_company.keys())
    logger.info(f'감사보고서 공시 보유 회사: {len(target_ids)}개사')

    # 5. companies 메타데이터 조회
    comp_res = (
        client.table('companies')
        .select('id, name, listing_type')
        .in_('id', target_ids)
        .execute()
    )
    comp_meta: dict[str, dict] = {r['id']: r for r in (comp_res.data or [])}

    # 6. CompanyTarget 조립
    targets: list[CompanyTarget] = []
    for cid, rows in by_company.items():
        # rows 는 rcept_dt 내림차순 정렬 (step 3 에서 order 지정)
        meta = comp_meta.get(cid, {})

        def _to_date(s: str) -> date | None:
            try:
                return date.fromisoformat(s)
            except (ValueError, TypeError):
                return None

        targets.append(CompanyTarget(
            company_id=cid,
            name=meta.get('name', ''),
            corp_code=corp_by_id.get(cid, ''),
            listing_type=meta.get('listing_type'),
            audit_count=len(rows),
            oldest_audit=_to_date(rows[-1]['rcept_dt']),
            latest_audit=_to_date(rows[0]['rcept_dt']),
            audit_rcept_nos=[r['rcept_no'] for r in rows],
        ))

    targets.sort(key=lambda t: t.audit_count, reverse=True)
    logger.info(f'파싱 대상 확정: {len(targets)}개사')
    return targets


def print_targets_table(targets: list[CompanyTarget]) -> None:
    """선정 결과 표 출력."""
    print(f"\n{'#':>3}  {'회사명':<22}  {'corp_code':>10}  {'상장구분':>8}  {'감사보고서':>6}  {'최초공시':>12}  {'최신공시'}")
    print('-' * 96)
    for i, t in enumerate(targets, 1):
        listing = t.listing_type or '-'
        oldest = t.oldest_audit.isoformat() if t.oldest_audit else '-'
        latest = t.latest_audit.isoformat() if t.latest_audit else '-'
        print(f"{i:>3}  {t.name:<22}  {t.corp_code:>10}  {listing:>8}  {t.audit_count:>6}건  {oldest:>12}  {latest}")
    print('-' * 96)
    print(f"합계: {len(targets)}개사\n")
