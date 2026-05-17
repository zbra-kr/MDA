# B.CAVE Competitor Radar — Viewer 페이지 구조

> 다른 AI에게 넘기기 위한 현황 문서.  
> 작성 기준: 2026-05-17 / Next.js 15 App Router / TypeScript strict / Tailwind v3

---

## 프로젝트 개요

무신사 경쟁 브랜드 모니터링 대시보드. 매일 수집된 랭킹·가격·이상탐지 데이터를 시각화한다.  
백엔드: Supabase (PostgreSQL + RLS). 뷰어는 **anon 키만** 사용 (service_role 사용 금지).  
데이터 접근은 반드시 `lib/queries.ts` / `lib/queries-anomaly.ts` / `lib/queries-dashboard.ts` / `lib/queries-insights.ts` 를 통해서만 한다. 페이지에서 Supabase 직접 호출 금지.

---

## 네비게이션 구조 (AppBar)

`viewer/components/radar/app-bar.tsx` — "use client", `usePathname()` 기반 활성 탭 감지.

```
로고 (→ /reports/today)
├── 대시보드          → /reports/today  (일별 리포트, KPI·그래프)
├── 자사 ▾           (드롭다운)
│   ├── 경쟁현황요약  → /              (메인 대시보드)
│   └── 자사운영현황  → /own
├── 이상탐지 ▾       (드롭다운)
│   ├── 이상 징후    → /anomalies
│   └── 트렌드       → /trends
├── 랭킹              → /products/today
├── 브랜드            → /brands
├── 회사 ▾           (드롭다운)
│   ├── 회사 목록    → /companies
│   └── 인사이트     → /insights/compare
├── 매칭              → /matches
└── 설정              → /settings
```

---

## 페이지 목록

### 1. `/` — 경쟁현황요약 (메인 대시보드)

**파일**: `app/(app)/page.tsx`  
**데이터**: `getMainDashboardData()`, `getOwnBrandsData()` (queries-dashboard.ts)  
**내용**: KPI 스트립(자사 vs 경쟁 집계), 자사 Brand TOP 5(주간 평균 랭킹), 최근 공시, 매핑 요약, 이상상품 플레이스홀더.  
**특이사항**: Server Component. Supabase cookies 사용 → dynamic 렌더링.

---

### 2. `/reports/today` → `/reports/[date]`

**파일**: `app/(app)/reports/today/page.tsx` (리다이렉트), `app/(app)/reports/[date]/page.tsx`  
**데이터**: `getReportMeta()`, `getKpis()`, `getTodayFindings()`, `getPipeline()`, `getSeverityDaily()` (queries.ts)  
**내용**: 오늘의 리포트 대시보드. KPI 스트립, 이상상품 테이블(`AnomalyTable`), 심각도 누적 막대 차트(`StackedSeverityChart`), AI 인사이트 카드(`AiInsightCard`), 파이프라인 상태(`PipelineStatus`).  
**리다이렉트 로직**: `daily_reports` 테이블에서 최신 날짜 조회 → 없으면 오늘 KST 날짜 사용.

---

### 3. `/own` — 자사운영현황

**파일**: `app/(app)/own/page.tsx`  
**데이터**: `getOwnBrandsData()` (queries-dashboard.ts)  
**내용**: 자사 브랜드(is_own=true) 카드 그리드. 브랜드별 오늘 상품 수·평균 랭킹·재고 상태 표시.

---

### 4. `/anomalies` — 이상 징후 목록

**파일**: `app/(app)/anomalies/page.tsx`  
**내용**: Phase placeholder (미구현). 실제 이상탐지 목록은 `/trends`에 구현되어 있음.

### 4-1. `/anomalies/[id]` — 이상 징후 상세

**파일**: `app/(app)/anomalies/[id]/page.tsx`  
**데이터**: `getAnomalyDetail(id)` (queries-anomaly.ts)  
**내용**: 단일 anomaly 드릴다운. 탐지 근거(evidence), LLM 분석 결과(`strategy_recommendation`), 자사 매칭 SKU 목록(`MatchedSkuCard`), 랭킹 궤적 차트(`RankTrajectoryChart`).

