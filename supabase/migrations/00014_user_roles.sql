-- ============================================================
-- B.CAVE Competitor Radar — User Roles & Auth (Phase 2.0)
-- Version: 1.0  Date: 2026-05-16
-- 적용 순서: 00013 이후 (이 파일이 00014)
--
-- 변경 내용:
--   1. profiles 테이블 신설 (auth.users 연동)
--   2. is_admin() 헬퍼 함수 (security definer — RLS 재귀 방지)
--   3. handle_new_user() 트리거 — 가입 시 profiles 자동 생성
--   4. check_email_domain() 트리거 — @bcave.co.kr 도메인 제한
--   5. profiles RLS 정책 (본인 read/write, admin 전체 read)
--   6. brand_audit_log authenticated INSERT 정책 추가
--
-- ⚠️  자동 적용 금지 — 정호철이 Supabase SQL Editor에서 적용.
-- ⚠️  전체 파일을 한 번에 실행.
--
-- 첫 admin 설정 (가입 후 별도 실행):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = '본인@bcave.co.kr');
-- ============================================================

-- ─── 1. profiles 테이블 ─────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer'
                check (role in ('admin', 'viewer')),
  team        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Supabase Auth 사용자 프로필 (Phase 2.0)';
comment on column public.profiles.role is
  'admin: 쓰기·관리 권한 | viewer: 읽기 전용. 기본값 viewer.';

-- ─── 2. is_admin() — RLS 헬퍼 (security definer, 재귀 없음) ────────────────

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ─── 3. protect_profile_role() — role 컬럼 무단 변경 방지 트리거 ─────────────

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (auth.uid() is null) 은 모든 변경 허용
  if auth.uid() is null then
    new.updated_at = now();
    return new;
  end if;
  -- 일반 사용자가 role 을 변경하려면 본인이 admin 이어야 함
  if new.role <> old.role and not public.is_admin() then
    raise exception 'Permission denied: only admins can change roles'
      using errcode = 'P0001';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profile_update on public.profiles;
create trigger on_profile_update
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ─── 4. handle_new_user() — 가입 시 profiles 자동 생성 ───────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── 5. check_email_domain() — @bcave.co.kr 도메인 제한 ────────────────────

create or replace function public.check_email_domain()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email not ilike '%@bcave.co.kr' then
    raise exception 'Unauthorized domain: only @bcave.co.kr accounts are allowed'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists before_user_insert_domain_check on auth.users;
create trigger before_user_insert_domain_check
  before insert on auth.users
  for each row execute procedure public.check_email_domain();

-- ─── 6. profiles RLS ────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- 본인 또는 admin: SELECT
create policy "profiles: select own or admin"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- 본인: UPDATE (role 변경은 protect_profile_role 트리거가 방어)
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── 7. brand_audit_log — authenticated INSERT ─────────────────────────────

-- 기존 anon SELECT 정책은 00013에서 적용됨 — 유지
create policy "brand_audit_log: authenticated insert"
  on public.brand_audit_log for insert
  to authenticated
  with check (auth.uid() is not null);

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 SQL (Supabase SQL Editor에서 적용 후 실행)
-- ────────────────────────────────────────────────────────────────────────────

-- [검증 1] profiles 테이블 컬럼 확인
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
-- order by ordinal_position;

-- [검증 2] RLS 정책 목록 확인
-- select schemaname, tablename, policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public' and tablename in ('profiles', 'brand_audit_log')
-- order by tablename, policyname;

-- [검증 3] 트리거 목록 확인
-- select trigger_name, event_object_schema, event_object_table, action_timing, event_manipulation
-- from information_schema.triggers
-- where trigger_name in (
--   'on_auth_user_created',
--   'before_user_insert_domain_check',
--   'on_profile_update'
-- )
-- order by trigger_name;

-- [검증 4] 도메인 제한 동작 확인 (외부 도메인 → P0001 에러 발생해야 함)
-- ※ 직접 auth.users에 INSERT 하는 방식은 Supabase 관리 테이블이라 SQL Editor 제한.
--   대신 signup 페이지에서 @gmail.com 으로 가입 시도 → 에러 메시지 확인.

-- [검증 5] 가입 후 profiles row 자동 생성 확인
-- select id, full_name, role, team, created_at
-- from public.profiles
-- order by created_at desc
-- limit 5;

-- [검증 6] is_admin() 함수 동작 확인 (로그인 세션 있을 때)
-- select public.is_admin();
-- → admin 계정: true / viewer 계정: false
