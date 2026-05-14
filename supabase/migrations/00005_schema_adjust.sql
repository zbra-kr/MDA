-- ============================================================
-- B.CAVE Competitor Radar - Schema Adjust (무신사 구조 조사 반영)
-- Version: 1.0
-- Date: 2026-05-14
--
-- 배경: worker/scrapers/_investigate.py 의 무신사 랭킹 API 조사 결과,
--       초기 스키마(00001)의 일부 가정이 실제와 달랐다. 본 마이그레이션은
--       그 차이를 보정한다.
--
-- 적용 순서: 00001 → 00002 → 00004 → 00003 → 00005 (마지막)
--
-- 조사로 확인된 실제:
--   - 랭킹 데이터 소스: client.musinsa.com REST API (단일 응답 101건)
--   - reviewScore 척도: 100점 만점 ("98") — 5점 아님
--   - 랭킹 응답에 is_sold_out, list_price 포함
--   - wishlist_count 는 랭킹 응답에 없음 (상품 상세 API 별도 필요)
--   - categoryCode 체계: '001' 형식 — 기존 가정과 일치 (조치 불필요)
-- ============================================================


-- ------------------------------------------------------------
-- 1. rating / avg_rating 척도 보정: numeric(2,1) → numeric(4,1)
--
-- 무신사 reviewScore 는 100점 만점("98"). 기존 numeric(2,1) 은
-- 최대 9.9 까지만 수용 → 100점 값 INSERT 시 numeric field overflow.
-- numeric(4,1) 로 확장하여 0.0 ~ 999.9 수용 (100점·5점 환산 둘 다 안전).
--
-- 척도 정책: 수집 단계에서 원본 100점 값을 그대로 저장한다.
--           (정규화는 뷰/표시 계층에서 처리)
--
-- 주의: product_snapshots.rating 은 00003 의 v_today_findings 뷰가
--       참조한다. Postgres 는 뷰가 의존하는 컬럼의 타입 변경을 거부하므로
--       (cannot alter type of a column used by a view) 뷰를 먼저 drop 후
--       컬럼 타입을 바꾸고, 동일한 정의로 뷰를 재생성한다.
-- ------------------------------------------------------------

-- 1-1. 의존 뷰 임시 제거
drop view if exists v_today_findings;

-- 1-2. 컬럼 타입 확장
alter table product_snapshots
  alter column rating type numeric(4,1);

alter table review_snapshots
  alter column avg_rating type numeric(4,1);

comment on column product_snapshots.rating is
  '리뷰 점수. 무신사 reviewScore 원본 척도(100점 만점) 그대로 저장. '
  '예: 98.0. 표시 계층에서 필요 시 /20 정규화.';

comment on column review_snapshots.avg_rating is
  '평균 리뷰 점수. 무신사 100점 척도 원본 저장.';

-- 1-3. v_today_findings 재생성 (00003 의 정의와 동일)
create or replace view v_today_findings as
with latest_report as (
  select report_date from daily_reports order by report_date desc limit 1
),
latest_snapshot as (
  select distinct on (product_id)
    product_id, snapshot_date, rank_main, current_price, discount_rate,
    review_count, rating, wishlist_count
  from product_snapshots
  order by product_id, snapshot_date desc
),
prev_snapshot as (
  select distinct on (product_id)
    product_id, rank_main as prev_rank, wishlist_count as prev_wishlist,
    current_price as prev_price
  from product_snapshots
  where snapshot_date < (select report_date from latest_report)
  order by product_id, snapshot_date desc
),
match_counts as (
  select competitor_product_id, count(*) as matched_sku_count
  from product_matches
  where own_sku is not null
  group by competitor_product_id
)
select
  a.id                            as anomaly_id,
  a.detected_on,
  a.anomaly_type,
  a.severity,
  a.evidence,
  p.id                            as product_id,
  p.musinsa_no,
  p.name                          as product_name,
  p.url                           as product_url,
  b.id                            as brand_id,
  b.name                          as brand_name,
  b.slug                          as brand_slug,
  b.is_own                        as brand_is_own,
  ls.rank_main,
  ls.current_price,
  ls.wishlist_count,
  ls.review_count,
  ps.prev_rank,
  ps.prev_wishlist,
  ps.prev_price,
  (ls.rank_main - ps.prev_rank)   as delta_rank_1d,
  coalesce(mc.matched_sku_count, 0) as matched_sku_count
