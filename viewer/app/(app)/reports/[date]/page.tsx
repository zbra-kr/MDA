// viewer/app/(app)/reports/[date]/page.tsx
// 화면 1 — 오늘의 리포트 (메인 대시보드)
// Mock: design-reference/dashboard.html
import { FileText, Share2, AlertTriangle } from "lucide-react";
import {
  getReportMeta,
  getKpis,
  getTodayFindings,
  getPipeline,
  getSeverityDaily,
  getAnalysis,
} from "@/lib/queries";
import { fmtDate, fmtDelta } from "@/lib/format";
import { KpiStrip, type KpiItem } from "@/components/radar/kpi-strip";
import { AnomalyTable } from "@/components/radar/anomaly-table";
import { StackedSeverityChart } from "@/components/radar/stacked-severity-chart";
import { AiInsightCard } from "@/components/radar/ai-insight-card";
import { PipelineStatus } from "@/components/radar/pipeline-status";
import { SectionCard } from "@/components/radar/section-card";

interface PageProps {
  params: Promise<{ date: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { date } = await params;

  const [meta, kpis, findings, pipeline, severityDaily] = await Promise.all([
    getReportMeta(date),
    getKpis(date),
    getTodayFindings(date),
    getPipeline(),
    getSeverityDaily(
      // 30일 전 ~ date
      new Date(new Date(date).getTime() - 29 * 864e5).toISOString().slice(0, 10),
      date,
    ),
  ]);

  // 상위 4개 high-priority finding의 AI 분석
  const topFindings = findings
    .filter((f) => f.severity >= 0.5)
    .slice(0, 4);
  const topAnalyses = await Promise.all(
    topFindings.map(async (f) => ({
      finding: f,
      analysis: await getAnalysis(f.anomaly_id),
    })),
  );

  const totalDelta = fmtDelta(kpis.delta_total_1d, "value", { unit: "건" });
  const matchDelta = fmtDelta(kpis.own_matches_delta, "value", { unit: "건" });

  const kpiItems: KpiItem[] = [
    {
      label: "오늘 이상 징후",
      value: kpis.total,
      unit: "건",
      sub: (
        <span
          className={
            totalDelta.trend === "down"
              ? "text-trend-up"
              : totalDelta.trend === "up"
                ? "text-trend-down"
                : "text-fg-quaternary"
          }
        >
          어제 대비 {totalDelta.sign}
          {totalDelta.abs}
        </span>
      ),
    },
    {
      label: "심각도 분포",
      value: (
        <span className="flex items-baseline gap-1">
          <span className="text-sev-high-fg">{kpis.high}</span>
          <span className="text-fg-quaternary text-2xl">/</span>
          <span className="text-sev-med-fg">{kpis.med}</span>
          <span className="text-fg-quaternary text-2xl">/</span>
          <span className="text-sev-low-fg">{kpis.low}</span>
        </span>
      ),
      breakdown: [
        { label: "High", value: kpis.high, color: "var(--sev-high-solid)" },
        { label: "Med", value: kpis.med, color: "var(--sev-med-solid)" },
        { label: "Low", value: kpis.low, color: "var(--sev-low-solid)" },
      ],
    },
    {
      label: "자사 매칭",
      value: kpis.own_matches,
      unit: "건",
      sub: (
        <span className="text-fg-tertiary">
          매칭 SKU 보유 · {matchDelta.sign}
          {matchDelta.abs}
        </span>
      ),
    },
    {
      label: "파이프라인",
      value: kpis.pipeline_duration,
      valueClassName: "text-xl text-trend-up",
      sub: <span className="text-trend-up">정상 완료 · 06:16 KST</span>,
    },
  ];

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* page head */}
      <section className="flex items-start justify-between gap-10 pb-8 mb-8 border-b border-border-subtle">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-tertiary mb-3">
            <span className="w-1 h-1 rounded-full bg-trend-up" />
            일일 리포트
            <span className="text-fg-quaternary">·</span>
            <span className="text-trend-up">{meta.status === "succeeded" ? "발송 완료" : meta.status}</span>
          </p>
          <h1 className="text-4xl font-semibold text-fg-primary tracking-[-0.022em] mb-3">
            {fmtDate(date)} 경쟁사 레이더
          </h1>
          <p className="flex items-center gap-3 text-sm text-fg-tertiary">
            <span className="font-mono">{meta.model_version}</span>
            <span className="text-fg-quaternary">·</span>
            <span className="font-mono">prompt {meta.prompt_version}</span>
            <span className="text-fg-quaternary">·</span>
            <span>탐지 {meta.total_anomalies}건</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
            <FileText size={12} /> HTML 리포트
          </button>
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
            <Share2 size={12} /> Slack 공유
          </button>
        </div>
      </section>