---

### 5. `/trends` — 이상탐지 트렌드

**파일**: `app/(app)/trends/page.tsx` (Server), `app/(app)/trends/trends-client.tsx` (Client)  
**데이터**: `getAnomalies(filter)`, `getAnomalyTimeSeries(from, to)` (queries-anomaly.ts)  
**필터 파라미터**: `?from=YYYY-MM-DD&to=YYYY-MM-DD&types=rank_surge,price_change,...`  
**내용**: 날짜 범위 선택기, 탐지 유형 필터, 시계열 막대 차트, 이상상품 카드 그리드.  
**카드 클릭**: 모달 오픈 → 심각도·탐지근거·LLM 분석 여부 표시.  
**모달 내 링크**:
- 상세 분석 → `/anomalies/{id}`
- 랭킹에서 {브랜드} 보기 → `/products/today?brand={slug}`
- 브랜드 정보 → `/brands`

**6가지 탐지 유형**: `rank_surge`, `price_change`, `review_velocity`, `new_entrant`, `promo_start`, `wishlist_surge`

---

### 6. `/products/today` — 랭킹

**파일**: `app/(app)/products/today/page.tsx`  
**데이터**: `getProductsToday({ category_code, brand_slug, date, limit, offset })` (queries.ts)  
**필터 파라미터**: `?date=YYYY-MM-DD&category={code}&brand={slug}&page={n}`  
**내용**: 날짜 선택기(`RankingDatePicker`), 카테고리 필터(`CategoryFilter`), 상품 랭킹 테이블 50개/페이지.  
**행 클릭**: 상세 모달 오픈 (`ProductDetailModal`)  
**모달 내 링크**:
- 이상탐지 내역 → `/trends?brand={slug}`
- 브랜드 정보 → `/brands?slug={slug}`
- 무신사에서 보기 → 외부 링크

---

### 7. `/brands` — 브랜드 관리

**파일**: `app/(app)/brands/page.tsx`  
**데이터**: `getBrands({ filter, sort, page })` (queries.ts)  
**필터**: `all` / `competitor` / `own` / `unreviewed` / `today_active`  
**정렬**: `today_products` / `name` / `created`  
**내용**: 통계 카드 5종, 브랜드 목록 테이블(`BrandsTable`), 경쟁사 토글(`CompetitorToggle`).  
**테이블 링크**:
- 브랜드명 → `/products/today?brand={slug}` (랭킹 필터)
- 오늘 상품 수 → `/products/today?brand={slug}`
- 소속 회사명 → `/companies/{company_id}`

---

### 8. `/companies` — 회사 목록

**파일**: `app/(app)/companies/page.tsx`  
**데이터**: `getCompanies({ sort, listing_type })` (queries.ts)  
**내용**: 상장/비상장·매출·영업이익률·오늘 활동 브랜드 수. 회사명 클릭 → `/companies/{id}`.

### 8-1. `/companies/[id]` — 회사 상세

**파일**: `app/(app)/companies/[id]/page.tsx`  
**내용**: 회사 재무 정보, 소속 브랜드 목록, DART 공시 내역.

---

### 9. `/insights/compare` — 자사 vs 경쟁사 비교

**파일**: `app/(app)/insights/compare/page.tsx`  
**데이터**: `getCompetitorComparisonData()` (queries-insights.ts)  
**내용**: 카테고리별 자사·경쟁사 랭킹 비교 차트.

### 9-1. `/insights/status` — 회사-브랜드 매핑 상태

**파일**: `app/(app)/insights/status/page.tsx`  
**내용**: 98개 회사의 브랜드 매핑 완성도, 미매핑 브랜드 목록.

### 9-2. `/insights/categories`, `/insights/manage`

카테고리별 분석, 매핑 수동 관리 UI (구현 단계).

---

### 10. `/matches` — 자사-경쟁사 매칭

