-- ============================================================
-- B.CAVE Competitor Radar - Initial Schema
-- Version: 1.0
-- Author: 정호철 (IT팀장)
-- Date: 2026-05-14
--
-- 적용 방법:
--   1. Supabase Dashboard → SQL Editor에 본 파일 붙여넣고 실행
--   2. 또는 supabase CLI: supabase db push
-- ============================================================

-- ====================================
-- Extensions
-- ====================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ====================================
-- Master tables
-- ====================================

-- brands
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  tier text,
  is_competitor boolean default false,
  is_own boolean default false,
  musinsa_brand_id text,
  notes text,
  created_at timestamptz default now()
);
create index brands_is_competitor_idx on brands(is_competitor) where is_competitor = true;
create index brands_is_own_idx on brands(is_own) where is_own = true;

-- categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  musinsa_code text unique not null,
  name_kr text not null,
  parent_path text,
  depth int not null,
  is_active boolean default true,
  notes text
);
create index categories_active_idx on categories(is_active) where is_active = true;

-- products
create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) not null,
  category_id uuid references categories(id),
  musinsa_no text unique not null,
  name text not null,
  name_en text,
  url text not null,
  list_price int,
  description text,
  embedding vector(1024),
  own_sku text,
  first_seen_at timestamptz default now(),
  last_updated_at timestamptz default now()
);
create index products_brand_idx on products(brand_id);
create index products_category_idx on products(category_id);
create index products_own_sku_idx on products(own_sku) where own_sku is not null;

-- ====================================
-- Time-series tables
-- ====================================

-- product_snapshots (★ 핵심)
create table product_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  rank_main int,
  rank_realtime int,
  rank_weekly int,
  current_price int not null,
  discount_rate int,
  review_count int,
  rating numeric(2,1),
  wishlist_count int,
  view_count_proxy int,
  scraped_at timestamptz default now(),
  unique (product_id, snapshot_date)
);
create index product_snapshots_pid_date_idx on product_snapshots(product_id, snapshot_date desc);
create index product_snapshots_date_idx on product_snapshots(snapshot_date);
create index product_snapshots_rank_main_idx on product_snapshots(snapshot_date, rank_main) where rank_main is not null;

-- review_snapshots
create table review_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_date date not null,
  cumulative_review_count int not null,
  new_review_count int,
  avg_rating numeric(2,1),
  sentiment_summary jsonb,
  unique (product_id, snapshot_date)
);
create index review_snapshots_pid_date_idx on review_snapshots(product_id, snapshot_date desc);

-- ====================================
-- Media & events
-- ====================================

-- product_images
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  storage_path text not null,
  cdn_url text,
  image_type text check (image_type in ('main','detail','snap','thumbnail')),
  order_idx int default 0,
  perceptual_hash text,
  width int,
  height int,
  scraped_at timestamptz default now()
);
create index product_images_pid_idx on product_images(product_id);
create unique index product_images_dedup_idx on product_images(product_id, perceptual_hash)
  where perceptual_hash is not null;

-- promotions
create table promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  promo_type text check (promo_type in ('sale_tab','time_deal','pre_order','coupon')) not null,
  promo_name text,
  discount_amount int,
  discount_rate int,
  final_price int,
  list_price int,
  starts_at timestamptz,
  ends_at timestamptz,
  meta jsonb,
  discovered_at timestamptz default now()
);
create index promotions_pid_idx on promotions(product_id);
create index promotions_active_idx on promotions(ends_at) where ends_at > now();

-- ====================================
-- Analysis tables
-- ====================================

-- product_matches
create table product_matches (
  id uuid primary key default gen_random_uuid(),
  competitor_product_id uuid references products(id) not null,
  own_product_id uuid references products(id),
  own_sku text,
  similarity_score numeric(4,3) not null check (similarity_score between 0 and 1),
  match_basis jsonb,
  diff_summary jsonb,
  computed_at timestamptz default now()
);
create index pm_competitor_sim_idx on product_matches(competitor_product_id, similarity_score desc);
create index pm_own_idx on product_matches(own_product_id);

