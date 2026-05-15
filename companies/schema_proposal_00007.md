# 00007 마이그레이션 — 상품 상세 데이터 스키마 설계

> Claude Code 에게: 본 문서를 읽고 `supabase/migrations/00007_product_detail.sql` 을 생성한다.
> 사람(IT팀장 정호철)이 본 문서를 먼저 검토하고 OK 받은 후 SQL 생성 진행.

## 1. 배경

랭킹 API 에서 못 받는 데이터를 상품 상세 페이지에서 수집한다. 조사(`_investigate_product_findings.md`)에서 확정된 11개 필드 중 1차 8개를 우선 구현:

| # | 필드 | 출처 | 1차/2차 |
| --- | --- | --- | --- |
| 1 | wishlist_count | like.musinsa.com 별 endpoint | 1차 |
| 2 | brand_like_count | 동상 | 1차 |
| 3 | main_image_url | __NEXT_DATA__ or .../stat | 2차 (추정) |
| 4 | similar_products | .../recommends/multi (allbrand) | 1차 |
| 5 | also_viewed_products | .../v3/recommends/multi | 2차 (추정) |
| 6 | tags | .../api2/goods/{no}/tags | 1차 |
| 7 | description | content.musinsa.com 페이지 | 2차 |
| 8 | snap | content.musinsa.com/.../snap/v1/snaps | 1차 |
| 9 | ai_review_summary | goods.musinsa.com/.../ai-summary | 1차 |
| 10 | review_keyword_scores | .../survey/{no}/summary | 1차 |
| 11 | review_meta | .../reviews/summary | 1차 |

본 마이그레이션은 **1차 8개 + 2차 3개 모두를 수용할 스키마를 한 번에 만든다.** 컬럼·테이블 추가 비용은 적고, 2차 필드 일부만 NULL 로 시작하면 됨.

## 2. 결정 사항 (이미 확정 — 다시 묻지 말 것)

- 정수 시계열(wishlist·brand_like) → `product_snapshots` 컬럼 추가
- 1대N 구조(snap, similar_products, also_viewed) → 별도 테이블, 시계열로 추적
- 정적 데이터(tags, description, main_image_url) → `products` 테이블 컬럼 (최신만, upsert 덮어쓰기)
- 리뷰 정수 시그널(종 리뷰 수, 평균 별점) → 이미 `product_snapshots` 에 review_count·rating 있음 — 그대로 활용
- 리뷰 구조 시그널(AI 요약, 키워드 점수, 별점 분포) → 별도 테이블 `product_review_summaries`, 시계열
- 정책: review/v1/view/list (리뷰 본문) 는 **수집하지 않음** — 스크래퍼에서 자동 차단

## 3. 스키마 변경 사항

### 3.1 `product_snapshots` 에 컬럼 추가

```sql
alter table product_snapshots
  add column if not exists wishlist_count int,
  add column if not exists brand_like_count int;
```

근데 — `wishlist_count` 는 이미 00001 에서 정의되어 있다. 확인 후 없으면 추가, 있으면 코멘트만 갱신.

```sql
comment on column product_snapshots.wishlist_count is
  '위시리스트 수. 랭킹 API에 없음 — 상세 스크래퍼(musinsa_product.py)가 채움.';
comment on column product_snapshots.brand_like_count is
  '소속 브랜드의 좋아요 수 (브랜드 단위지만 상품 수집 시 같이 받음). 시계열 추적용.';
```

### 3.2 `products` 에 컬럼 추가 (정적 데이터)

