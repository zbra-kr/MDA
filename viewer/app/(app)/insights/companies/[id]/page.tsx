// viewer/app/(app)/insights/companies/[id]/page.tsx
// 회사 상세 대시보드 — 재무 시계열 + 공시 + 브랜드 메타데이터
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompanyDashboard } from "@/lib/queries-insights";
import { fmtRevenueMkrw, fmtDate } from "@/lib/format";
import { SectionCard } from "@/components/radar/section-card";
import { FinChart } from "./fin-chart";

interface PageProps {
  params: Promise<{ id: string }>;
}

const DISCLOSURE_TYPE_LABEL: Record<string, string> = {
  A: "정기",
  B: "주요사항",
  D: "지분",
};

const PRICE_TIER_COLOR: Record<string, string> = {
  저가: "text-chart-4",
  중가: "text-fg-secondary",
  프리미엄: "text-chart-3",
  럭셔리: "text-chart-2",
};

export default async function CompanyDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getCompanyDashboard(id);
  if (!data) notFound();

  const { company, financials, disclosures, brands } = data;

  // 최근 FY 재무
  const latestFin = financials.at(-1);
  const prevFin = financials.at(-2);

  function revYoy() {
    if (!latestFin?.revenue_mkrw || !prevFin?.revenue_mkrw) return null;
    return ((latestFin.revenue_mkrw - prevFin.revenue_mkrw) / prevFin.revenue_mkrw) * 100;
  }
  const yoy = revYoy();

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1.5 text-sm text-fg-tertiary mb-6">
        <Link href="/insights/companies" className="hover:text-fg-primary">회사 대시보드</Link>
        <span className="text-fg-quaternary">/</span>
        <span className="text-fg-secondary">{company.name}</span>
      </nav>

      {/* 헤더 */}
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-fg-primary tracking-display">
              {company.name}
            </h1>
            {company.is_own && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-sm bg-house/20 text-house-soft border border-house/30">
                자사
              </span>
            )}
            <span className="text-xs text-fg-quaternary font-mono">
              {company.listing_type === "listed" ? "상장" : "비상장"}
            </span>
          </div>
          {company.name_alt && (
            <p className="text-sm text-fg-tertiary">{company.name_alt}</p>
          )}
          <p className="text-xs text-fg-quaternary mt-1 font-mono">
            {company.corp_code && `DART ${company.corp_code}`}
            {company.stock_code && ` · 종목코드 ${company.stock_code}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-fg-quaternary uppercase tracking-wide mb-1">FY{latestFin?.fiscal_year ?? "—"} 매출</p>
          <p className="text-2xl font-semibold num text-fg-primary">
            {fmtRevenueMkrw(latestFin?.revenue_mkrw ?? null)}
          </p>
          {yoy != null && (
            <p className={`text-xs font-mono mt-1 ${yoy >= 0 ? "text-trend-up" : "text-trend-down"}`}>
              {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}% YoY
            </p>
          )}
        </div>
      </div>

      {/* KPI 스트립 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard label="영업이익" value={fmtRevenueMkrw(latestFin?.operating_income_mkrw ?? null)} />
        <KpiCard label="순이익" value={fmtRevenueMkrw(latestFin?.net_income_mkrw ?? null)} />
        <KpiCard label="총자산" value={fmtRevenueMkrw(latestFin?.total_assets_mkrw ?? null)} />
        <KpiCard label="Brand 수" value={brands.total > 0 ? String(brands.total) : "—"} />
      </div>

      {/* 재무 차트 */}
      <div className="mb-6">
        <SectionCard title="재무 시계열" meta={`${financials.length}개 연도`}>
          <FinChart financials={financials} />
        </SectionCard>
      </div>

      {/* 공시 + 브랜드 2단 */}
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        {/* 최근 공시 */}
        <SectionCard title="최근 공시" meta={`${disclosures.length}건`} bodyClassName="p-0">
          {disclosures.length === 0 ? (
            <p className="text-sm text-fg-quaternary px-6 py-5">공시 없음</p>
          ) : (
            <ul>
              {disclosures.map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-6 py-3 border-b border-border-hair last:border-0 hover:bg-hover transition-colors">
                  <span className="shrink-0 mt-0.5 text-2xs font-mono px-1 py-px rounded-sm bg-sunken text-fg-quaternary border border-border-hair">
                    {DISCLOSURE_TYPE_LABEL[d.disclosure_type] ?? d.disclosure_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={d.dart_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-fg-primary hover:text-chart-1 truncate block transition-colors"
                    >
                      {d.report_nm}
                    </a>
                    <p className="text-xs font-mono text-fg-quaternary mt-0.5">{fmtDate(d.rcept_dt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 산하 브랜드 */}
        <SectionCard
          title="산하 Brand"
          meta={`총 ${brands.total}개 · 무신사 ${brands.musinsa_listed}개`}
          bodyClassName="p-4"
        >
          {brands.total === 0 ? (
            <p className="text-sm text-fg-quaternary px-2 py-2">브랜드 없음</p>
          ) : (
            <div className="flex flex-col gap-2">
              {brands.list.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-md bg-raised border border-border-hair">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {b.musinsa_brand_id ? (
                        <a
                          href={`https://www.musinsa.com/brand/${b.musinsa_brand_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-fg-primary hover:text-chart-1 truncate transition-colors"
                        >
                          {b.name}
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-fg-secondary truncate">{b.name}</p>
                      )}
                      {b.musinsa_brand_id ? (
                        <span className="shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-chart-1/10 text-chart-1 border border-chart-1/20">
                          무신사
                        </span>
                      ) : (
                        <span className="shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-sunken text-fg-quaternary border border-border-hair">
                          자체몰
                        </span>
                      )}
                    </div>
                    {b.description && (
                      <p className="text-xs text-fg-tertiary mt-0.5 line-clamp-1">{b.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {b.brand_category && (
                        <span className="text-2xs font-mono px-1 rounded-sm bg-sunken text-fg-tertiary border border-border-hair">
                          {b.brand_category}
                        </span>
                      )}
                      {b.target_gender && (
                        <span className="text-2xs font-mono px-1 rounded-sm bg-sunken text-fg-quaternary border border-border-hair">
                          {b.target_gender}
                        </span>
                      )}
                    </div>
                  </div>
                  {b.price_tier && (
                    <span className={`shrink-0 text-xs font-mono ${PRICE_TIER_COLOR[b.price_tier] ?? "text-fg-tertiary"}`}>
                      {b.price_tier}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-md px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-2">{label}</p>
      <p className="text-xl font-semibold num text-fg-primary">{value}</p>
    </div>
  );
}