      {/* KPI strip */}
      <div className="mb-8">
        <KpiStrip items={kpiItems} />
      </div>

      {/* body: main + sidebar */}
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
        {/* main column */}
        <div className="flex flex-col gap-8 min-w-0">
          {/* 30-day stacked chart */}
          <SectionCard
            title="30일 이상 징후 추이"
            meta="심각도별 일일 집계"
          >
            <StackedSeverityChart data={severityDaily} />
            <div className="flex items-center gap-5 mt-4 pt-4 border-t border-border-hair text-xs text-fg-secondary">
              <Legend color="var(--sev-high-solid)" label="High" />
              <Legend color="var(--sev-med-solid)" label="Medium" />
              <Legend color="var(--sev-low-solid)" label="Low" />
              <span className="ml-auto text-fg-tertiary">
                오늘{" "}
                <span className="font-mono text-fg-primary">
                  {severityDaily[severityDaily.length - 1]?.high +
                    severityDaily[severityDaily.length - 1]?.med +
                    severityDaily[severityDaily.length - 1]?.low}
                  건
                </span>
              </span>
            </div>
          </SectionCard>

          {/* anomaly table */}
          <SectionCard
            title="오늘의 이상 징후"
            count={findings.length}
            bodyClassName="p-0 pt-0"
          >
            <div className="px-2 py-2">
              <AnomalyTable rows={findings} />
            </div>
          </SectionCard>

          {/* AI insights 2×2 */}
          <div>
            <h3 className="flex items-baseline gap-2 mb-5 text-md font-semibold text-fg-primary">
              AI 전략 분석
              <span className="text-xs font-mono text-fg-quaternary">
                상위 {topAnalyses.length}건
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {topAnalyses.map(
                ({ finding, analysis }) =>
                  analysis && (
                    <AiInsightCard
                      key={finding.anomaly_id}
                      analysis={analysis}
                      productName={finding.product_name}
                      brandName={finding.brand_name}
                      href={`/anomalies/${finding.anomaly_id}`}
                    />
                  ),
              )}
            </div>
          </div>
        </div>

        {/* sidebar */}
        <aside className="flex flex-col gap-7 sticky top-[110px] self-start">
          <PipelineStatus stages={pipeline} />

          {/* 어제 vs 오늘 */}
          <div className="bg-surface border border-border-subtle rounded-md">
            <div className="px-5 py-3 border-b border-border-hair">
              <h3 className="text-md font-semibold text-fg-primary">
                어제 vs 오늘
              </h3>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                  어제
                </div>
                <div className="text-2xl font-semibold num text-fg-tertiary">
                  {kpis.total - kpis.delta_total_1d}
                </div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                  오늘
                </div>
                <div className="text-2xl font-semibold num text-fg-primary">
                  {kpis.total}
                </div>
              </div>
            </div>
          </div>

          {/* 거버넌스 노트 */}
          <div className="bg-surface border border-border-subtle rounded-md p-5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={14}
                className="text-sev-med-fg shrink-0 mt-0.5"
              />
              <p className="text-sm text-fg-tertiary leading-relaxed">
                본 리포트의 분석은 로컬 LLM이 생성했습니다. 최종 의사결정은
                담당자가 합니다.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-[1px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
