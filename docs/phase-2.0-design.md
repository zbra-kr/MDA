# Phase 2.0 설계 문서 — 플랫폼 기본 기능 (인증·권한·설정)

> 작성: 2026-05-16 / 오너: 정호철 (IT팀장)
> 코드 작성 시작 전 이 문서를 읽고 시작한다.

---

## 1. 배경·목적

현재 viewer는 **완전 공개 읽기 + service_role 우회 쓰기** 구조다.

| 현황 | 문제 |
|---|---|
| 모든 페이지 미인증 접근 가능 | 내부 전략 정보 노출 위험 |
| Server Action이 service_role 키로 DB 직접 쓰기 | 행위자 추적 불가, 감사 불가 |
| actor 필드에 `"정호철"` 하드코딩 | 다인 사용 시 누가 했는지 알 수 없음 |
| brand_audit_log actor = 고정 문자열 | 감사 가치 반감 |

Phase 2.0은 이 기반을 고치는 **인프라 작업**이다. Phase 2.1 (이상탐지·LLM)의 전제 조건은 아니지만, Vercel 배포 전 필수. Phase 2.0과 Phase 2.1을 동시 설계하되 **Phase 2.0 → 2.1 순서로 가동**.

---

## 2. 결정사항 요약

| 항목 | 결정 |
|---|---|
| 로그인 방식 | 이메일 + 비밀번호 (Supabase Auth) |
| 가입 제한 | `@bcave.co.kr` 도메인만 허용 |
| 권한 단계 | 2단계 — `admin` / `viewer` (추후 3단계 고도화 예정, Notion 메모) |
| 공개 읽기 | 유지 — anon SELECT는 그대로. 단 민감 테이블(product_matches 등)은 인증 필요 |
| 쓰기 인증 | Server Action 내부에서 `supabaseServer()`로 세션 검증 후 role 확인 |
| 설정 페이지 | 사용자 설정 + 관리자 + 프로필 전부 Phase 2.0에 포함 |
| service_role 우회 | 즉시 제거 금지. Phase 2.0 단계 F에서 페이지별로 점진 전환 |

### 2.1 대안 검토 (ADR-023)

- **Magic Link**: 비밀번호 없이 편함, 하지만 이메일 SMTP 의존성 + 사내 UX 낯섦
- **SSO (Google·Microsoft)**: 도메인 제한 자동화, 하지만 Supabase Auth 설정 복잡도, 구글 워크스페이스 연동 작업 별도 필요. bcave.co.kr 아직 GSuite 기반인지 미확인.
- **Magic Link + 비밀번호 병행**: 가장 유연하지만 구현 복잡도 증가.

→ 이메일+비밀번호 단일 방식 선택. 단순하고, SMTP 설정 1회성, 사내 도구 수준에서 충분.

---

## 3. 마이그레이션 스케치 — 00014_user_roles.sql

> **주의**: 실제 .sql 파일은 Phase 2.0 단계 A 구현 시 작성. 여기는 스케치.

### 3.1 profiles 테이블

```sql
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer'
                check (role in ('admin', 'viewer')),
  team        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 신규 가입 시 자동 profiles 행 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 3.2 도메인 제한 — Hook 방식

Supabase Auth `before_user_created` hook (Edge Function) 또는 DB 트리거로 `@bcave.co.kr` 외 도메인 가입 차단.

**Edge Function 방식 (권장)**:
```typescript
// supabase/functions/auth-hook-domain-check/index.ts
const email = payload.email;
if (!email.endsWith('@bcave.co.kr')) {
  return new Response(JSON.stringify({ error: '허가된 도메인만 가입 가능합니다.' }), { status: 403 });
}
```

**DB 트리거 방식 (fallback)**:
```sql
create or replace function check_email_domain()
returns trigger language plpgsql security definer as $$
begin
  if new.email not ilike '%@bcave.co.kr' then
    raise exception 'Unauthorized domain: only @bcave.co.kr is allowed';
  end if;
  return new;
end;
$$;
create trigger before_user_insert
  before insert on auth.users
  for each row execute procedure check_email_domain();
