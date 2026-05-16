// viewer/app/(app)/insights/status/page.tsx
// 회사-Brand 매핑 상태 — 98사 신호 카드 · 부족사 리스트 · 충돌 안내
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getMappingStatusData, getMappingSummary } from "@/lib/queries-dashboard";
import { KpiStrip, type KpiItem } from "@/components/radar/kpi-strip";
import { SectionCard } from "@/components/radar/section-card";
import type { MappingCompanyRow } from "@/lib/queries-dashboard";

// 신호 강도: 충분(green)·보통(amber)·부족(red) — 이모지 없이 색상 dot
const SIGNAL_DOT: Record<MappingCompanyRow["signal"], string> = {
  충분: "bg-trend-up",
  보통: "bg-sev-med-solid",
  부족: "bg-sev-high-solid",
};

const SIGNAL_TEXT: Record<MappingCompanyRow["signal"], string> = {
  충분: "text-trend-up",
  보통: "text-sev-med-fg",
  부족: "text-sev-high-fg",
};

export default async function MappingStatusPage() {
  const [{ companies, conflict_count }, summary] = await Promise.all([
    getMappingStatusData(),
    getMappingSummary(),
  ]);

  const deficientCompanies = companies.filter((c) => c.signal === "부족" && !c.is_own);
  const suffCount = companies.filter((c) => c.signal === "충분").length;
  const modCount  = companies.filter((c) => c.signal === "보통").length;
  const defCount  = companies.filter((c) => c.signal === "부족").length;

  const avgBrands =
    summary.total_companies > 0
      ? (summary.total_mapped_brands / summary.total_companies).toFixed(1)
      : "—";

  const kpiItems: KpiItem[] = [
    {
      label: "전체 회사",
      value: summary.total_companies,
      unit: "사",
      sub: (
        <span className="text-fg-quaternary">
          상장 49 + 비상장 49
        </span>
      ),
    },
    {
      label: "매핑 Brand 수",
      value: summary.total_mapped_brands,
      unit: "개",
      sub: (
        <span className="text-fg-quaternary">
          회사당 평균 {avgBrands}개
        </span>
      ),
    },
    {
      label: "부족사",
      value: summary.deficient_companies,
      unit: "사",
      valueClassName: summary.deficient_companies > 0 ? "text-sev-high-fg" : undefined,
      sub: (
        <span className="text-fg-quaternary">
          Brand 0~1개 회사
        </span>
      ),
    },
    {
      label: "신호 분포",
      value: (
        <span className="flex items-baseline gap-1">
          <span className="text-trend-up">{suffCount}</span>
          <span className="text-fg-quaternary text-2xl">/</span>
          <span className="text-sev-med-fg">{modCount}</span>
          <span className="text-fg-quaternary text-2xl">/</span>
          <span className="text-sev-high-fg">{defCount}</span>
        </span>
      ),
      breakdown: [
        { label: "충분", value: suffCount, color: "var(--trend-up)" },
        { label: "보통", value: modCount,  color: "var(--sev-med-solid)" },
        { label: "부족", value: defCount,  color: "var(--sev-high-solid)" },
      ],
    },
  ];

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="pb-8 mb-8 border-b border-border-subtle">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-tertiary mb-2">
          인사이트 · 매핑
        </p>
        <h1 className="text-4xl font-semibold text-fg-primary tracking-display">
          회사-Brand 매핑 상태
        </h1>
        <p className="text-sm text-fg-tertiary mt-2">
          v_company_brand_summary 기준 · 신호 강도: 충분 (Brand 5+ + 무신사 3+) · 보통 (2~4) · 부족 (0~1)
        </p>
      </div>

      {/* 매핑 통계 KPI */}
      <div className="mb-8">
        <KpiStrip items={kpiItems} />
      </div>

      {/* 98사 신호 카드 그리드 */}
      <SectionCard
        title="회사별 신호 강도"
        count={companies.length}
        meta="Brand 수 · 무신사 매핑 수"
        className="mb-6"
      >
        {companies.length === 0 ? (
          <p className="text-sm text-fg-quaternary py-4 text-center">
            데이터가 없습니다 — 마이그레이션 적용 후 자동으로 표시됩니다
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {companies.map((c) => (
              <div
                key={c.id}
                className="bg-sunken border border-border-hair rounded p-3 flex flex-col gap-1.5"
              >
                {/* 회사명 + 신호 dot */}
                <div className="flex items-start gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${SIGNAL_DOT[c.signal]}`}
                  />
                  <span className="text-xs font-medium text-fg-primary leading-snug line-clamp-2">
                    {c.name}
                    {c.is_own && (
                      <span className="ml-1 text-2xs font-mono text-house-soft">자사</span>
                    )}
                  </span>
                </div>
                {/* Brand 수 / 무신사 매핑 수 */}
                <div className="flex items-center gap-2 text-2xs font-mono text-fg-quaternary pl-3">
                  <span>
                    <span className={`font-semibold ${SIGNAL_TEXT[c.signal]}`}>
                      {c.brand_count}
                    </span>{" "}
                    Brand
                  </span>
                  <span className="text-border-subtle">·</span>
                  <span>
                    <span className="text-fg-tertiary">{c.musinsa_present_count}</span>{" "}
                    무신사
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-6">
        {/* 부족사 리스트 */}
        <SectionCard
          title="부족사 리스트"
          count={deficientCompanies.length}
          meta="Brand 0~1개 회사"
        >
          {deficientCompanies.length === 0 ? (
            <p className="text-sm text-fg-quaternary py-2">
              부족사가 없습니다.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-0 mb-4">
                {deficientCompanies.map((c, i) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between py-2.5 ${
                      i < deficientCompanies.length - 1 ? "border-b border-border-hair" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${SIGNAL_DOT[c.signal]}`}
                      />
                      <span className="text-sm text-fg-primary">{c.name}</span>
                    </div>
                    <span className="text-xs font-mono text-sev-high-fg">
                      Brand {c.brand_count}개
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-border-hair">
                <p className="text-xs text-fg-tertiary">
                  /insights/manage 에서 Brand 매핑을 정정할 수 있습니다.
                </p>
                <Link
                  href="/insights/manage"
                  className="mt-2 inline-flex items-center h-7 px-3 rounded-md border border-border text-xs font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors"
                >
                  매핑 관리로 이동
                </Link>
              </div>
            </>
          )}
        </SectionCard>

        {/* 충돌 안내 카드 */}
        <SectionCard title="매핑 충돌 안내" meta="Phase 1.5.2 · medium confidence">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={14} className="text-sev-med-fg shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-fg-primary font-medium">
                {conflict_count > 0 ? `${conflict_count}건` : "—"} · medium 신뢰도 Brand
              </p>
              <p className="text-xs text-fg-tertiary mt-1 leading-relaxed">
                kangol · spao 등 복수 회사에 걸쳐 있거나 매핑 신뢰도가 medium 인 Brand.
                Phase 1.5.2 자동 매핑 결과 — 운영자 검토 후 confidence 를 high 로 변경하거나
                매핑을 해제하세요.
              </p>
            </div>
          </div>
          <Link
            href="/insights/manage"
            className="inline-flex items-center h-7 px-3 rounded-md border border-border text-xs font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors"
          >
            매핑 관리에서 검토
          </Link>
        </SectionCard>
      </div>
    </main>
  );
}
