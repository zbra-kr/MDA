// viewer/app/(app)/page.tsx
// B.CAVE Competitor Radar — 메인 대시보드
// 자사 vs 경쟁 · 자사 Brand TOP · 최근 공시 · 매핑 요약 · 이상상품 placeholder
import Link from "next/link";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { getMainDashboardData, getOwnBrandsData } from "@/lib/queries-dashboard";
import { fmtRevenueMkrw, fmtDate } from "@/lib/format";
import { KpiStrip, type KpiItem } from "@/components/radar/kpi-strip";
import { SectionCard } from "@/components/radar/section-card";

export default async function HomePage() {
  const [dash, ownBrands] = await Promise.all([
    getMainDashboardData(),
    getOwnBrandsData(),
  ]);

  // 자사 brand TOP 5 — 주간 평균 랭킹 오름차순 (null 뒤로)
  const brandTop5 = [...ownBrands]
    .sort((a, b) => {
      if (a.avg_rank_week == null) return 1;
      if (b.avg_rank_week == null) return -1;
      return a.avg_rank_week - b.avg_rank_week;
    })
    .slice(0, 5);

  const kpiItems: KpiItem[] = [
    {
      label: "자사 매출 (FY2024)",
      value: fmtRevenueMkrw(dash.own_revenue_mkrw),
      sub: <span className="text-fg-quaternary">연간 기준</span>,
    },
    {
      label: "경쟁사 평균 매출",
      value: fmtRevenueMkrw(dash.competitor_avg_revenue_mkrw),
      sub: (
        <span className="text-fg-quaternary">
          {dash.competitor_count > 0 ? `${dash.competitor_count}개사 FY2024` : "데이터 없음"}
        </span>
      ),
    },
    {
      label: "자사 총자산 (FY2024)",
      value: fmtRevenueMkrw(dash.own_assets_mkrw),
      sub: <span className="text-fg-quaternary">재무제표 기준</span>,
    },
    {
      label: "자사 Brand",
      value: dash.own_brand_count,
      unit: "개",
      sub: <span className="text-fg-quaternary">무신사 입점 Brand</span>,
    },
  ];

  const disclosureTypeLabel: Record<string, string> = {
    A: "정기",
    B: "주요사항",
    D: "지분",
    F: "감사",
  };

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <section className="flex items-start justify-between gap-10 pb-8 mb-8 border-b border-border-subtle">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-tertiary mb-2">
            B.CAVE Competitor Radar
          </p>
          <h1 className="text-4xl font-semibold text-fg-primary tracking-display mb-2">
            경쟁 현황 요약
          </h1>
          <p className="text-sm text-fg-tertiary">
            {dash.last_updated
              ? `마지막 갱신 · ${fmtDate(dash.last_updated)} 리포트`
              : "아직 리포트 없음 — 파이프라인 초기화 전"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/own"
            className="h-7 px-3 rounded-md border border-border text-xs font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors inline-flex items-center"
          >
            자사 운영
          </Link>
          <Link
            href="/insights/compare"
            className="h-7 px-3 rounded-md border border-border text-xs font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors inline-flex items-center"
          >
            전체 비교
          </Link>
        </div>
      </section>

      {/* KPI strip */}
      <div className="mb-8">
        <KpiStrip items={kpiItems} />
      </div>

      {/* 본문: 메인 + 사이드바 */}
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8">
        {/* 메인 컬럼 */}
        <div className="flex flex-col gap-8 min-w-0">
          {/* 자사 Brand TOP 5 */}
          <SectionCard
            title="자사 Brand 랭킹"
            meta="무신사 주간 평균 순위"
            actions={
              <Link
                href="/own"
                className="text-xs text-fg-tertiary hover:text-fg-primary transition-colors"
              >
                전체 보기
              </Link>
            }
          >
            {brandTop5.length === 0 ? (
              <p className="text-sm text-fg-quaternary py-4 text-center">
                스냅샷 데이터가 없습니다 — 5/22 이후 자동 채워집니다
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wide text-fg-quaternary border-b border-border-hair">
                    <th className="text-left pb-3 pr-4">Brand</th>
                    <th className="text-right pb-3 pr-4 num">평균 순위</th>
                    <th className="text-right pb-3 num">SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {brandTop5.map((b, i) => (
                    <tr key={b.id} className="border-b border-border-hair last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-sm bg-sunken text-2xs font-mono text-fg-tertiary inline-flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium text-fg-primary">{b.name}</span>
                          {b.price_tier && (
                            <span className="text-2xs text-fg-quaternary font-mono">
                              {b.price_tier}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right num text-fg-primary">
                        {b.avg_rank_week != null ? `${b.avg_rank_week.toLocaleString()}위` : "—"}
                      </td>
                      <td className="py-3 text-right num text-fg-secondary">
                        {b.sku_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* 최근 공시 5건 */}
          <SectionCard
            title="최근 공시"
            count={dash.recent_disclosures.length}
            meta="DART 전자공시"
          >
            {dash.recent_disclosures.length === 0 ? (
              <p className="text-sm text-fg-quaternary py-4 text-center">
                공시 데이터가 없습니다 — DART 수집 후 자동으로 표시됩니다
              </p>
            ) : (
              <div className="flex flex-col gap-0">
                {dash.recent_disclosures.map((d, i) => (
                  <div
                    key={d.id}
                    className={`flex items-start gap-3 py-3 ${
                      i < dash.recent_disclosures.length - 1
                        ? "border-b border-border-hair"
                        : ""
                    }`}
                  >
                    <span className="mt-px shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-sunken border border-border-hair text-fg-quaternary uppercase">
                      {disclosureTypeLabel[d.disclosure_type] ?? d.disclosure_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-fg-primary truncate">{d.report_nm}</div>
                      <div className="text-xs text-fg-tertiary mt-0.5">
                        {d.company_name && (
                          <span className="mr-2 font-medium">{d.company_name}</span>
                        )}
                        <span className="num">{d.rcept_dt}</span>
                      </div>
                    </div>
                    <a
                      href={d.dart_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-fg-quaternary hover:text-fg-primary transition-colors mt-0.5"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 이상상품 placeholder */}
          <SectionCard title="최근 이상 징후 상품">
            <div className="flex items-start gap-3 py-2">
              <AlertTriangle size={15} className="text-sev-med-fg shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-fg-secondary font-medium">
                  5/22 이후 자동 채워집니다
                </p>
                <p className="text-xs text-fg-tertiary mt-1">
                  이상탐지 알고리즘 데이터 누적 중 — 7일분 스냅샷 확보 시 활성화됩니다.
                  이상 징후 목록은{" "}
                  <Link href="/anomalies" className="underline hover:text-fg-primary">
                    이상 징후 페이지
                  </Link>
                  에서 확인할 수 있습니다.
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* 사이드바 */}
        <aside className="flex flex-col gap-6 sticky top-[110px] self-start">
          {/* 매핑 상태 요약 */}
          <div className="bg-surface border border-border-subtle rounded-md">
            <div className="px-5 py-3 border-b border-border-hair flex items-center justify-between">
              <h3 className="text-md font-semibold text-fg-primary">매핑 상태</h3>
              <Link
                href="/insights/status"
                className="text-xs text-fg-tertiary hover:text-fg-primary transition-colors"
              >
                상세 보기
              </Link>
            </div>
            <div className="p-5 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                  전체
                </div>
                <div className="text-2xl font-semibold num text-fg-primary">
                  {dash.mapping_summary.total_companies}
                </div>
                <div className="text-2xs text-fg-quaternary mt-0.5">사</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                  Brand
                </div>
                <div className="text-2xl font-semibold num text-fg-primary">
                  {dash.mapping_summary.total_mapped_brands}
                </div>
                <div className="text-2xs text-fg-quaternary mt-0.5">개</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                  부족
                </div>
                <div className="text-2xl font-semibold num text-sev-high-fg">
                  {dash.mapping_summary.deficient_companies}
                </div>
                <div className="text-2xs text-fg-quaternary mt-0.5">사</div>
              </div>
            </div>
          </div>

          {/* 바로가기 */}
          <div className="bg-surface border border-border-subtle rounded-md p-4 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-1">
              바로가기
            </p>
            {[
              { href: "/own", label: "자사 운영 현황", desc: "11개 Brand 랭킹·SKU" },
              { href: "/insights/compare", label: "자사 vs 경쟁 비교", desc: "FY2024 재무 비교" },
              { href: "/insights/status", label: "매핑 상태", desc: "98사 신호 강도" },
              { href: "/reports/today", label: "오늘 리포트", desc: "이상탐지·AI 분석" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-start gap-2 p-2 rounded hover:bg-hover transition-colors group"
              >
                <div>
                  <div className="text-sm font-medium text-fg-primary group-hover:text-fg-primary">
                    {link.label}
                  </div>
                  <div className="text-xs text-fg-quaternary">{link.desc}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* 거버넌스 노트 */}
          <div className="bg-surface border border-border-subtle rounded-md p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-sev-med-fg shrink-0 mt-0.5" />
              <p className="text-xs text-fg-tertiary leading-relaxed">
                재무 데이터는 DART 공시 기준이며 LLM 분석 포함. 최종 의사결정은 담당자가 합니다.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