```

구현 시점에 Supabase Auth Hook 지원 여부 확인 후 방식 선택.

### 3.3 RLS 정책 갱신

기존 anon SELECT 정책은 유지하되, 쓰기 경로에 인증 추가.

```sql
-- brands 쓰기: 인증된 admin만
create policy "admin write brands"
  on brands for all
  to authenticated
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

-- brand_audit_log 쓰기: 인증된 사용자 (viewer·admin 모두)
create policy "authenticated write brand_audit_log"
  on brand_audit_log for insert
  to authenticated
  with check (auth.uid() is not null);

-- product_matches: anon 차단, 인증 필요 (자사 재고 민감 데이터)
-- (현재 anon read 허용 → Phase 2.0에서 변경)
alter policy "anon read product_matches" on product_matches ...
```

**정책 매트릭스 (전체)**:

| 테이블 | anon SELECT | authenticated SELECT | authenticated INSERT/UPDATE |
|---|---|---|---|
| products, product_snapshots | O | O | X (워커 전용) |
| brands, companies | O | O | admin only |
| brand_audit_log | O | O | authenticated |
| product_matches | X → **authenticated** | O | X (워커 전용) |
| agent_analyses | O | O | X (워커 전용) |
| profiles | X | 본인만 | 본인만 |

---

## 4. viewer 작업 분할

### 4.1 신설 페이지

| 경로 | 설명 |
|---|---|
| `/auth/login` | 이메일·비밀번호 로그인, Supabase Auth `signInWithPassword` |
| `/auth/signup` | 이름·이메일·비밀번호, 도메인 에러 핸들링 |
| `/auth/forgot-password` | 비밀번호 재설정 이메일 발송 |
| `/auth/reset-password` | 토큰으로 비밀번호 변경 |
| `/settings` | 프로필 수정 (이름·팀) |
| `/admin/users` | 사용자 목록·role 변경 (admin 전용) |
| `/admin/audit` | brand_audit_log 전체 조회 (admin 전용) |

### 4.2 신설·수정 파일

| 파일 | 역할 |
|---|---|
| `middleware.ts` | 인증 가드 — 미로그인 시 `/auth/login` 리디렉션 |
| `lib/supabase/server.ts` | 변경 없음 (`@supabase/ssr` 패턴 이미 구현) |
| `lib/auth.ts` | `getSession()`, `getProfile()` 헬퍼 |
| `components/radar/app-bar.tsx` | 우상단 프로필 메뉴 추가 |
| `app/(app)/insights/manage/actions.ts` | service_role → 세션 기반 전환 (단계 F) |
| `app/(app)/brands/actions.ts` | 동일 (단계 F) |

### 4.3 middleware.ts 설계

```typescript
// viewer/middleware.ts — 설계 스케치
// 인증 제외 경로: /auth/*, /_next/*, /api/auth/*
// 나머지는 supabaseServer().auth.getSession() → 없으면 /auth/login 리디렉션
// admin 전용 경로 (/admin/*): role 확인 → viewer면 403 또는 /
```

Supabase Middleware 패턴 (`@supabase/ssr`의 `createServerClient` + `middleware`) 표준 사용.

---

## 5. service_role 우회 → 인증 사용자 전환 계획

### 5.1 현재 우회 패턴

```typescript
// viewer/lib/supabase/admin.ts
export function supabaseAdmin() {
  return createClient(url, SUPABASE_SERVICE_KEY, { auth: { ... } });
}
// Server Action에서 supabaseAdmin()으로 DB 직접 쓰기
```

문제: 세션 없이도 쓰기 가능. actor 추적 불가.

### 5.2 전환 후 패턴

```typescript
// Server Action 내
const sb = await supabaseServer();   // anon key, 쿠키 기반 세션
const { data: { user } } = await sb.auth.getUser();
if (!user) return { error: '로그인 필요' };

// role 확인 (admin only actions)
const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
if (profile?.role !== 'admin') return { error: '권한 없음' };

