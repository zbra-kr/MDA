-- ============================================================
-- Phase 1.5.1 단계 A 검증 SQL
-- 00012_brand_metadata.sql 적용 후 실행
-- ============================================================

-- 1. 신규 컬럼 8개 확인
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'brands'
  and column_name in (
    'description', 'brand_category', 'price_tier',
    'target_age', 'target_gender', 'hq_country',
    'metadata_enriched_at', 'metadata_source'
  )
order by column_name;
-- 기대: 8행
--   brand_category        | text                     | YES
--   description           | text                     | YES
--   hq_country            | text                     | YES
--   metadata_enriched_at  | timestamp with time zone | YES
--   metadata_source       | text                     | YES
--   price_tier            | text                     | YES
--   target_age            | text                     | YES
--   target_gender         | text                     | YES


-- 2. 인덱스 4개 확인
select indexname
from pg_indexes
where tablename = 'brands'
  and indexname like 'brands_%_idx'
order by indexname;
-- 기대: 4개
--   brands_category_idx
--   brands_hq_country_idx
--   brands_price_tier_idx
--   brands_target_gender_idx


-- 3. CHECK 제약 이름 확인
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'brands'::regclass
  and contype = 'c'
order by conname;
-- 기대: brand_category, price_tier, target_gender, hq_country, metadata_source 에 대한 check 제약


-- 4. 대상 brand 총수 (include all 4 criteria)
select count(distinct b.id) as target_count
from brands b
left join (
  select distinct b2.id
  from category_rankings cr
  join products p on p.id = cr.product_id
  join brands b2 on b2.id = p.brand_id
  where cr.rank <= 100
) rt on rt.id = b.id
left join (
  select b3.id
  from brands b3
  join products p on p.brand_id = b3.id
  group by b3.id
  having count(p.id) >= 10
) p10 on p10.id = b.id
where b.is_own             = true
   or b.company_id is not null
   or rt.id  is not null
   or p10.id is not null;
-- 기대: 200~400개 사이


-- 5. 기존 brands 행 총수 (비교용)
select count(*) as total_brands from brands;
-- 기대: > target_count (전체 brand 는 대상보다 많음)
