-- ============================================================
-- B.CAVE Competitor Radar - Product Detail Data Schema
-- Version: 1.0
-- Date: 2026-05-15
--
-- 적용 순서: 00001 → 00002 → 00004 → 00003 → 00005 → 00006 → 00007 (마지막)
--
-- 변경 내용:
--   1. product_snapshots — brand_like_count 추가
--      (wishlist_count 는 00001 에 이미 정의됨 — comment 만 갱신)
--   2. products — tags, main_image_url, detail_last_scraped_at 추가
--      (description 은 00001 에 이미 정의됨 — comment 만 갱신)
--   3. product_recommendations 신규 테이블 (비슷한 상품 / 다른 고객이 찾은 상품, 시계열)
--   4. product_snaps 신규 테이블 (스냅 메타데이터, 작성자 식별 정보 없음)
--   5. product_review_summaries 신규 테이블 (AI 요약·키워드·별점 분포, 본문 없음)
--   6. RLS 정책 — 3개 신규 테이블 anon read
--   7. v_product_detail_status 운영용 뷰
--
-- 설계 문서: companies/schema_proposal_00007.md
-- 조사 결과: worker/scrapers/_investigate_product_findings.md
-- ============================================================


-- ============================================================
-- 1. product_snapshots — brand_like_count 추가
--    wishlist_count 는 00001 에 이미 존재 → add column if not exists 로 안전 처리
--    (실제로는 no-op), comment 는 갱신
-- ============================================================

alter table product_snapshots
  add column if not exists wishlist_count    int,
  add column if not exists brand_like_count  int;

comment on column product_snapshots.wishlist_count is
  '위시리스트 수. 랭킹 API에 없음 — 상세 스크래퍼(musinsa_product.py)가 채움.';
comment on column product_snapshots.brand_like_count is
  '소속 브랜드의 좋아요 수 (브랜드 단위지만 상품 수집 시 같이 받음). 시계열 추적용.';


-- ============================================================
-- 2. products — tags, main_image_url, detail_last_scraped_at 추가
--    description 은 00001 에 이미 존재 → add column if not exists 로 안전 처리
--    (실제로는 no-op), comment 는 갱신
-- ============================================================

alter table products
  add column if not exists tags                    text[],
  add column if not exists description             text,
  add column if not exists main_image_url          text,
  add column if not exists detail_last_scraped_at  timestamptz;

comment on column products.tags is
  '연관 태그/키워드. 무신사 .../tags 엔드포인트에서 수집. 최신값만 유지 (upsert).';
comment on column products.description is
  '상품 설명. content.musinsa.com에서 수집. 변경 거의 없어 최신만 유지.';
comment on column products.main_image_url is
  '메인 이미지 URL (고해상도). 랭킹 API의 thumbnail_url과 별개 — 더 큰 사이즈.';
comment on column products.detail_last_scraped_at is
  '상세 스크래퍼가 마지막으로 처리한 시각. 우선순위 선정 시 라운드로빈 용도.';


-- ============================================================
-- 3. 신규 테이블 — product_recommendations
--    비슷한 상품 + 다른 고객이 찾은 상품. kind 컬럼으로 구분.
--    시계열 추적 (무신사 추천은 매일 바뀜 → 변화도 시그널).
-- ============================================================

create table product_recommendations (
  id                      uuid        primary key default gen_random_uuid(),
  product_id              uuid        references products(id) not null,
  snapshot_date           date        not null,
  kind                    text        not null
                            check (kind in ('similar', 'also_viewed')),
  recommended_musinsa_no  text        not null,
  rank                    int         not null,
  recommended_product_id  uuid        references products(id),
  scraped_at              timestamptz default now(),
  unique (product_id, snapshot_date, kind, recommended_musinsa_no)
);

comment on table product_recommendations is
  '비슷한 상품·다른 고객이 찾은 상품. kind=similar|also_viewed. 시계열 추적.';
comment on column product_recommendations.rank is
  '추천 위젯 내 순서 (1, 2, 3, ...).';
comment on column product_recommendations.recommended_product_id is
  '추천된 musinsa_no 가 products 테이블에도 있을 때 FK 연결. 없으면 NULL.';

create index product_rec_pid_date_idx    on product_recommendations(product_id, snapshot_date desc);
create index product_rec_recommended_idx on product_recommendations(recommended_product_id)
  where recommended_product_id is not null;
create index product_rec_kind_idx        on product_recommendations(kind, snapshot_date);


-- ============================================================
-- 4. 신규 테이블 — product_snaps
--    스냅(코디 사진) 메타데이터. 이미지·캡션만.
--    ⚠ 작성자 식별 컬럼 없음 — 설계 의도 (개인정보 정책).
-- ============================================================

