# Data Model

Supabase Postgres 스키마 상세. 모든 테이블 정의는 `supabase/migrations/00001_init.sql`에 있으며, 본 문서는 그 의도와 활용을 설명한다.

## 1. 테이블 개요

| 테이블 | 성격 | 갱신 패턴 |
|---|---|---|
| `brands` | 마스터 | 수동 시드 + 가끔 추가 |
| `categories` | 마스터 | 수동 시드 (무신사 카테고리 트리) |
| `products` | 마스터 | 첫 발견 시 INSERT, 이후 거의 불변 (embedding만 갱신) |
| `product_snapshots` | 시계열 | 매일 INSERT only |
| `product_images` | 미디어 | 첫 발견 시 INSERT |
| `review_snapshots` | 시계열 | 매일 INSERT only |
| `promotions` | 이벤트 | 프로모션 발견 시 INSERT, 종료 시 ends_at 갱신 |
| `product_matches` | 매칭 캐시 | 신규 경쟁상품 발견 시 매칭, 자사 신상 등록 시 재매칭 |
| `anomalies` | 탐지 결과 | 매일 INSERT |
| `agent_analyses` | LLM 결과 | 매일 INSERT |
| `daily_reports` | 일일 묶음 | 매일 1건 INSERT |

## 2. 마스터 테이블

### `brands`

```sql
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,           -- 'covernat', 'lmc', 'thisisneverthat'
  tier text,                            -- 'street', 'casual', 'designer', ...
  is_competitor boolean default false,  -- 모니터링 대상인가
  is_own boolean default false,         -- B.CAVE 소유 브랜드인가
  musinsa_brand_id text,                -- 무신사 브랜드 페이지 ID
  notes text,
  created_at timestamptz default now()
);
```

**시드 예시**:
- `covernat`: is_own=true, is_competitor=true (자사이면서 무신사 페이지에서도 추적)
- `lmc`, `thisisneverthat`, `mainbooth`, `partimento`, ... : is_competitor=true
- `lee`, `wakywilly`: is_own=true (자사 다른 브랜드)

### `categories`

```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  musinsa_code text unique not null,    -- '001', '002', '003001', ...
  name_kr text not null,                -- '상의', '바지', '셔츠/블라우스'
  parent_path text,                     -- '상의 > 셔츠/블라우스 > 캐주얼셔츠'
  depth int not null,                   -- 1=대분류, 2=중분류, 3=소분류
  is_active boolean default true,
  notes text
);
```

**중요**: 무신사 카테고리는 트리 구조이므로 `parent_path`에 풀패스를 저장해두면 LLM이 컨텍스트로 쓰기 좋다.

### `products`

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) not null,
  category_id uuid references categories(id),
  musinsa_no text unique not null,      -- 무신사 상품 번호 (URL의 /products/12345678)
  name text not null,
  name_en text,
  url text not null,
  list_price int,                       -- 정상가
  description text,
  embedding vector(1024),               -- bge-m3 임베딩
  own_sku text,                         -- 자사 상품일 때만, Snowflake SKU
  first_seen_at timestamptz default now(),
  last_updated_at timestamptz default now()
);

create index on products using ivfflat (embedding vector_cosine_ops);
```

**임베딩 입력 텍스트**: `f"{브랜드명} {상품명} {카테고리 풀패스} {설명 요약 200자}"`

## 3. 시계열 테이블

### `product_snapshots` ★ 핵심

```sql
create table product_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  rank_main int,                        -- 카테고리 메인 랭킹
  rank_realtime int,                    -- 실시간 랭킹 (있을 때)
  rank_weekly int,
  current_price int not null,           -- 현재 노출가
  discount_rate int,                    -- 할인율 %
  review_count int,
  rating numeric(2,1),                  -- 0.0 ~ 5.0
  wishlist_count int,
  view_count_proxy int,                 -- 조회수 추정치 (있으면)
  scraped_at timestamptz default now(),
  unique (product_id, snapshot_date)
);