from anomalies a
join products p          on p.id = a.product_id
join brands b            on b.id = p.brand_id
left join latest_snapshot ls on ls.product_id = p.id
left join prev_snapshot   ps on ps.product_id = p.id
left join match_counts    mc on mc.competitor_product_id = p.id
where a.detected_on = (select report_date from latest_report);

grant select on v_today_findings to anon;
grant select on v_today_findings to authenticated;


-- ------------------------------------------------------------
-- 2. product_snapshots 에 컬럼 추가
--
-- 2-1. is_sold_out: 랭킹 API 응답에 isSoldOut 필드 존재.
--      품절 상태는 랭킹 변동 해석에 중요(품절→랭킹하락 노이즈 구분).
--
-- 2-2. list_price: 랭킹 API가 정가(normalPrice)와 판매가를 함께 제공.
--      스냅샷 시점의 정가를 보존해야 할인율 시계열이 정확해진다.
--      (products.list_price 는 '현재 정가' 1개 값이라 시계열 추적 불가)
-- ------------------------------------------------------------

alter table product_snapshots
  add column if not exists is_sold_out boolean default false;

alter table product_snapshots
  add column if not exists list_price int;

comment on column product_snapshots.is_sold_out is
  '수집 시점 품절 여부. 무신사 랭킹 API isSoldOut 필드.';

comment on column product_snapshots.list_price is
  '수집 시점 정가(정상가). 무신사 랭킹 API normalPrice. '
  'current_price 와의 차이로 시점별 실제 할인율 산출.';


-- ------------------------------------------------------------
-- 3. wishlist_count 운영 정책 명시 (컬럼 변경 없음)
--
-- 랭킹 API 응답에는 wishlist_count 가 없다. 상품 상세 API 를 별도
-- 호출해야 채울 수 있다. 따라서:
--   - 랭킹 스크래퍼(musinsa_ranking.py): wishlist_count = NULL 로 INSERT
--   - 상세 스크래퍼(musinsa_product.py, Phase 1 후반): 동일 (product_id,
--     snapshot_date) 행을 UPDATE 하여 wishlist_count 채움
-- 컬럼은 이미 nullable 이므로 스키마 변경 불필요. 코멘트만 갱신.
-- ------------------------------------------------------------

comment on column product_snapshots.wishlist_count is
  '위시리스트 수. 랭킹 API 에는 없음 — 상세 스크래퍼가 2단계로 채움. '
  '랭킹 수집 직후에는 NULL.';

comment on column product_snapshots.view_count_proxy is
  '조회수 프록시. 무신사가 직접 노출하지 않음 — 상세 수집 시 가능하면 채움. '
  '기본 NULL.';


-- ------------------------------------------------------------
-- 4. 인덱스 추가: 품절 상품 필터링용
--    이상탐지에서 "품절 아닌 상품 중 랭킹 변동" 같은 쿼리에 사용.
-- ------------------------------------------------------------

create index if not exists product_snapshots_active_rank_idx
  on product_snapshots(snapshot_date, rank_main)
  where is_sold_out = false and rank_main is not null;


-- ============================================================
-- 검증 노트:
--   적용 후 아래로 확인 가능 ──
--   select column_name, data_type, numeric_precision, numeric_scale
--   from information_schema.columns
--   where table_name = 'product_snapshots'
--     and column_name in ('rating','is_sold_out','list_price');
-- ============================================================
