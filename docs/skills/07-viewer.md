# Skill 07: Viewer (Next.js on Vercel)

> 사용자가 매일 들어와서 보는 웹 대시보드. Supabase 직결, 읽기 전용.

## 1. 디렉토리

```
viewer/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  오늘의 리포트
│   ├── globals.css
│   ├── reports/
│   │   └── [date]/page.tsx       특정 일자 리포트
│   ├── products/
│   │   └── [id]/page.tsx         상품 드릴다운 (30일 트렌드)
│   ├── brands/
│   │   └── [slug]/page.tsx       브랜드별 보기
│   └── api/                      필요시 (대부분 Supabase 직결로 불필요)
├── components/
│   ├── ui/                       shadcn/ui 컴포넌트
│   ├── ranking-trend-chart.tsx
│   ├── price-trend-chart.tsx
│   ├── anomaly-card.tsx
│   ├── finding-card.tsx
│   ├── priority-badge.tsx
│   └── product-image.tsx
└── lib/
    ├── supabase.ts               anon 키 클라이언트
    ├── queries.ts                재사용 쿼리 함수
    └── format.ts                 가격·날짜 포맷
```

## 2. 기술 스택

```json
{
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "@supabase/supabase-js": "^2.45",
    "@supabase/ssr": "^0.5",
    "tailwindcss": "^3.4",
    "recharts": "^2.13",
    "date-fns": "^3.6",
    "lucide-react": "^0.460"
  }
}
```

shadcn/ui는 components/ui에 복사하는 방식. Tailwind v3 사용 (v4는 아직 호환성 검토 필요).

## 3. Supabase 클라이언트 (`lib/supabase.ts`)

```typescript
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 서버 컴포넌트용
export async function createServer() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},  // read-only
    },
  });
}

// 클라이언트 컴포넌트용
export function createBrowser() {
  return createBrowserClient(URL, ANON_KEY);
}
```

**왜 anon 키만 쓰는가**: Vercel은 untrusted 환경. service_role 키는 절대 노출 금지. RLS로 읽기만 허용.

## 4. RLS 정책 보장

뷰어가 접근하는 모든 테이블에 다음 정책 있어야 (`supabase/migrations/00001_init.sql` 참조):
```sql
create policy "anon read" on <table> for select to anon using (true);
```

자사 매출 금액 등 민감 정보는 별도 view로 마스킹 후 RLS 적용 가능 (Phase 3 고려).

## 5. 핵심 페이지 명세

### 5.1 `/` (오늘의 리포트)

```typescript
// app/page.tsx
export default async function HomePage() {
  const sb = await createServer();
  const today = new Date().toISOString().slice(0, 10);

  // 오늘의 daily_report
  const { data: report } = await sb
    .from("daily_reports")
    .select("*")
    .eq("report_date", today)
    .single();

  // 오늘의 findings (analyses + anomalies + products + matches)
  const findings = await fetchFindings(sb, today);

  return (
    <main>
      <ReportHeader report={report} />
      <SummaryStats findings={findings} />
      <FindingsList findings={findings} />
    </main>
  );
}
```

### 5.2 `/reports/[date]`

특정 일자 리포트. 같은 컴포넌트 재사용.

### 5.3 `/products/[id]`

상품 드릴다운:
- 30일 랭킹 트렌드 (Recharts LineChart)
- 30일 가격 변동
- 30일 리뷰 카운트
- 매칭된 자사 상품 리스트
- 과거 받은 분석 이력

쿼리 예시:
```typescript
const { data: snapshots } = await sb
  .from("product_snapshots")
  .select("snapshot_date, rank_main, current_price, review_count")
  .eq("product_id", id)
  .gte("snapshot_date", thirtyDaysAgo)
  .order("snapshot_date");
```

### 5.4 `/brands/[slug]`

브랜드별 보기:
- 해당 브랜드의 모니터링 중인 상품 리스트
- 최근 7일 이상 징후 카운트
- Top 10 상품 (랭킹 기준)

## 6. 핵심 컴포넌트

### 6.1 `ranking-trend-chart.tsx`

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Props = { data: { date: string; rank: number }[] };

export function RankingTrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis reversed domain={[1, 200]} />  {/* 랭킹은 낮을수록 위 */}
        <Tooltip />
        <Line type="monotone" dataKey="rank" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 6.2 `priority-badge.tsx`

```typescript
const styles = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-gray-100 text-gray-700 border-gray-200",
};

export function PriorityBadge({ priority }: { priority: "high"|"medium"|"low" }) {
  return <span className={`px-2 py-0.5 rounded border text-xs ${styles[priority]}`}>
    {priority.toUpperCase()}
  </span>;
}
```

### 6.3 `finding-card.tsx`

한 anomaly + analysis + matches를 한 카드로:
- 좌측: 경쟁상품 이미지·이름·브랜드
- 우측: 이상 징후 요약, 분석(가설·권고), 매칭 자사상품 미니 표

## 7. 정적/동적 렌더링 전략

- `/` 와 `/reports/[date]`: **dynamic** (매일 갱신, 캐시 의미 적음)
- `/products/[id]`: dynamic, ISR revalidate=300 (5분)
- `/brands/[slug]`: dynamic, ISR revalidate=600

Supabase에 직결하므로 ISR 안 써도 빠르지만, 트래픽 늘면 비용 줄임.

## 8. Realtime (선택 사항, Phase 3)

```typescript
"use client";
import { createBrowser } from "@/lib/supabase";

export function LiveReportIndicator() {
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    const sb = createBrowser();
    const channel = sb.channel("new-reports")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "daily_reports"
      }, () => setHasNew(true))
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);
  return hasNew ? <Banner>새 리포트가 도착했습니다 — 새로고침</Banner> : null;
}
```

## 9. 인증 (Phase 3 옵션)

기본은 인증 없이 사내망에서만 접근. 외부 노출 필요 시:
- Vercel Password Protection (Pro plan)
- 또는 Supabase Auth (이메일 매직링크) + 도메인 화이트리스트 (`@bcave.com` 만)

## 10. 배포 (Vercel)

1. GitHub repo의 `viewer/` 디렉토리를 root로 설정 (monorepo 모드)
2. 환경변수:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_READ_ONLY_DB_URL` (직접 SQL 호출 시)
3. 프로덕션 도메인: `radar.bcave.co.kr` 권장 (DNS는 인프라파트에 요청)

## 11. 성능 목표
- LCP < 2.5초
- TBT < 200ms
- 메인 페이지 쿼리 합산 < 500ms

## 12. 단위·E2E 테스트
- 컴포넌트: vitest + @testing-library/react
- 쿼리: Supabase 로컬 인스턴스
- E2E: Playwright (워커와 별도 인스턴스)

## 13. 거버넌스
- 외부 공유 가능한 정보만 노출 (자사 매출 절대 금액은 권한자만 — 추후 인증 추가 시 분기)
- 모든 페이지 푸터에 "AI 생성 분석" 표기
- 사용자 행동 트래킹 안 함 (개인정보 미수집)
