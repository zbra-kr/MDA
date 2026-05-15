"""
무신사 카테고리 코드 관리.

Supabase categories 테이블이 단일 진실원천(SoT).
main.py 는 get_active_codes() 로 DB에서 코드를 조회해 사용한다.

== API 실측 결과 (2026-05-15, httpx 직접 호출) ==

client.musinsa.com/api/home/web/v5/pans/ranking/sections/200 에 각 코드를
실제 GET 요청 후 PRODUCT_COLUMN 수를 카운트한 결과:

  코드   응답  상품수  판정
  ─────────────────────────────────────────────────────────────────────
  001    200   101    ✓ 상의 (seed 유지)
  002    200   101    ✓ 아우터 (seed 유지)
  003    200   101    ✓ 바지 (seed 유지)
  004    200   101    ✓ 가방 (seed 유지)
  017    200   101    ✓ 코드 유효 — seed name_kr '액세서리'가 오류 ('스포츠/레저' 정정 필요)
  018    200     0    ✗ 빈 응답 → is_active=false 처리 (올바른 신발 코드: 103)
  005    200     0    ✗ 빈 응답 → is_active=false 처리 (올바른 모자/소품 코드: 101)
  020    200     0    ✗ 빈 응답 → is_active=false 처리 (올바른 디지털/라이프 코드: 102)
  022    200     0    ✗ 빈 응답 → is_active=false 처리 (올바른 원피스/스커트 코드: 100)
  100    200   101    ✓ 원피스/스커트 (신규 추가 필요)
  101    200   101    ✓ 소품 (신규 추가 필요)
  102    200   101    ✓ 디지털/라이프 (신규 추가 필요)
  103    200   101    ✓ 신발 (신규 추가 필요)
  026    200   101    ✓ 속옷/홈웨어 (신규 추가 필요)
  106    200   101    ✓ 키즈 (신규 추가 필요)

== 정정 SQL (Supabase SQL Editor 에서 1회 실행 — 00007 마이그레이션으로 관리 권장) ==

  -- 1. 빈 응답 코드 비활성화
  update categories set is_active = false
  where musinsa_code in ('018', '005', '020', '022');

  -- 2. 이름 오류 보정 (코드 자체는 유효)
  update categories set name_kr = '스포츠/레저', parent_path = '스포츠/레저'
  where musinsa_code = '017';

  -- 3. 실측으로 확인된 정확한 코드 추가
  insert into categories (musinsa_code, name_kr, parent_path, depth, is_active) values
    ('026',    '속옷/홈웨어',     '속옷/홈웨어',         1, true),
    ('100',    '원피스/스커트',   '원피스/스커트',        1, true),
    ('101',    '소품',            '소품',                 1, true),
    ('102',    '디지털/라이프',   '디지털/라이프',        1, true),
    ('103',    '신발',            '신발',                 1, true),
    ('106',    '키즈',            '키즈',                 1, true),
    ('101001', '모자',            '소품 > 모자',          2, true),
    ('101002', '양말/레그웨어',   '소품 > 양말/레그웨어', 2, true),
    ('103003', '샌들/슬리퍼',     '신발 > 샌들/슬리퍼',   2, true),
    ('103004', '스니커즈',        '신발 > 스니커즈',      2, true),
    ('103005', '스포츠화',        '신발 > 스포츠화',      2, true)
  on conflict (musinsa_code) do nothing;

== depth-1 vs depth-2 주의 ==

depth-1('001' 상의) 수집 시 depth-2('001001' 반소매티셔츠) 상품이 포함된다.
두 코드를 모두 수집하면 같은 상품이 중복 적재된다 (ON CONFLICT로 덮어쓰기).
--categories all 은 depth=1 (대분류) 만 사용한다.
"""

from __future__ import annotations

from loguru import logger
from supabase import Client


def get_active_codes(client: Client, depth: int | None = None) -> list[str]:
    """categories 테이블에서 is_active=true 코드 목록을 반환한다.

    Args:
        client: Supabase 클라이언트 (service_role 권한)
        depth:  None=전체 | 1=대분류만 | 2=중분류만

    Returns:
        musinsa_code 문자열 목록 (depth ASC → musinsa_code ASC 정렬)
    """
    query = (
        client.table("categories")
        .select("musinsa_code, name_kr, depth")
        .eq("is_active", True)
        .order("depth")
        .order("musinsa_code")
    )
    if depth is not None:
        query = query.eq("depth", depth)

    res = query.execute()
    codes = [row["musinsa_code"] for row in (res.data or [])]

    logger.bind(
        count=len(codes),
        depth_filter=depth,
    ).debug("category_codes_loaded")

    return codes