**파일**: `app/(app)/matches/page.tsx`, `matches-client.tsx`  
**데이터**: `getMatches(filter)` (queries-anomaly.ts)  
**필터**: `score_min`, `brand_slugs`, `limit`  
**내용**: pgvector 유사도 기반 자사 SKU ↔ 경쟁 상품 매칭 결과. `MatchedSkuCard` 컴포넌트로 표시.

---

### 11. `/settings` — 설정

**파일**: `app/(app)/settings/page.tsx`  
**내용**: 프로필(이름·팀) 수정, 비밀번호 변경. 로그인 필요(`requireAuth()`).

---

## 데이터 레이어

| 파일 | 담당 도메인 |
|---|---|
| `lib/queries.ts` | 상품 랭킹, 브랜드, 회사, 카테고리, 리포트 KPI |
| `lib/queries-anomaly.ts` | 이상탐지(anomalies), 자사매칭(product_matches) |
| `lib/queries-dashboard.ts` | 메인 대시보드 집계, 자사 운영, 매핑 요약 |
| `lib/queries-insights.ts` | 자사 vs 경쟁사 비교 차트 데이터 |

---

## 주요 공통 컴포넌트

| 컴포넌트 | 설명 |
|---|---|
| `app-bar.tsx` | 2행 sticky 네비게이션. usePathname 활성탭. 드롭다운 서브메뉴. |
| `search-bar.tsx` | `/api/search` 호출 브랜드·상품 실시간 검색 (300ms 디바운스). |
| `products-table.tsx` | 랭킹 테이블 + 클릭 시 ProductDetailModal. |
| `brands-table.tsx` | 브랜드 테이블 + CompetitorToggle + 크로스 링크. |
| `companies-table.tsx` | 회사 테이블, 회사명 → /companies/{id}. |
| `section-card.tsx` | 타이틀·메타·바디로 구성된 카드 래퍼. |
| `kpi-strip.tsx` | 가로 KPI 카드 나열. |
| `stacked-severity-chart.tsx` | 심각도 누적 막대 차트 (Recharts). |
| `ranking-date-picker.tsx` | 날짜 input, 변경 시 URL 파라미터로 서버 재조회. |
| `category-filter.tsx` | 카테고리 드롭다운 필터. |
| `competitor-toggle.tsx` | 경쟁사 여부 토글 (Server Action). |
| `severity-tag.tsx` | high/med/low 심각도 배지. |

---

## URL 파라미터 규칙

| 페이지 | 파라미터 |
|---|---|
| `/products/today` | `date=YYYY-MM-DD`, `category={code}`, `brand={slug}`, `page={n}` |
| `/trends` | `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `types={comma-separated}` |
| `/brands` | `filter={all\|competitor\|own\|unreviewed\|today_active}`, `sort={today_products\|name\|created}`, `page={n}` |
| `/companies` | `sort={revenue\|op_margin\|today_active}`, `listing={all\|listed\|unlisted}` |

---

## 크로스 페이지 링크 맵

```
/products/today (상품 모달)
  → /trends?brand={slug}          이상탐지 내역
  → /brands?slug={slug}           브랜드 정보

/trends (이상탐지 모달)
  → /anomalies/{id}               상세 분석
  → /products/today?brand={slug}  랭킹에서 브랜드 보기
  → /brands                       브랜드 정보

/brands (테이블 행)
  → /products/today?brand={slug}  랭킹 필터 (브랜드명, 오늘 상품 수)
  → /companies/{company_id}       소속 회사 페이지

/companies (테이블 행)
  → /companies/{id}               회사 상세
```

---

## 코딩 규칙 요약

- **색상**: `app/globals.css` CSS 변수만 사용. 하드코딩 hex 금지.
- **숫자**: `num` 클래스 (JetBrains Mono, tnum). 랭킹 Y축 역축(1위 상단).
- **뷰어 키**: anon 키만. service_role은 `lib/supabase/admin.ts`에서만, Server Component 전용.
- **admin.ts 환경변수**: `SUPABASE_SERVICE_ROLE_KEY` (`.env.local`에 직접 추가 필요).
- **KST 날짜**: `new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })`.
- **데이터 접근**: 페이지에서 Supabase 직접 호출 금지. `lib/queries*.ts` 경유.
