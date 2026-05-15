-- ============================================================
-- B.CAVE Competitor Radar - Companies Master + Brand Linkage
-- Version: 1.0
-- Date: 2026-05-15
--
-- 적용 순서: 00001 → 00002 → 00004 → 00003 → 00005 → 00006 (마지막)
--
-- 변경 내용:
--   1. companies 테이블 신규 생성 (상장 49 + 비상장 49 = 98개)
--   2. brands 에 company_id, company_mapping_confidence 컬럼 추가
--   3. v_company_brand_summary 헬퍼 뷰 생성
--   4. company_brand_mapping_log 추적 테이블 생성
-- ============================================================


-- ============================================================
-- 1. companies 테이블
-- ============================================================

create table companies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  name_alt              text,
  is_own                boolean default false,
  listing_type          text not null
                          check (listing_type in ('listed','unlisted')),

  -- 재무 (백만원 단위, 출처: DART 2026.04 기준)
  revenue_2025_mkrw     bigint,
  revenue_2024_mkrw     bigint,
  revenue_yoy_pct       numeric(5,1),
  op_income_2025_mkrw   bigint,
  op_income_2024_mkrw   bigint,
  op_income_yoy_pct     numeric(8,1),   -- 적자전환 시 절댓값 클 수 있음 (-856.0 등)
  op_margin_2025_pct    numeric(5,1),

  -- 메타
  op_status_note        text,
  fiscal_note           text,
  notes                 text,

  source                text default 'dart_2026_04',
  created_at            timestamptz default now()
);

create unique index companies_name_uniq    on companies(name);
create index companies_is_own_idx          on companies(is_own) where is_own = true;
create index companies_listing_idx         on companies(listing_type);

comment on table companies is
  '패션 회사 마스터. 상장 49 + 비상장 49 = 98건. 재무 출처: DART 2026.04.';
comment on column companies.is_own is
  '자사 여부. 비케이브(B.CAVE) 1건.';
comment on column companies.op_income_yoy_pct is
  '영업이익 YoY (%). 적자전환 시 -856.0 같은 큰 음수 가능. numeric(8,1).';


-- ============================================================
-- 2. brands 테이블 — company_id, company_mapping_confidence 추가
-- ============================================================

alter table brands
  add column if not exists company_id                  uuid references companies(id),
  add column if not exists company_mapping_confidence  text
    check (company_mapping_confidence in ('high','medium','low','unknown'));

create index if not exists brands_company_idx
  on brands(company_id)
  where company_id is not null;

comment on column brands.company_id is
  '소속 회사 FK. 00006 마이그레이션으로 도입. seed 매핑 후 운영자가 viewer 에서 보정 가능.';
comment on column brands.company_mapping_confidence is
  '회사 매핑 신뢰도. high=확정, medium=확인필요, low=추정, unknown=조사필요.';


-- ============================================================
-- 3. company_brand_mapping_log — 매핑 시도 추적용
-- ============================================================

create table if not exists company_brand_mapping_log (
  id             serial primary key,
  company_name   text,
  brand_name     text,
  brand_slug_guess text,
  confidence     text,
  matched        boolean,
  brand_id       uuid,
  created_at     timestamptz default now()
);

comment on table company_brand_mapping_log is
  'seed_companies.sql 실행 시 브랜드 매핑 시도 결과. 검토 후 drop 가능.';


-- ============================================================
-- 4. RLS
-- ============================================================

alter table companies enable row level security;
create policy "anon read companies"
  on companies for select to anon using (true);

alter table company_brand_mapping_log enable row level security;
create policy "anon read mapping log"
  on company_brand_mapping_log for select to anon using (true);


-- ============================================================
-- 5. 헬퍼 뷰 — 회사별 브랜드 현황
-- ============================================================

create or replace view v_company_brand_summary as
select
  c.id,
  c.name,
  c.is_own,
  c.listing_type,
  c.op_margin_2025_pct,
  c.op_status_note,
  count(b.id)                                                    as brand_count,
  count(b.id) filter (where b.musinsa_brand_id is not null)      as musinsa_present_count
from companies c
left join brands b on b.company_id = c.id
group by c.id, c.name, c.is_own, c.listing_type,
         c.op_margin_2025_pct, c.op_status_note;

grant select on v_company_brand_summary to anon;
grant select on v_company_brand_summary to authenticated;
