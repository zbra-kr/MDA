-- ============================================================
-- B.CAVE Competitor Radar — anomalies (Phase 2.1 단계 A)
-- Version: 1.0  Date: 2026-05-17
-- 적용 순서: 00015 이후
--
-- ⚠️  자동 적용 금지 — 정호철이 Supabase SQL Editor에서 적용.
-- ============================================================

create table if not exists public.anomalies (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id),
  snapshot_id     uuid references public.product_snapshots(id),
  detected_on     date not null,
  anomaly_type    text not null
    check (anomaly_type in (
      'rank_surge', 'price_change', 'review_velocity',
      'new_entrant', 'promo_start', 'wishlist_surge'
    )),
  severity        numeric(3, 2) not null check (severity between 0 and 1),
  evidence        jsonb not null default '{}',
  analyzed        boolean not null default false,
  created_at      timestamptz not null default now()
);

comment on table public.anomalies is '이상탐지 6종 결과. INSERT only. analyzed=false → LLM 분석 대기.';

-- ─── 인덱스 ────────────────────────────────────────────────────────────────

create index if not exists anomalies_detected_on_idx
  on public.anomalies (detected_on desc);

create index if not exists anomalies_product_id_idx
  on public.anomalies (product_id);

create index if not exists anomalies_severity_idx
  on public.anomalies (severity desc);

create index if not exists anomalies_type_idx
  on public.anomalies (anomaly_type);

create index if not exists anomalies_not_analyzed_idx
  on public.anomalies (detected_on)
  where analyzed = false;

-- UNIQUE: 같은 날 같은 상품 + 같은 탐지 타입은 1개만 (멱등성)
create unique index if not exists anomalies_dedup_idx
  on public.anomalies (product_id, detected_on, anomaly_type);

-- ─── RLS ──────────────────────────────────────────────────────────────────

alter table public.anomalies enable row level security;

create policy "anon read anomalies"
  on public.anomalies for select
  to anon
  using (true);

create policy "authenticated read anomalies"
  on public.anomalies for select
  to authenticated
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 SQL (적용 후 실행)
-- ────────────────────────────────────────────────────────────────────────────

-- [검증 1] 테이블 컬럼 확인
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'anomalies'
-- order by ordinal_position;

-- [검증 2] UNIQUE 제약 동작 (중복 INSERT → 오류 발생해야 함)
-- insert into anomalies (product_id, detected_on, anomaly_type, severity, evidence)
-- values ('<any-product-uuid>', '2026-05-17', 'rank_surge', 0.80, '{"delta": 55}');
-- -- 동일 INSERT 재시도 → 중복 오류 확인

-- [검증 3] anon SELECT 가능 확인
-- select count(*) from anomalies;
