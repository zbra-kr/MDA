# Phase 2.0 작업 분할 — 단계 A~F

> 작성: 2026-05-16 / 설계 배경: `docs/phase-2.0-design.md` / ADR: ADR-023

---

## 단계 A — 마이그레이션 00014

**목표**: profiles 테이블, 도메인 제한, RLS 정책 갱신을 DB에 적용.

### 작성 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/00014_user_roles.sql` | profiles + handle_new_user 트리거 + RLS 정책 갱신 |
| `supabase/functions/auth-hook-domain-check/index.ts` | (옵션) Edge Function 도메인 제한 Hook |

### 세부 작업

1. `profiles` 테이블 생성 (`id → auth.users.id`, `role: admin|viewer`, `full_name`, `team`)
2. `handle_new_user()` 트리거 — auth.users INSERT 후 profiles 자동 생성
3. 도메인 제한 구현:
   - 1안: Supabase Auth Hook (Edge Function, Supabase 대시보드 설정 필요)
   - 2안: DB 트리거 (`before insert on auth.users`) — Hook 미지원 시 fallback
4. RLS 정책 추가:
   - `brands`, `companies`: admin만 쓰기
   - `brand_audit_log`: authenticated INSERT
   - `product_matches`: anon SELECT 차단 → authenticated 전환
5. 첫 admin 계정 설정 SQL 스크립트 작성 (수동 실행)

### 의사결정 사항

- 도메인 제한 방식: Supabase 버전 확인 후 Hook vs 트리거 결정
- role 기본값: `viewer` (가입 직후 viewer, admin은 기존 admin이 승격)

### 검증 시나리오

```bash
# profiles 자동 생성 확인
select * from profiles where id = '<신규가입유저ID>';

# 외부 도메인 차단 확인 (Gmail 등으로 가입 시도 → 에러)
# brands admin 쓰기 확인
# product_matches anon 차단 확인
```

---

## 단계 B — Supabase Auth 설정

**목표**: 이메일 인증·비밀번호 초기화 SMTP 설정 + 이메일 템플릿 한국어화.

### 세부 작업

1. Supabase 대시보드 Auth 설정:
   - `Site URL`: `http://localhost:3000` (개발) / `https://radar.bcave.co.kr` (운영)
   - `Redirect URLs`: `*/auth/reset-password`
2. SMTP 설정: B.CAVE 회사 메일 서버 또는 SendGrid (별도 계정 필요)
3. 이메일 템플릿 한국어화:
   - Confirm Email 템플릿
   - Reset Password 템플릿
4. 도메인 제한 Hook 연결 (단계 A Edge Function 배포 후)
5. (선택) 이메일 확인 필수 설정 여부 결정 — 사내 도구이므로 비필수 권장

### 의사결정 사항

- SMTP 제공자: 회사 메일 서버 (relay) vs SendGrid vs Resend
- 이메일 확인(confirm email) 활성화 여부

### 검증 시나리오

```
1. 테스트 계정(test@bcave.co.kr)으로 가입 → 이메일 수신 확인
2. 비밀번호 초기화 요청 → 이메일 수신 후 재설정 완료
3. 외부 도메인(test@gmail.com)으로 가입 → 에러 메시지 확인
```

---

## 단계 C — /auth/* 페이지 4개

**목표**: 로그인·가입·비밀번호 찾기·재설정 페이지 구현.

### 작성 파일

| 파일 | 역할 |
|---|---|
| `app/(auth)/layout.tsx` | auth 전용 레이아웃 (앱바 없음, 로고만) |
| `app/(auth)/login/page.tsx` | 이메일·비밀번호 로그인 |
| `app/(auth)/signup/page.tsx` | 이름·이메일·비밀번호 가입 |
| `app/(auth)/forgot-password/page.tsx` | 이메일 입력 → 재설정 메일 발송 |
| `app/(auth)/reset-password/page.tsx` | 토큰으로 새 비밀번호 설정 |

### 세부 작업

1. `(auth)` route group 신설 — middleware 제외 경로
2. 로그인 페이지: `supabaseBrowser().auth.signInWithPassword()` 호출
3. 가입 페이지: `signUp()` + 도메인 에러 핸들링 + `full_name` 메타 전달
4. 비밀번호 찾기: `resetPasswordForEmail()` + 성공 메시지
5. 재설정 페이지: URL fragment에서 토큰 파싱 + `updateUser()` 호출
6. 공통: 디자인 토큰 사용 (hex 하드코딩 금지), 이모지 금지

### 의사결정 사항

- auth 레이아웃 공유 여부: `(auth)` route group으로 분리 (권장)
- 소셜 로그인 버튼 포함 여부: Phase 2.0은 이메일+비밀번호만

### 검증 시나리오

```
1. /auth/login → 올바른 계정 → 로그인 후 / 리디렉션
2. /auth/login → 틀린 비밀번호 → "이메일 또는 비밀번호가 올바르지 않습니다." 에러
3. /auth/signup → 외부 도메인 → 도메인 에러 표시
4. /auth/forgot-password → 가입된 이메일 → "재설정 이메일을 발송했습니다." 성공
```

---

## 단계 D — middleware.ts + lib/auth.ts

**목표**: 미인증 접근 차단, 인증 유지, role 헬퍼 제공.

### 작성 파일

