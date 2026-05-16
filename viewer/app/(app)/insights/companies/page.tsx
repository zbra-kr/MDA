// viewer/app/(app)/insights/companies/page.tsx
// 회사 대시보드 진입 목록 — 회사 선택 → /insights/companies/[id]
import Link from "next/link";
import { getInsightCompanyList } from "@/lib/queries-insights";
import { fmtRevenueMkrw } from "@/lib/format";
import { SectionCard } from "@/components/radar/section-card";

export default async function InsightCompaniesPage() {
  const rows = await getInsightCompanyList();
  const withFin = rows.filter((r) => r.has_financials);

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-display">
          회사 대시보드
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">
          {rows.length}개 회사 · 재무 보유 {withFin.length}개 · 클릭해서 상세보기
        </p>
      </div>

      <SectionCard title="회사 목록" meta={`${rows.length}개`} bodyClassName="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-hair">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-quaternary">
                회사명
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-quaternary">
                구분
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-fg-quaternary">
                최신 매출
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-fg-quaternary">
                brand 수
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border-hair last:border-0 hover:bg-hover transition-colors"
              >
                <td className="px-6 py-3">
                  <Link
                    href={`/insights/companies/${r.id}`}
                    className="font-medium text-fg-primary hover:text-chart-1 transition-colors"
                  >
                    {r.name}
                    {r.is_own && (
                      <span className="ml-2 text-2xs font-mono px-1 py-px rounded-sm bg-house/20 text-house-soft border border-house/30">
                        자사
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-fg-tertiary">
                  {r.listing_type === "listed" ? "상장" : "비상장"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="num text-fg-primary">{r.revenue_mkrw != null ? fmtRevenueMkrw(r.revenue_mkrw) : "—"}</span>
                  {r.fiscal_year_shown && (
                    <span className="ml-1.5 text-2xs font-mono text-fg-quaternary">FY{r.fiscal_year_shown}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right num text-fg-tertiary">
                  {r.brand_count > 0 ? r.brand_count : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </main>
  );
}