-- anomalies
create table anomalies (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  snapshot_id uuid references product_snapshots(id),
  detected_on date not null,
  anomaly_type text not null check (anomaly_type in (
    'rank_surge','price_change','review_velocity',
    'new_entrant','promo_start','wishlist_surge'
  )),
  severity numeric(3,2) not null check (severity between 0 and 1),
  evidence jsonb not null,
  created_at timestamptz default now()
);
create index anomalies_detected_idx on anomalies(detected_on, severity desc);
create index anomalies_product_idx on anomalies(product_id, detected_on);

-- agent_analyses
create table agent_analyses (
  id uuid primary key default gen_random_uuid(),
  anomaly_id uuid references anomalies(id) not null,
  model_version text not null,
  prompt_version text,
  llm_reasoning text not null,
  strategy_recommendation jsonb,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  human_feedback jsonb,
  created_at timestamptz default now()
);
create index agent_analyses_anomaly_idx on agent_analyses(anomaly_id);
create index agent_analyses_created_idx on agent_analyses(created_at);

-- daily_reports
create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date unique not null,
  status text default 'pending' check (status in ('pending','succeeded','failed')),
  top_findings jsonb,
  html_url text,
  slack_message_ts text,
  notion_page_id text,
  total_anomalies int default 0,
  total_analyses int default 0,
  duration_ms int,
  created_at timestamptz default now(),
  finished_at timestamptz
);

-- ====================================
-- RLS (Row Level Security)
-- Vercel 뷰어는 anon 키로 접근, 워커는 service_role
-- ====================================

alter table brands enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_snapshots enable row level security;
alter table review_snapshots enable row level security;
alter table product_images enable row level security;
alter table promotions enable row level security;
alter table product_matches enable row level security;
alter table anomalies enable row level security;
alter table agent_analyses enable row level security;
alter table daily_reports enable row level security;

-- anon 역할 = 읽기만
create policy "anon read brands" on brands for select to anon using (true);
create policy "anon read categories" on categories for select to anon using (true);
create policy "anon read products" on products for select to anon using (true);
create policy "anon read product_snapshots" on product_snapshots for select to anon using (true);
create policy "anon read review_snapshots" on review_snapshots for select to anon using (true);
create policy "anon read product_images" on product_images for select to anon using (true);
create policy "anon read promotions" on promotions for select to anon using (true);
create policy "anon read product_matches" on product_matches for select to anon using (true);
create policy "anon read anomalies" on anomalies for select to anon using (true);
create policy "anon read agent_analyses" on agent_analyses for select to anon using (true);
create policy "anon read daily_reports" on daily_reports for select to anon using (true);

-- service_role 은 RLS bypass (별도 정책 불필요)

-- ====================================
-- Helper views
-- ====================================

-- 오늘의 high-priority findings (뷰어용)
create or replace view v_today_findings as
select
  a.id as anomaly_id,
  a.product_id,
  p.musinsa_no,
  p.name as product_name,
  b.name as brand_name,
  b.slug as brand_slug,
  c.name_kr as category_name,
  a.anomaly_type,
  a.severity,
  a.evidence,
  aa.strategy_recommendation,
  aa.id as analysis_id
from anomalies a
join products p on p.id = a.product_id
join brands b on b.id = p.brand_id
left join categories c on c.id = p.category_id
left join agent_analyses aa on aa.anomaly_id = a.id
where a.detected_on = current_date
order by a.severity desc;

-- 30일 랭킹 트렌드 (상품 드릴다운용)
create or replace function f_product_trend(p_id uuid, days int default 30)
returns table (
  snapshot_date date,
  rank_main int,
  current_price int,
  review_count int,
  rating numeric(2,1)
) language sql stable as $$
  select snapshot_date, rank_main, current_price, review_count, rating
  from product_snapshots
  where product_id = p_id
    and snapshot_date >= current_date - days
  order by snapshot_date;
$$;

-- ====================================
-- Comments (자가 문서화)
-- ====================================
comment on table brands is '브랜드 마스터. is_own=B.CAVE 소속, is_competitor=모니터링 대상';
comment on table products is '상품 마스터. embedding은 bge-m3(1024d)';
comment on table product_snapshots is '★ 일별 시계열. INSERT only. UPDATE 금지';
comment on table anomalies is '탐지된 이상 징후. severity 0~1';
comment on table agent_analyses is 'LLM 분석 결과. model_version+prompt_version으로 추적성 확보';
comment on table daily_reports is '일일 리포트 메타. status로 워크플로우 상태 추적';
