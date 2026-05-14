// viewer/app/(app)/anomalies/[id]/page.tsx
// 화면 2 — 이상 징후 드릴다운
// Mock: design-reference/anomaly.html
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Check, X, Share2, BookMarked, ExternalLink } from "lucide-react";
import {
  getFinding,
  getAnomalyKpis,
  getProductTrend,
  getAnalysis,
  getMatches,
  getTimeline,
} from "@/lib/queries";
import { fmtKRW, fmtDelta } from "@/lib/format";
import { severityTier } from "@/lib/severity";
import { KpiStrip, type KpiItem } from "@/components/radar/kpi-strip";
import { SeverityTag } from "@/components/radar/severity-tag";
import { RankTrajectoryChart } from "@/components/radar/rank-trajectory-chart";
import { AiInsightCard } from "@/components/radar/ai-insight-card";
import { EvidenceTable, type EvidenceSignal } from "@/components/radar/evidence-table";
import { MatchedSkuCard } from "@/components/radar/matched-sku-card";
import { ActivityTimeline } from "@/components/radar/activity-timeline";
import { SectionCard } from "@/components/radar/section-card";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ANOMALY_LABEL: Record<string, string> = {
  rank_surge: "랭킹 급상승",
  price_change: "가격 변동",
  review_velocity: "리뷰 폭증",
  new_entrant: "신규 진입",
  promo_start: "프로모션",
  wishlist_surge: "위시리스트 급증",
};

