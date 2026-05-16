-- ============================================================
-- Phase 1.5.1 — 풍부화 대상 brand 선정 (정정 2026-05-16)
-- 00012_brand_metadata.sql 적용 후 실행
--
-- 선정 기준 (합집합):
--   (1) 자사 brand (is_own=true)
--   (2) 98사 권한 brand (company_id IS NOT NULL)
--   (3) 주요 brand: 스크래핑 누적 제품 10개 이상
--
-- 변경: TOP100 이력 기준 제거, product_count >= 10 단일 기준으로 통합
-- ============================================================

-- ① inclusion_reason 별 분포 확인
with product_counts as (
  select
    b.id, b.slug, b.name, b.is_own, b.company_id,
    count(p.id) as product_count
  from brands b
  left join products p on p.brand_id = b.id
  group by b.id, b.slug, b.name, b.is_own, b.company_id
),
targets as (
  select
    id, slug, name, is_own, company_id, product_count,
    case
      when is_own                  then '자사'
      when company_id is not null  then '98사 권한'
      when product_count >= 10     then '제품 10+'
    end as inclusion_reason
  from product_counts
  where is_own             = true
     or company_id is not null
     or product_count >= 10
)
select
  inclusion_reason,
  count(*) as brand_count
from targets
group by inclusion_reason
order by inclusion_reason;
-- 기대:
--   자사      = 3 (커버낫·리·와키윌리) — seed.sql 기준
--   98사 권한 = 약 15
--   제품 10+  = 약 30~40
--   합계      = 약 50~60


-- ② 전체 대상 목록 (brand별 + 현재 enrichment 상태)
with product_counts as (
  select
    b.id, b.slug, b.name, b.is_own, b.company_id,
    count(p.id) as product_count
  from brands b
  left join products p on p.brand_id = b.id
  group by b.id, b.slug, b.name, b.is_own, b.company_id
)
select
  b.id,
  pc.slug,
  pc.name,
  pc.is_own,
  pc.company_id is not null   as has_company,
  pc.product_count,
  case
    when pc.is_own                  then '자사'
    when pc.company_id is not null  then '98사 권한'
    else                                 '제품 10+'
  end                         as inclusion_reason,
  b.brand_category,
  b.price_tier,
  b.target_gender,
  b.hq_country,
  b.metadata_source
from brands b
join product_counts pc on pc.id = b.id
where pc.is_own             = true
   or pc.company_id is not null
   or pc.product_count >= 10
order by
  pc.is_own desc,
  (pc.company_id is not null) desc,
  pc.product_count desc,
  pc.name;