```sql
alter table products
  add column if not exists tags text[],
  add column if not exists description text,
  add column if not exists main_image_url text,
  add column if not exists detail_last_scraped_at timestamptz;

comment on column products.tags is
  '연관 태그/키워드. 무신사 .../tags 엔드포인트에서 수집. 최신값만 유지 (upsert).';
comment on column products.description is
  '상품 설명. content.musinsa.com에서 수집. 변경 거의 없어 최신만 유지.';
comment on column products.main_image_url is
  '메인 이미지 URL (고해상도). 랭킹 API의 thumbnail_url과 별개 — 더 큰 사이즈.';
comment on column products.detail_last_scraped_at is
  '상세 스크래퍼가 마지막으로 처리한 시각. 우선순위 선정 시 라운드로빈 용도.';
```

### 3.3 신규 테이블 — `product_recommendations`

비슷한 상품 + 다른 고객이 찾은 상품. 두 종류를 한 테이블에 `kind` 컬럼으로 구분.

```sql
create table product_recommendations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  kind text not null check (kind in ('similar', 'also_viewed')),
  recommended_musinsa_no text not null,
  rank int not null,                          -- 추천 위젯 내 순서 (1, 2, 3, ...)
  recommended_product_id uuid references products(id),  -- 해당 musinsa_no가 products에도 있으면 연결
  scraped_at timestamptz default now(),
  unique (product_id, snapshot_date, kind, recommended_musinsa_no)
);

create index product_rec_pid_date_idx on product_recommendations(product_id, snapshot_date desc);
create index product_rec_recommended_idx on product_recommendations(recommended_product_id)
  where recommended_product_id is not null;
create index product_rec_kind_idx on product_recommendations(kind, snapshot_date);
```

**왜 시계열인가**: 무신사 추천이 매일 바뀐다. 어제 비슷한 상품이 오늘 다른 상품으로 교체되면 그것도 시그널이야. 시계열로 추적하면 "이 상품과 비슷하다고 자주 묶이는 상품" 같은 분석 가능.

**`recommended_product_id` 의 의미**: 추천된 musinsa_no가 우리 products 테이블에도 이미 있으면 (즉 우리가 수집 중인 경쟁 브랜드 상품이면) FK 연결. 없으면 NULL. 무신사가 우리 수집 외의 상품을 추천하기도 하니까 NULL 허용.

### 3.4 신규 테이블 — `product_snaps`

이 상품을 활용한 스냅(코디 사진). 메타데이터만 (이미지 URL, 캡션). **작성자 식별 정보는 저장 안 함.**

```sql
create table product_snaps (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  musinsa_snap_id text not null,              -- 무신사 스냅 고유 ID
  image_url text not null,
  caption text,                                -- 캡션 (있는 경우)
  posted_at timestamptz,                       -- 스냅 작성일 (무신사 응답에 있다면)
  scraped_at timestamptz default now(),
  unique (product_id, snapshot_date, musinsa_snap_id)
);

create index product_snaps_pid_date_idx on product_snaps(product_id, snapshot_date desc);
create index product_snaps_snap_id_idx on product_snaps(musinsa_snap_id);
```

**개인정보 정책**: 작성자 닉네임·프로필 이미지·작성자 ID 컬럼 **없음**. 향후에도 추가 금지. 스크래퍼가 자동으로 해당 필드 무시.

### 3.5 신규 테이블 — `product_review_summaries`

AI 요약, 키워드 점수, 별점 분포를 모은다. 리뷰 본문은 절대 저장 안 함.

```sql
create table product_review_summaries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  ai_summary text,                             -- 무신사 LLM이 만든 요약 (1~2단락)
  keyword_scores jsonb,                        -- 편안함·핏 등 키워드별 점수. 예: {"comfort": 4.8, "fit": 4.5, ...}
  rating_distribution jsonb,                   -- 별점 분포. 예: {"5": 120, "4": 30, "3": 5, "2": 1, "1": 0}
  total_reviews int,                           -- 종 리뷰 수 (review_count와 일치할 듯, 검증용)
  scraped_at timestamptz default now(),
  unique (product_id, snapshot_date)
);

create index product_rev_sum_pid_date_idx on product_review_summaries(product_id, snapshot_date desc);
```