export default async function AnomalyDetailPage({ params }: PageProps) {
  const { id } = await params;

  const finding = await getFinding(id);
  if (!finding) notFound();

  const [kpis, trend, analysis, matches, timeline] = await Promise.all([
    getAnomalyKpis(id),
    getProductTrend(finding.product_id, 30),
    getAnalysis(id),
    getMatches(finding.product_id),
    getTimeline(finding.product_id),
  ]);

  const tier = severityTier(finding.severity);
  const d1 = fmtDelta(kpis.delta_rank_1d, "rank");
  const d7 = fmtDelta(kpis.delta_rank_7d, "rank");
  const wishDelta = fmtDelta(
    kpis.delta_wishlist_pct,
    "value",
    { unit: "%" },
  );

  const kpiItems: KpiItem[] = [
    {
      label: "현재 랭킹",
      value: kpis.rank_main ?? "—",
      unit: "위",
    },
    {
      label: "Δ 1일",
      value: `${d1.sign}${d1.abs}`,
      valueClassName:
        d1.trend === "up"
          ? "text-trend-up"
          : d1.trend === "down"
            ? "text-trend-down"
            : "",
    },
    {
      label: "Δ 7일",
      value: `${d7.sign}${d7.abs}`,
      valueClassName:
        d7.trend === "up"
          ? "text-trend-up"
          : d7.trend === "down"
            ? "text-trend-down"
            : "",
    },
    {
      label: "위시리스트",
      value: kpis.wishlist_count?.toLocaleString() ?? "—",
      sub: (
        <span className={wishDelta.trend === "up" ? "text-trend-up" : "text-fg-tertiary"}>
          {wishDelta.sign}
          {wishDelta.abs}
        </span>
      ),
    },
    {
      label: "리뷰 속도",
      value: kpis.review_velocity_x != null ? `${kpis.review_velocity_x}x` : "—",
      sub: <span className="text-fg-tertiary">14일 평균 대비</span>,
    },
    {
      label: "심각도",
      value: finding.severity.toFixed(2),
      valueClassName:
        tier === "high"
          ? "text-sev-high-fg"
          : tier === "med"
            ? "text-sev-med-fg"
            : "text-sev-low-fg",
    },
  ];

  // evidence JSONB → 신호 행
  const signals = buildEvidenceSignals(finding);

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* back row + actions */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/reports/today"
          className="inline-flex items-center gap-1.5 text-sm text-fg-tertiary hover:text-fg-primary transition-colors"
        >
          <ChevronLeft size={14} />
          오늘의 리포트로
        </Link>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-fg-primary text-fg-inverse text-sm font-medium hover:opacity-90 transition-opacity">
            <Check size={12} /> 분석 채택
          </button>
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
            <X size={12} /> 기각
          </button>
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
            <Share2 size={12} /> Slack
          </button>
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
            <BookMarked size={12} /> Notion
          </button>
        </div>
      </div>

      {/* product hero */}
      <section className="flex items-start gap-6 pb-8 mb-8 border-b border-border-subtle">
        {/* image slot */}
        <div className="w-40 h-40 rounded-md bg-sunken border border-border-subtle shrink-0 flex items-center justify-center text-fg-quaternary text-2xs font-mono">
          상품 이미지
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-tertiary mb-2">
            {finding.brand_name}
            {finding.brand_is_own && (
              <span className="text-house-soft">자사</span>
            )}
            <span className="text-fg-quaternary">·</span>
            {ANOMALY_LABEL[finding.anomaly_type]}
          </p>
          <h1 className="text-3xl font-semibold text-fg-primary tracking-[-0.02em] mb-2">
            {finding.product_name}
          </h1>
          <a
            href={finding.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-fg-tertiary hover:text-fg-primary transition-colors mb-4"
          >
            무신사 #{finding.musinsa_no}
            <ExternalLink size={11} />
          </a>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-fg-tertiary">
              현재가{" "}
              <span className="num text-fg-primary ml-1">
                {fmtKRW(finding.current_price)}
              </span>
            </span>
            <span className="text-fg-tertiary">
              리뷰{" "}
              <span className="num text-fg-primary ml-1">
                {finding.review_count?.toLocaleString() ?? "—"}
              </span>
            </span>
          </div>
        </div>
        <SeverityTag tier={tier} score={finding.severity} className="shrink-0" />
      </section>

      {/* KPI strip — 6칸 */}
      <div className="mb-8">
        <KpiStrip items={kpiItems} cols={6} />
      </div>

      {/* body: main + sidebar */}
      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8">
        {/* main */}
        <div className="flex flex-col gap-8 min-w-0">
          {/* rank trajectory */}
          <SectionCard title="30일 랭킹 추이" meta="역축 — 1위가 상단">
            <RankTrajectoryChart
              data={trend.map((t) => ({
                date: t.date,
                rank_main: t.rank_main,
              }))}
              anomalyAt={finding.detected_on}
            />
          </SectionCard>

          {/* AI analysis — full */}
          {analysis && (
            <div>
              <h3 className="mb-4 text-md font-semibold text-fg-primary">
                AI 전략 분석
              </h3>
              <AiInsightCard analysis={analysis} full />
            </div>
          )}

          {/* evidence table */}
          <SectionCard title="탐지 근거" meta="신호별 기여도">
            <EvidenceTable signals={signals} />
          </SectionCard>
        </div>

        {/* sidebar */}
        <aside className="flex flex-col gap-7 min-w-0">
          {/* severity breakdown */}
          <div className="bg-surface border border-border-subtle rounded-md">
            <div className="px-5 py-3 border-b border-border-hair">
              <h3 className="text-md font-semibold text-fg-primary">
                심각도 분해
              </h3>
            </div>
            <div className="p-5">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-4xl font-semibold num text-fg-primary">
                  {finding.severity.toFixed(2)}
                </span>
                <SeverityTag tier={tier} />
              </div>
              <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${finding.severity * 100}%`,
                    background:
                      tier === "high"
                        ? "var(--sev-high-solid)"
                        : tier === "med"
                          ? "var(--sev-med-solid)"
                          : "var(--sev-low-solid)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* matched SKUs */}
          <div>
            <h3 className="flex items-baseline gap-2 mb-4 text-md font-semibold text-fg-primary">
              자사 매칭 SKU
              <span className="text-xs font-mono text-fg-quaternary">
                {matches.length}건
              </span>
            </h3>
            <div className="flex flex-col gap-3">
              {matches.map((m) => (
                <MatchedSkuCard key={m.id} match={m} />
              ))}
              {matches.length === 0 && (
                <p className="text-sm text-fg-quaternary py-4 text-center bg-surface border border-border-subtle rounded-md">
                  매칭된 자사 상품이 없습니다.
                </p>
              )}
            </div>
          </div>

          {/* timeline */}
          <div className="bg-surface border border-border-subtle rounded-md">
            <div className="px-5 py-3 border-b border-border-hair">
              <h3 className="text-md font-semibold text-fg-primary">
                30일 활동 타임라인
              </h3>
            </div>
            <div className="p-5">
              <ActivityTimeline events={timeline} />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

// evidence JSONB를 신호 행으로 — anomaly_type 별 분기
function buildEvidenceSignals(f: {
  anomaly_type: string;
  evidence: Record<string, unknown>;
}): EvidenceSignal[] {
  const e = f.evidence;
  switch (f.anomaly_type) {
    case "rank_surge":
      return [
        {
          name: "메인 랭킹",
          baseline: `${e.yesterday_rank}위`,
          current: `${e.today_rank}위`,
          delta: `−${e.delta}`,
          contribution: 0.62,
          trend: "up",
        },
        {
          name: "임계 초과율",
          baseline: `${e.threshold}위`,
          current: `${e.delta}위`,
          delta: `${Math.round((Number(e.delta) / Number(e.threshold) - 1) * 100)}%`,
          contribution: 0.38,
          trend: "up",
        },
      ];
    case "price_change":
      return [
        {
          name: "노출가",
          baseline: `${Number(e.yesterday_price).toLocaleString()}원`,
          current: `${Number(e.today_price).toLocaleString()}원`,
          delta: `${e.delta_pct}%`,
          contribution: 0.7,
          trend: "down",
        },
        {
          name: "할인 적용",
          baseline: "없음",
          current: String(e.trigger ?? "—"),
          delta: "신규",
          contribution: 0.3,
          trend: "flat",
        },
      ];
    case "review_velocity":
      return [
        {
          name: "일일 신규 리뷰",
          baseline: `${e.avg_n}건`,
          current: `${e.today_count}건`,
          delta: `${e.ratio}x`,
          contribution: 1.0,
          trend: "up",
        },
      ];
    case "wishlist_surge":
      return [
        {
          name: "위시리스트",
          baseline: `${Number(e.prev).toLocaleString()}`,
          current: `${Number(e.today).toLocaleString()}`,
          delta: `+${e.delta_pct}%`,
          contribution: 1.0,
          trend: "up",
        },
      ];
    case "new_entrant":
      return [
        {
          name: "진입 랭킹",
          baseline: "권외",
          current: `${e.today_rank}위`,
          delta: "신규",
          contribution: 1.0,
          trend: "up",
        },
      ];
    case "promo_start":
      return [
        {
          name: "프로모션",
          baseline: "없음",
          current: String(e.promo_type ?? "—"),
          delta: `${e.discount_rate}%`,
          contribution: 1.0,
          trend: "flat",
        },
      ];
    default:
      return [];
  }
}
