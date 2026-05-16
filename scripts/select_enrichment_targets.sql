-- ============================================================
-- Phase 1.5.1 — 풍부화 대상 brand 선정
-- 00012_brand_metadata.sql 적용 후 실행
--
-- 선정 기준 (합집합):
--   (1) 자사 brand (is_own=true)
--   (2) 98사 권한 brand (company_id NOT NULL)
--   (3) 주요 brand: 랭킹 TOP 100 등장 이력 있음
--       → product_snapshots.rank_main <= 100
--   (4) 주요 brand: 스크래핑 누적 제품 10개 이상
-- ============================================================

-- ① inclusion_reason 별 분포 확인
with rank_top100 as (
  -- product_snapshots.rank_main 기준 (category_rankings 테이블 없음)
  select distinct b.id
  from product_snapshots ps
  join products p on p.id = ps.product_id
  join brands b on b.id = p.brand_id
  where ps.rank_main <= 100
),
product_10plus as (
  select b.id
  from brands b
  join products p on p.brand_id = b.id
  group by b.id
  having count(p.id) >= 10
),
targets as (
  select
    b.id,
    b.slug,
    b.name,
    b.is_own,
    b.company_id,
    case
      when b.is_own                 then '자사'
      when b.company_id is not null then '98사 권한'
      when rt.id is not null        then 'TOP100 이력'
      when p10.id is not null       then '제품 10+'
    end as inclusion_reason
  from brands b
  left join rank_top100    rt  on rt.id  = b.id
  left join product_10plus p10 on p10.id = b.id
  where b.is_own             = true
     or b.company_id is not null
     or rt.id  is not null
     or p10.id is not null
)
select
  inclusion_reason,
  count(*) as brand_count
from targets
group by inclusion_reason
order by inclusion_reason;
-- 기대:
--   자사       = 3 (커버낫·리·와키윌리)
--   98사 권한  = 약 100~150
--   TOP100 이력 = 약 50~100 (중복 제외)
--   제품 10+   = 약 100~200 (중복 제외)
--   총 약 200~400개 추정


-- ② 전체 대상 목록 (brand별 사유 + 현재 enrichment 상태)
with rank_top100 as (
  select distinct b.id
  from product_snapshots ps
  join products p on p.id = ps.product_id
  join brands b on b.id = p.brand_id
  where ps.rank_main <= 100
),
product_10plus as (
  select b.id, count(p.id) as product_count
  from brands b
  join products p on p.brand_id = b.id
  group by b.id
  having count(p.id) >= 10
)
select
  b.id,
  b.slug,
  b.name,
  b.is_own,
  b.company_id is not null       as has_company,
  rt.id is not null              as top100_history,
  coalesce(p10.product_count, 0) as product_count,
  case
    when b.is_own                 then '자사'
    when b.company_id is not null then '98사 권한'
    when rt.id is not null        then 'TOP100 이력'
    else                               '제품 10+'
  end                            as inclusion_reason,
  b.brand_category,
  b.price_tier,
  b.metadata_source
from brands b
left join rank_top100    rt  on rt.id  = b.id
left join product_10plus p10 on p10.id = b.id
where b.is_own             = true
   or b.company_id is not null
   or rt.id  is not null
   or p10.id is not null
order by
  (b.is_own) desc,
  (b.company_id is not null) desc,
  coalesce(p10.product_count, 0) desc,
  b.name;
