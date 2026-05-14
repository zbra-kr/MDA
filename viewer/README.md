# viewer/

B.CAVE Competitor Radar의 웹 뷰어. Next.js 15 App Router + TypeScript +
Tailwind v3 + Supabase. Claude Design 핸드오프 번들(`MDA.zip`)을 통합한
결과물이다.

## 빠른 시작

```bash
cp .env.example .env.local        # NEXT_PUBLIC_USE_MOCK=true 면 Supabase 불필요
npm install
npx shadcn@latest add button input textarea select dropdown-menu \
  popover dialog tabs tooltip toggle-group checkbox switch skeleton alert
npm run dev                       # localhost:3000 → /reports/today
```

`components/ui/`는 비어 있다 — 위 `shadcn add`가 primitive를 채운다.

## mock ↔ Supabase 전환

화면은 기본적으로 `lib/mock-data.ts`의 더미 데이터로 렌더된다.
실제 Supabase에 연결하려면:

1. Supabase 마이그레이션 적용 (`../supabase/migrations/`, 순서: 00001 → 00002 → 00004 → 00003)
2. `.env.local` 에 `NEXT_PUBLIC_USE_MOCK=false` + URL/ANON_KEY 설정
3. `npm run types` 로 `lib/supabase/types.ts` 교체 (현재는 stub)
4. `lib/queries.ts` 각 함수의 `// SUPABASE:` 주석 블록 활성화

페이지 코드(`app/`)는 `lib/queries.ts`만 호출하므로 전환 시 건드릴 필요 없다.

## 구조

```
app/(app)/
  layout.tsx              AppBar + footer
  reports/[date]/         화면 1 — 오늘의 리포트 (대시보드)
  anomalies/[id]/         화면 2 — 이상 징후 드릴다운
  reports/today/          최신 리포트로 리다이렉트
  {anomalies,trends,matches,settings}/   Phase 3+ 플레이스홀더
components/radar/         도메인 컴포넌트 13종
lib/
  queries.ts              데이터 접근 레이어 (mock↔Supabase 스위치)
  mock-data.ts            더미 데이터
  format.ts severity.ts   포맷·심각도 헬퍼
  supabase/               server·client·types
```

## 디자인 시스템

- 토큰 원천: `app/globals.css` 안에 병합된 `radar.tokens v0.3`
- 색은 전부 CSS 변수 → `tailwind.config.ts`가 Tailwind 클래스로 브릿지
- 폰트: Pretendard Variable + JetBrains Mono (globals.css CDN @import)
- 다크모드 기본, `data-theme` 속성 전략, localStorage 키 `radar-theme-v3`

## 핸드오프 원본

Claude Design이 생성한 원본 목업·스타터는 `MDA.zip` 참조.
- `design-reference/*.html` — Hi-Fi HTML 목업 (브라우저로 직접 열어 비교)
- `design-reference/tokens.css` — 토큰 원천 (globals.css에 이미 병합됨)
- `README.md` — 13장 상세 구현 가이드 (Supabase 쿼리 매핑 포함)

목업과 픽셀 단위로 비교하려면 `design-reference/dashboard.html`,
`anomaly.html`을 로컬 dev 서버 옆에 띄워두고 대조한다.

## 배포 (Vercel)

monorepo 모드로 `viewer/`를 root로 지정. 환경변수는 `.env.example` 참조.
프로덕션 도메인: `radar.bcave.co.kr` (DNS는 인프라파트 요청).
