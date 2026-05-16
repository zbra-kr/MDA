// viewer/app/(app)/insights/compare/page.tsx
// 자사 vs 경쟁사 비교 페이지 (서버 fetch → 클라이언트 차트)
import { getCompetitorComparisonData } from "@/lib/queries-insights";
import { CompareClient } from "./compare-client";

export default async function ComparePage() {
  const companies = await getCompetitorComparisonData();
  const withFin = companies.filter((c) => c.fy2024 != null);

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-display">
          자사 vs 경쟁사 비교
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">
          FY2024 연간 재무 기준 · {companies.length}개 회사 · 재무 보유 {withFin.length}개
        </p>
      </div>

      <CompareClient companies={companies} />
    </main>
  );
}
