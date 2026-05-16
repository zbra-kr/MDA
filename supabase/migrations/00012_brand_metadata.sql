-- ============================================================
-- B.CAVE Competitor Radar - Brand 메타데이터 풍부화
-- Version: 1.0
-- Date: 2026-05-16
--
-- 적용 순서: 00011 이후 (이 파일)
--
-- 변경 내용:
--   brands 테이블에 컬럼 8개 추가.
--   시각화 (Phase 2 이후) 의 필터·축 인프라.
--   자사·98사·주요 brand 만 적용 (약 200~400개 추정).
--
-- 결정 배경:
--   - 카테고리·가격대·타겟 성별·본사 국가 4개 enum → 필터 조건으로 사용
--   - 설명·타겟 연령은 자유 텍스트 (정형화 어려움)
--   - metadata_source: manual=사람, llm=자동, verified=llm+사람 검증
--   - 기존 brands.tier 컬럼은 계속 유지 (제거·변경 안 함)
--
-- 설계 문서: docs/skills/10-pdf-parsing.md 는 아니지만,
--            Phase 1.5.1 신설. 관련 ADR 필요 시 추가.
-- ============================================================

alter table brands
  add column if not exists description          text,
  add column if not exists brand_category       text
    check (brand_category in (
      '스트릿', '캐주얼', '럭셔리', '아웃도어',
      '스포츠', '골프', '언더웨어', '아동',
      '액세서리', '슈즈', '백·가방', '기타'
    )),
  add column if not exists price_tier           text
    check (price_tier in ('저가', '중가', '프리미엄', '럭셔리')),
  add column if not exists target_age           text,
  add column if not exists target_gender        text
    check (target_gender in ('남성', '여성', '유니섹스', '아동')),
  add column if not exists hq_country           text
    check (hq_country in (
      '한국', '미국', '일본', '프랑스', '이탈리아',
      '독일', '영국', '중국', '기타'
    )),
  add column if not exists metadata_enriched_at timestamptz,
  add column if not exists metadata_source      text
    check (metadata_source in ('manual', 'llm', 'verified'));

comment on column brands.description          is '한 줄 brand 설명 (자유 텍스트)';
comment on column brands.brand_category       is '주요 카테고리 (enum, 시각화 필터)';
comment on column brands.price_tier           is '가격대 (enum, 시각화 필터)';
comment on column brands.target_age           is '타겟 연령대 (자유 텍스트, 예: "20대~30대")';
comment on column brands.target_gender        is '타겟 성별 (enum)';
comment on column brands.hq_country           is '본사 위치 (enum)';
comment on column brands.metadata_enriched_at is 'LLM 분류 또는 수동 입력 시점';
comment on column brands.metadata_source      is 'manual=사람 직접 입력 | llm=LLM 자동 | verified=LLM+사람 검증';

create index if not exists brands_category_idx
  on brands(brand_category);

create index if not exists brands_price_tier_idx
  on brands(price_tier);

create index if not exists brands_target_gender_idx
  on brands(target_gender);

create index if not exists brands_hq_country_idx
  on brands(hq_country);