create table product_snaps (
  id               uuid        primary key default gen_random_uuid(),
  product_id       uuid        references products(id) not null,
  snapshot_date    date        not null,
  musinsa_snap_id  text        not null,
  image_url        text        not null,
  caption          text,
  posted_at        timestamptz,
  scraped_at       timestamptz default now(),
  unique (product_id, snapshot_date, musinsa_snap_id)
);

comment on table product_snaps is
  '스냅 메타데이터. 이미지·캡션만 저장. 작성자 식별 정보(닉네임·프로필·작성자ID)는 '
  '본 테이블 및 본 프로젝트 전반에서 수집하지 않는다.';
comment on column product_snaps.musinsa_snap_id is
  '무신사 스냅 고유 ID.';
comment on column product_snaps.posted_at is
  '스냅 작성일 (무신사 응답에 있는 경우). 없으면 NULL.';

create index product_snaps_pid_date_idx on product_snaps(product_id, snapshot_date desc);
create index product_snaps_snap_id_idx  on product_snaps(musinsa_snap_id);


-- ============================================================
-- 5. 신규 테이블 — product_review_summaries
--    AI 요약·키워드 점수·별점 분포. 모든 필드 nullable.
--    ⚠ 개별 리뷰 본문 저장 금지 — 설계 의도 (개인정보 정책).
-- ============================================================

create table product_review_summaries (
  id                   uuid        primary key default gen_random_uuid(),
  product_id           uuid        references products(id) not null,
  snapshot_date        date        not null,
  ai_summary           text,
  keyword_scores       jsonb,
  rating_distribution  jsonb,
  total_reviews        int,
  scraped_at           timestamptz default now(),
  unique (product_id, snapshot_date)
);

comment on table product_review_summaries is
  '리뷰 메타데이터 집계. 무신사 LLM 요약과 키워드 점수, 별점 분포만 저장.'
  ' 개별 리뷰 본문·작성자 식별 정보는 본 테이블 및 본 프로젝트 전반에서 수집하지 않는다.';
comment on column product_review_summaries.keyword_scores is
  '구매 회원 키워드별 평가 점수. 예: {"comfort": 4.8, "fit": 4.5}. 키 가변.';
comment on column product_review_summaries.rating_distribution is
  '별점 분포. 예: {"5": 120, "4": 30, "3": 5, "2": 1, "1": 0}.';
comment on column product_review_summaries.total_reviews is
  '총 리뷰 수. product_snapshots.review_count 와 일치 여부 검증용.';

create index product_rev_sum_pid_date_idx on product_review_summaries(product_id, snapshot_date desc);


-- ============================================================
-- 6. RLS 정책 — 3개 신규 테이블 anon read
--    service_role 은 RLS bypass (별도 정책 불필요)
-- ============================================================

alter table product_recommendations   enable row level security;
alter table product_snaps             enable row level security;
alter table product_review_summaries  enable row level security;

create policy "anon read product_recommendations"
  on product_recommendations for select to anon using (true);
create policy "anon read product_snaps"
  on product_snaps for select to anon using (true);
create policy "anon read product_review_summaries"
  on product_review_summaries for select to anon using (true);


-- ============================================================
-- 7. 운영용 뷰 — v_product_detail_status
--    각 상품의 상세 데이터 수집 현황. 수집 우선순위 선정용.
-- ============================================================

create or replace view v_product_detail_status as
select
  p.id,
  p.musinsa_no,
  p.name,
  p.detail_last_scraped_at,
  (p.tags is not null)             as has_tags,
  (p.description is not null)      as has_description,
  (p.main_image_url is not null)   as has_main_image,
  exists (
    select 1 from product_snaps ps
    where ps.product_id = p.id
      and ps.snapshot_date = current_date
  ) as has_snaps_today,
  exists (
    select 1 from product_recommendations pr
    where pr.product_id = p.id
      and pr.snapshot_date = current_date
  ) as has_recommendations_today,
  exists (
    select 1 from product_review_summaries prs
    where prs.product_id = p.id
      and prs.snapshot_date = current_date
  ) as has_review_summary_today
from products p;

grant select on v_product_detail_status to anon;
grant select on v_product_detail_status to authenticated;


-- ============================================================
-- 검증 쿼리 (적용 후 실행 — 주석 해제)
-- 설계 문서 §5 에서 그대로 가져옴
-- ============================================================

-- 1. 새 컬럼 추가 확인 (4개 행 예상)
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'products'
--   and column_name in ('tags', 'description', 'main_image_url', 'detail_last_scraped_at');

-- 2. 새 테이블 3개 확인 (3개 행 예상)
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('product_recommendations', 'product_snaps', 'product_review_summaries');

-- 3. RLS 정책 확인 (각 테이블에 anon read 1개씩, 총 3행)
-- select tablename, policyname
-- from pg_policies
-- where tablename in ('product_recommendations', 'product_snaps', 'product_review_summaries');

-- 4. 뷰 확인 (5행, 현재는 모두 has_*=false 일 것)
-- select * from v_product_detail_status limit 5;