| 파일 | 역할 |
|---|---|
| `middleware.ts` | Supabase 세션 갱신 + 미인증 시 /auth/login 리디렉션 |
| `lib/auth.ts` | `getSession()`, `getProfile()`, `requireAdmin()` 헬퍼 |

### 세부 작업

1. `middleware.ts`:
   - `@supabase/ssr`의 `createServerClient` + `request.cookies` 패턴
   - 제외 경로: `/auth/*`, `/_next/*`, `/favicon.ico`
   - 세션 갱신 후 response cookie에 반영
   - 미인증 → `/auth/login?redirect={현재 경로}` 리디렉션
2. `lib/auth.ts`:
   ```typescript
   // getSession(): User | null
   // getProfile(userId): Profile | null (role, full_name, team)
   // requireAdmin(): 비admin시 throw or redirect
   ```
3. admin 전용 경로 `/admin/*`: middleware에서 role 확인 후 viewer면 `/` 리디렉션

### 의사결정 사항

- admin 진입 차단 방식: middleware에서 redirect vs 페이지에서 redirect (middleware 권장)
- 세션 갱신 실패 시 처리: 로그아웃 후 /auth/login

### 검증 시나리오

```
1. 미로그인 → /companies 접근 → /auth/login?redirect=/companies 리디렉션
2. viewer 계정 → /admin/users 접근 → / 리디렉션
3. admin 계정 → /admin/users 접근 → 정상 렌더
4. 세션 만료 후 자동 갱신 확인 (Supabase SSR 표준 동작)
```

---

## 단계 E — /settings + /admin/users + /admin/audit

**목표**: 사용자 설정, 관리자 기능, 감사 로그 UI 구현.

### 작성 파일

| 파일 | 역할 |
|---|---|
| `app/(app)/settings/page.tsx` | 프로필 수정 (이름·팀) + 비밀번호 변경 |
| `app/(app)/admin/layout.tsx` | admin 전용 레이아웃 (role 가드) |
| `app/(app)/admin/users/page.tsx` | 사용자 목록 + role 토글 (admin 전용) |
| `app/(app)/admin/audit/page.tsx` | brand_audit_log 전체 조회 |
| `app/(app)/admin/users/actions.ts` | updateUserRole Server Action |

### 세부 작업

1. `/settings`:
   - `supabaseServer().auth.getUser()` → profile 조회
   - 이름·팀 수정: `profiles` UPDATE
   - 비밀번호 변경: `supabaseBrowser().auth.updateUser({ password })`
2. `/admin/users`:
   - auth.users 목록 (`supabaseAdmin()`으로 service_role 조회)
   - role 토글: `profiles.role UPDATE` (admin만 가능)
3. `/admin/audit`:
   - brand_audit_log 페이지네이션 테이블
   - 필터: 날짜 범위, action 타입, actor
4. app-bar 우상단 프로필 드롭다운 추가: 사용자명 + 로그아웃 버튼

### 의사결정 사항

- 사용자 목록은 `auth.users` 직접 조회 필요 → `supabaseAdmin()` 불가피
- admin 페이지 첫 진입 시 현재 로그인 사용자 role 확인 방법: middleware or layout에서

### 검증 시나리오

```
1. /settings → 이름 변경 → 저장 → 변경 반영 확인
2. /admin/users → viewer 계정 role → admin으로 변경 → 해당 계정 /admin/users 접근 가능
3. /admin/audit → brand_audit_log 최근 10건 표시 확인
4. 로그아웃 버튼 → 세션 삭제 → /auth/login 이동
```

---

## 단계 F — Server Action 점진 전환

**목표**: service_role 우회 + actor 하드코딩 → 세션 기반 인증 + 동적 actor.

### 전환 대상 파일

| 파일 | 전환 내용 |
|---|---|
| `app/(app)/brands/actions.ts` | `toggleCompetitor` → viewer 이상 인증 확인 |
| `app/(app)/insights/manage/actions.ts` | 모든 Action → 세션 검증 + admin 확인 + actor 동적 주입 |

### 세부 작업 순서

1. `brands/actions.ts` `toggleCompetitor`:
   - `supabaseServer().auth.getUser()` → null이면 에러 반환
   - role 확인 불필요 (viewer 이상이면 가능)
2. `manage/actions.ts` `searchMusinsaBrand`:
   - 인증 확인만 (역할 무관, 읽기)
3. `manage/actions.ts` `assignBrandToCompany`, `removeBrandFromCompany`, `addCustomBrand`:
   - 세션 검증 + admin role 확인
   - `actor` 필드: `"정호철"` 하드코딩 → `user.email`
4. 전환 후 `ACTOR` 상수 제거
5. 전체 Server Action grep 목록 작성 → 누락 없이 확인

### 의사결정 사항

- service_role `supabaseAdmin()` 유지 여부: RLS bypass 목적으로 계속 사용. 단 **세션 검증 선행** 필수.
- 기존 admin.ts 파일 삭제 여부: Phase 2.0 전 단계에서 결정

### 검증 시나리오

```
1. 미로그인 → /insights/manage에서 brand 제거 시도 → "로그인 필요" 에러
2. viewer 계정 → brand 제거 시도 → "권한 없음" 에러
3. admin 계정 → brand 제거 → brand_audit_log.actor = user.email (동적)
4. viewer 계정 → brands is_competitor 토글 → 성공
```
