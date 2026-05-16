-- ============================================================
-- B.CAVE Competitor Radar — brands anon RLS 보안 정정 (SEC-01)
-- Version: 1.0  Date: 2026-05-17
--
-- 문제: 기존 "anon read brands" 정책이 using (true) → 미인증 접근으로
--       is_own=true 자사 브랜드 전체가 노출됨 (외부 anon key 직접 호출 시).
--
-- 수정: anon 역할은 is_own=false (경쟁사·미분류) 브랜드만 SELECT 허용.
--
-- 영향 분석 (적용 전 검토 완료 2026-05-17):
--   ① supabaseServer() 경로 — anon key + 사용자 JWT 포함 →
--      Supabase가 authenticated role로 처리 →
--      00015의 "authenticated read brands" (using true) 가 적용 → 영향 없음.
--   ② supabaseAdmin() 경로 — service_role → RLS bypass → 영향 없음.
--   ③ 외부 anon key 직접 호출 — is_own=true 브랜드 차단 (의도된 보안 강화).
--
-- ⚠️  자동 적용 금지 — 정호철이 Supabase SQL Editor에서 적용.
-- ============================================================

-- 기존 anon 정책 제거 (using true → 모든 브랜드 노출)
drop policy if exists "anon read brands" on public.brands;

-- 재생성: anon 에게 is_own=false 브랜드만 허용
create policy "anon read brands"
  on public.brands for select
  to anon
  using (is_own = false);

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 SQL (적용 후 실행)
-- ────────────────────────────────────────────────────────────────────────────

-- [검증 1] anon 정책 확인
-- select policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public' and tablename = 'brands'
-- order by policyname;
-- → "anon read brands" 의 qual 이 (is_own = false) 인지 확인

-- [검증 2] authenticated 정책 (00015) 유지 확인
-- → "authenticated read brands" 의 qual 이 true 인지 확인