**왜 별도 테이블**:
- AI 요약 텍스트가 수 KB 단위 → `product_snapshots` 행 크기 폭증 방지
- 키워드 점수 JSONB → 가변 키 개수 (편안함·핏·만족도 등 상품별로 다를 수 있음)
- 별점 분포도 JSONB
- 모든 필드 nullable — 무신사가 AI 요약 안 만든 상품도 있을 수 있음

**무엇을 저장 안 하는지 명시**:
```sql
comment on table product_review_summaries is
  '리뷰 메타데이터 집계. 무신사 LLM 요약과 키워드 점수, 별점 분포만 저장.'
  ' 개별 리뷰 본문·작성자 식별 정보는 본 테이블 및 본 프로젝트 전반에서 수집하지 않는다.';
```

### 3.6 RLS 정책

세 신규 테이블에 anon read 허용:

```sql
alter table product_recommendations enable row level security;
alter table product_snaps enable row level security;
alter table product_review_summaries enable row level security;

create policy "anon read product_recommendations"
  on product_recommendations for select to anon using (true);
create policy "anon read product_snaps"
  on product_snaps for select to anon using (true);
create policy "anon read product_review_summaries"
  on product_review_summaries for select to anon using (true);
```

### 3.7 유용한 뷰 — `v_product_detail_status`

운영용 — 각 상품이 마지막으로 상세 수집된 시점, 필드 채움률 등.

```sql
create or replace view v_product_detail_status as
select
  p.id,
  p.musinsa_no,
  p.name,
  p.detail_last_scraped_at,
  (p.tags is not null) as has_tags,
  (p.description is not null) as has_description,
  (p.main_image_url is not null) as has_main_image,
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
```

이 뷰로 viewer 에서 "어떤 상품이 상세 데이터 풍부한지" / "수집 우선순위가 어떤지" 확인 가능.

## 4. 적용 순서

기존: 00001 → 00002 → 00004 → 00003 → 00005 → 00006
신규: **00007 마지막**

00006 이후 추가만 하므로 의존성 없음. 단, `product_snapshots` 에 wishlist_count 가 이미 있는지 (00001 정의) 확인 후 add column if not exists 로 안전 처리.

## 5. 검증 쿼리 (적용 후)

```sql
-- 1. 새 컬럼 추가 확인
select column_name, data_type
from information_schema.columns
where table_name = 'products'
  and column_name in ('tags', 'description', 'main_image_url', 'detail_last_scraped_at');
-- 4개 행 예상

-- 2. 새 테이블 3개 확인
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('product_recommendations', 'product_snaps', 'product_review_summaries');
-- 3개 행 예상

-- 3. RLS 정책 확인
select tablename, policyname
from pg_policies
where tablename in ('product_recommendations', 'product_snaps', 'product_review_summaries');
-- 각 테이블에 anon read 정책 1개씩, 총 3행

-- 4. 뷰 확인
select * from v_product_detail_status limit 5;
-- 5행 (현재는 모두 has_*=false 일 것)
```

## 6. 향후 확장 가능성 (이번 범위 아님)

- 가격 시계열 (이미 `product_snapshots.current_price` 에 있음)
- 옵션·사이즈 정보 (별도 테이블 필요 시점에)
- 임베디드 벡터 (description 채워지면 bge-m3 임베딩 → `products.embedding`)
- 자사 매칭 (Phase 2 — `recommended_product_id` 가 자사 상품일 때 자동 매칭 시그널)

## 7. 보안·개인정보 체크리스트 (스크래퍼 작성 시 같이 확인)

- [ ] musinsa_product.py 가 review/v1/view/list 엔드포인트 응답을 무시하는가
- [ ] product_snaps 에 작성자 닉네임·프로필 이미지·작성자 ID 컬럼이 없는가
- [ ] product_review_summaries 가 개별 리뷰 본문을 저장하지 않는가
- [ ] 스크래퍼 로그에 개인정보가 남지 않는가