// 쓰기는 service_role 클라이언트 (RLS bypass는 필요), 하지만 actor는 세션에서
const admin = supabaseAdmin();
await admin.from('brands').update(...).eq('id', brandId);
await admin.from('brand_audit_log').insert({ actor: user.email, ... });
```

> **핵심 변경**: `supabaseAdmin()` 은 RLS bypass용으로만 유지하되, **호출 전에 반드시 세션 검증**. actor는 `user.email`로 동적 주입.

### 5.3 Server Action별 권한 매트릭스

| Action | 경로 | 현재 | Phase 2.0 후 |
|---|---|---|---|
| `toggleCompetitor` | /brands | service_role, 비인증 | authenticated (viewer 이상) |
| `assignBrandToCompany` | /insights/manage | service_role, 비인증 | authenticated + admin |
| `removeBrandFromCompany` | /insights/manage | service_role, 비인증 | authenticated + admin |
| `addCustomBrand` | /insights/manage | service_role, 비인증 | authenticated + admin |
| `searchMusinsaBrand` | /insights/manage | 비인증 (읽기) | authenticated (viewer 이상) |

### 5.4 점진 전환 순서 (단계 F)

1. `brands/actions.ts` → `toggleCompetitor` (낮은 위험, viewer도 가능)
2. `manage/actions.ts` → `searchMusinsaBrand` (읽기 전용, 쉬움)
3. `manage/actions.ts` → `removeBrandFromCompany` / `addCustomBrand` / `assignBrandToCompany` (admin 전용)
4. actor 필드 하드코딩 → `user.email` 동적 주입

---

## 6. ADR-023 초안 — Phase 2.0 인증·권한 아키텍처

> 전문은 `docs/DECISIONS.md` ADR-023 참조.

**결정**: Supabase Auth + 이메일+비밀번호 + `@bcave.co.kr` 도메인 제한 + 2단계 권한(admin/viewer).

**대안**:
- Magic Link — SMTP 안정성 우려로 기각
- SSO (Google·Microsoft) — 연동 복잡도 대비 사내 규모에 과잉으로 기각

**결과**: 공개 읽기는 유지. 쓰기 경로에만 인증 주입. service_role은 RLS bypass 용도로만 제한적 유지.

---

## 7. 작업 분할 (단계 A~F)

> 세부 사항은 `docs/phase-2.0-tasks.md` 참조.

| 단계 | 내용 | 선행 조건 |
|---|---|---|
| A | 마이그레이션 00014 (profiles + 트리거 + RLS 갱신) | — |
| B | Supabase Auth 설정 (이메일 템플릿·SMTP·도메인 Hook) | A |
| C | /auth/* 페이지 4개 | B |
| D | middleware.ts + lib/auth.ts | C |
| E | /settings + /admin/users + /admin/audit | D |
| F | Server Action 점진 전환 (service_role 우회 → 세션 기반) | E |

---

## 8. 검증 게이트 2.0

- [ ] @bcave.co.kr 외 도메인 가입 시 에러 반환
- [ ] 미로그인 시 /auth/login 리디렉션
- [ ] admin 계정으로 /admin/users 접근 가능
- [ ] viewer 계정으로 /admin/users 접근 시 차단
- [ ] 로그인 후 brand_audit_log.actor에 user.email 기록됨
- [ ] service_role 키 환경 변수 제거 시 기존 테스트 통과 (단계 F 완료 기준)

---

## 9. 리스크

| ID | 설명 | 대응 |
|---|---|---|
| R1 | Supabase Auth Hook Edge Function 미지원 버전 | DB 트리거 방식으로 fallback |
| R2 | 기존 anon 쓰기 의존 코드 누락 | 단계 F 시 전체 Server Action grep 목록 작성 후 순차 처리 |
| R3 | middleware.ts가 `@supabase/ssr` 패턴과 맞지 않을 경우 | Supabase 공식 Next.js 15 예제 참조 |
| R4 | admin 첫 사용자가 없을 때 관리자 설정 불가 | 마이그레이션에 `service_role` SQL로 첫 admin 수동 지정 스크립트 포함 |
