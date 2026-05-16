-- ============================================================
-- B.CAVE Competitor Radar — Brand-Company 매핑 감사 로그
-- Version: 1.0  Date: 2026-05-16
-- 적용 순서: 00012 이후 (이 파일)
--
-- 변경 내용:
--   brand_audit_log 테이블 신설 (Phase 1.9 운영 도구용)
--
-- 결정 배경:
--   viewer 안 운영 도구에서 매핑 정정 시 변경 이력 추적.
--   actor: 현재 "정호철" 고정 → Phase 3 Supabase Auth 도입 후 user_id 전환.
-- ============================================================

create table if not exists brand_audit_log (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid references brands(id) on delete cascade,
  brand_slug      text not null,
  brand_name      text not null,
  action          text not null
    check (action in ('add', 'remove', 'reassign')),
  old_company_id  uuid references companies(id),
  old_company_name text,
  new_company_id  uuid references companies(id),
  new_company_name text,
  actor           text not null default 'system',
  source          text not null
    check (source in ('manual_ui', 'bulk_csv', 'llm_enrich', 'seed', 'scraper')),
  reasoning       text,
  created_at      timestamptz not null default now()
);

comment on table brand_audit_log is
  'Brand-Company 매핑 변경 이력 (Phase 1.9 운영 도구용)';
comment on column brand_audit_log.action is
  'add=company_id null→값, remove=값→null, reassign=A→B';
comment on column brand_audit_log.actor is
  'Phase 1.9: "정호철" 고정. Phase 3 Auth 도입 후 user_id 전환';
comment on column brand_audit_log.source is
  'manual_ui=Phase 1.9 운영 도구 | llm_enrich=Phase 1.5.2 자동 | seed=초기 시드';

create index brand_audit_log_brand_idx
  on brand_audit_log(brand_id);
create index brand_audit_log_created_at_idx
  on brand_audit_log(created_at desc);
create index brand_audit_log_company_idx
  on brand_audit_log(new_company_id)
  where new_company_id is not null;
create index brand_audit_log_action_idx
  on brand_audit_log(action);

-- RLS
alter table brand_audit_log enable row level security;

create policy "anon read brand_audit_log"
  on brand_audit_log for select to anon using (true);