create index on product_snapshots (product_id, snapshot_date desc);
create index on product_snapshots (snapshot_date);
```

**왜 이렇게 설계했나**: 모든 분석의 원료. UPDATE 안 하고 매일 INSERT만 하므로 SQL 한 줄로 트렌드 그래프, 이동평균, 변화율 다 계산됨.

**활용 예시 쿼리**:
```sql
-- 어제 대비 랭킹 20위 이상 상승한 상품
with today as (
  select product_id, rank_main from product_snapshots
  where snapshot_date = current_date
),
yest as (
  select product_id, rank_main from product_snapshots
  where snapshot_date = current_date - 1
)
select p.name, b.name as brand, yest.rank_main as yesterday, today.rank_main as today
from today
join yest using (product_id)
join products p on p.id = today.product_id
join brands b on b.id = p.brand_id
where yest.rank_main - today.rank_main >= 20;
```

### `review_snapshots`

```sql
create table review_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  cumulative_review_count int not null,
  new_review_count int,                 -- 당일 신규
  avg_rating numeric(2,1),
  sentiment_summary jsonb,              -- {pos: 0.7, neg: 0.1, neu: 0.2, top_keywords: [...]}
  unique (product_id, snapshot_date)
);
```

## 4. 미디어·이벤트

### `product_images`

```sql
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  storage_path text not null,           -- Supabase Storage path
  cdn_url text,                          -- public URL
  image_type text,                       -- 'main', 'detail', 'snap'
  order_idx int default 0,
  perceptual_hash text,                  -- imagehash for dedup
  width int, height int,
  scraped_at timestamptz default now()
);
```

### `promotions`

```sql
create table promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  promo_type text not null,              -- 'sale_tab', 'time_deal', 'pre_order', 'coupon'
  promo_name text,
  discount_amount int,
  discount_rate int,
  starts_at timestamptz,
  ends_at timestamptz,
  meta jsonb,
  discovered_at timestamptz default now()
);
```

## 5. 매칭·탐지·분석

### `product_matches`

```sql
create table product_matches (
  id uuid primary key default gen_random_uuid(),
  competitor_product_id uuid references products(id) not null,
  own_product_id uuid references products(id),    -- 자사 무신사 상품
  own_sku text,                                    -- Snowflake SKU
  similarity_score numeric(4,3) not null,          -- 0.000 ~ 1.000
  match_basis jsonb,                               -- {vector: 0.92, category: true, price_band: true}
  diff_summary jsonb,                              -- {price_diff: -5000, fit: 'looser', color_overlap: ['black', 'cream']}
  computed_at timestamptz default now()
);

create index on product_matches (competitor_product_id, similarity_score desc);
```

`diff_summary` 예시:
```json
{
  "price_diff_krw": -5000,
  "price_diff_pct": -8.3,
  "competitor_price": 65000,
  "own_price_msrp": 70000,
  "own_price_pos": 49000,
  "fit": "looser",
  "color_overlap": ["black", "cream"],
  "color_competitor_only": ["sage"],
  "color_own_only": ["navy"],
  "size_range": "S-XL",
  "stock_status": "low"
}
```

### `anomalies`

```sql
create table anomalies (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_id uuid references product_snapshots(id),
  detected_on date not null,
  anomaly_type text not null,            -- 'rank_surge', 'price_change', ...
  severity numeric(3,2) not null,        -- 0.00 ~ 1.00
  evidence jsonb not null,               -- 탐지 근거 (전일값, 임계치 등)
  created_at timestamptz default now()
);

create index on anomalies (detected_on, severity desc);
```

### `agent_analyses`

```sql
create table agent_analyses (
  id uuid primary key default gen_random_uuid(),
  anomaly_id uuid references anomalies(id) not null,
  model_version text not null,           -- 'qwen2.5:14b-instruct-q4_K_M'
  llm_reasoning text not null,           -- LLM 원문 응답
  strategy_recommendation jsonb,         -- 파싱된 구조화 결과
  prompt_version text,                   -- 프롬프트 버전 관리
  tokens_in int, tokens_out int,
  latency_ms int,
  created_at timestamptz default now()
);
```

`strategy_recommendation` 스키마:
```json
{
  "cause_hypothesis": "인플루언서 픽업으로 추정, 동 시기 SNS 태그 12건",
  "impact_on_own": "유사상품 커버낫 'XX 셔츠' 재고 300개, POS 가격 우위",
  "action": "price_match | promo_match | inventory_push | monitor",
  "action_detail": "위시리스트 행사 + 매장 노출 강화",
  "priority": "high | medium | low",
  "confidence": 0.78
}
```

### `daily_reports`

```sql
create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date unique not null,
  top_findings jsonb not null,           -- 헤드라인용 Top N 요약
  html_url text,                          -- Supabase Storage에 저장된 HTML
  slack_message_ts text,                  -- 슬랙 발송 timestamp
  notion_page_id text,                    -- Notion 페이지 ID
  total_anomalies int,
  total_analyses int,
  created_at timestamptz default now()
);
```

## 6. RLS (Row Level Security) 정책

뷰어(Vercel)가 anon 키로 접근하므로 RLS 필수:

```sql
-- 모든 테이블 RLS 활성화
alter table brands enable row level security;
alter table products enable row level security;
-- ... 전 테이블

-- anon 역할에 읽기만 허용
create policy "anon read brands" on brands for select to anon using (true);
create policy "anon read products" on products for select to anon using (true);
-- ... 전 테이블 동일 패턴

-- service_role은 모든 작업 가능 (워커가 사용)
-- 별도 정책 불필요 (service_role은 RLS bypass)
```

## 7. 데이터 보존·아카이브

- `product_snapshots`: 90일 보관, 이후 월간 집계 테이블 `monthly_aggregates`로 이관 (Phase 3)
- `product_images`: 30일 후 cold storage 이동 검토 (이미지 비용)
- `agent_analyses`: 영구 보관 (모델 평가용)
- `daily_reports`: 영구 보관

## 8. 시드 데이터

`supabase/seed.sql`:
- 무신사 카테고리 전체 (대/중/소분류 약 200~300개)
- 자사 브랜드 3개 (covernat, lee, wakywilly)
- 초기 경쟁브랜드 약 30개 (커버낫 카테고리 인접)

경쟁브랜드 리스트는 IT팀+상품기획팀 협의로 갱신 (월 1회).
