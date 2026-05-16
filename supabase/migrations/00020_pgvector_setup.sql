-- ============================================================
-- B.CAVE Competitor Radar — own_skus + product_matches (Phase 2.1 단계 C)
-- Version: 1.1  Date: 2026-05-17
-- 적용 순서: 00019 이후
--
-- ⚠️  자동 적용 금지 — 정호철이 Supabase SQL Editor에서 적용.
-- ⚠️  pgvector extension은 00001에서 이미 활성화 되어있음. idempotent.
-- ⚠️  이전 시도 잔여물 제거 (데이터 없음 전제 — 재시도 멱등성).
-- ============================================================

create extension if not exists vector;

-- 이전 시도 잔여물 제거 (product_matches → own_skus 순서로 drop)
drop table if exists public.product_matches cascade;
drop table if exists public.own_skus cascade;

-- ─── own_skus ─────────────────────────────────────────────────────────────
-- Snowflake에서 풀어온 자사(커버낫·리·와키윌리) SKU 마스터.
-- source='snowflake'. embedding: bge-m3 (1024차원).

create table public.own_skus (
  id           uuid primary key default gen_random_uuid(),
  brand_slug   text not null references public.brands(slug),
  sku_code     text not null,
  product_name text,
  category     text,
  price        integer,
  source       text not null default 'snowflake',
  pulled_at    timestamptz not null default now(),
  embedding    vector(1024),  -- ⚠️ gemma:e4b 실제 출력 차원과 맞춰야 함 (ollama embeddings 확인 후 조정)
  unique(brand_slug, sku_code)
);

comment on table public.own_skus is
  '자사 SKU 마스터 (Snowflake 풀). embedding: bge-m3 1024차원. Phase 2.1 단계 C.';

create index if not exists own_skus_brand_idx
  on public.own_skus (brand_slug);

-- HNSW: 데이터 없이도 생성 가능 (IVFFlat은 학습 데이터 필요)
create index if not exists own_skus_embedding_idx
  on public.own_skus using hnsw (embedding vector_cosine_ops);

-- ─── product_matches ──────────────────────────────────────────────────────
-- 경쟁 상품 ↔ 자사 SKU 매칭 결과.
-- competitor_product_id → products(id), own_sku_id → own_skus(id).
-- diff_summary: 가격 차이·재고 상태·매출 등 combiner.py 생성 JSON (설계 3.4절).

create table public.product_matches (
  id                    uuid primary key default gen_random_uuid(),
  competitor_product_id uuid not null references public.products(id),
  own_sku_id            uuid not null references public.own_skus(id),
  similarity_score      numeric(5, 4) not null check (similarity_score between 0 and 1),
  match_method          text not null check (match_method in ('vector', 'name_exact', 'category')),
  diff_summary          jsonb not null default '{}',
  detected_at           timestamptz not null default now(),
  is_active             boolean not null default true,
  unique(competitor_product_id, own_sku_id)
);

comment on table public.product_matches is
  '경쟁상품↔자사SKU 매칭. diff_summary: price_diff/stock_status/sales. Phase 2.1 단계 C.';

create index if not exists product_matches_competitor_idx
  on public.product_matches (competitor_product_id);

create index if not exists product_matches_own_sku_idx
  on public.product_matches (own_sku_id);

create index if not exists product_matches_score_idx
  on public.product_matches (similarity_score desc);

create index if not exists product_matches_active_idx
  on public.product_matches (is_active, detected_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────

alter table public.own_skus enable row level security;

create policy "anon read own_skus"
  on public.own_skus for select
  to anon
  using (true);

create policy "authenticated read own_skus"
  on public.own_skus for select
  to authenticated
  using (true);

alter table public.product_matches enable row level security;

create policy "anon read product_matches"
  on public.product_matches for select
  to anon
  using (true);

create policy "authenticated read product_matches"
  on public.product_matches for select
  to authenticated
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 SQL (적용 후 실행)
-- ────────────────────────────────────────────────────────────────────────────

-- [검증 1] 테이블 컬럼 확인
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name in ('own_skus', 'product_matches')
-- order by table_name, ordinal_position;

-- [검증 2] UNIQUE 제약 동작 (own_skus)
-- insert into own_skus (brand_slug, sku_code, product_name) values ('covernat', 'TEST-001', '테스트');
-- 동일 insert 재시도 → 중복 오류 확인

-- [검증 3] anon SELECT 가능 확인
-- select count(*) from own_skus;
-- select count(*) from product_matches;
