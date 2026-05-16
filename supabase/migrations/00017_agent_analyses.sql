-- ============================================================
-- B.CAVE Competitor Radar — agent_analyses (Phase 2.1 단계 A)
-- Version: 1.1  Date: 2026-05-17
-- 적용 순서: 00016 이후 (anomalies 테이블 참조)
--
-- ⚠️  자동 적용 금지 — 정호철이 Supabase SQL Editor에서 적용.
-- ============================================================

-- 이전 시도 잔여물 제거 (feedback → analyses 순서로 drop)
drop table if exists public.agent_analyses_feedback cascade;
drop table if exists public.agent_analyses cascade;

-- ─── agent_analyses ───────────────────────────────────────────────────────

create table public.agent_analyses (
  id                      uuid primary key default gen_random_uuid(),
  anomaly_id              uuid not null references public.anomalies(id),
  model_version           text not null,
  prompt_version          text not null,
  llm_reasoning           text,
  strategy_recommendation jsonb,
  tokens_in               int,
  tokens_out              int,
  latency_ms              int,
  created_at              timestamptz not null default now()
);

comment on table public.agent_analyses is 'LLM 분석 결과. anomaly_id → anomalies. strategy_recommendation: ADR-025 스키마.';

-- ─── agent_analyses_feedback ──────────────────────────────────────────────

create table public.agent_analyses_feedback (
  id          uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.agent_analyses(id),
  actor       text not null,
  verdict     text not null check (verdict in ('accepted', 'rejected', 'modified')),
  comment     text,
  created_at  timestamptz not null default now()
);

comment on table public.agent_analyses_feedback is 'IT팀 LLM 분석 피드백. actor=user.email (Phase 2.0 연동 전: 임시 하드코딩).';

-- ─── 인덱스 ────────────────────────────────────────────────────────────────

create index if not exists agent_analyses_anomaly_idx
  on public.agent_analyses (anomaly_id);

create index if not exists agent_analyses_created_at_idx
  on public.agent_analyses (created_at desc);

create index if not exists agent_analyses_feedback_analysis_idx
  on public.agent_analyses_feedback (analysis_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────

alter table public.agent_analyses enable row level security;

create policy "anon read agent_analyses"
  on public.agent_analyses for select
  to anon
  using (true);

create policy "authenticated read agent_analyses"
  on public.agent_analyses for select
  to authenticated
  using (true);

alter table public.agent_analyses_feedback enable row level security;

create policy "authenticated write feedback"
  on public.agent_analyses_feedback for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "authenticated read feedback"
  on public.agent_analyses_feedback for select
  to authenticated
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 SQL (적용 후 실행)
-- ────────────────────────────────────────────────────────────────────────────

-- [검증 1] 테이블 목록
-- \dt agent_analyses
-- \dt agent_analyses_feedback

-- [검증 2] RLS 정책 확인
-- select tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('agent_analyses', 'agent_analyses_feedback')
-- order by tablename, policyname;
