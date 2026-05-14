// viewer/lib/queries.ts
//
// 데이터 접근 레이어. page.tsx는 이 함수들만 호출한다.
// USE_MOCK=true 면 mock-data 반환, false 면 Supabase 쿼리.
//
// 실연결 시 각 함수의 // SUPABASE: 주석 블록을 활성화하고
// mock 분기를 제거하면 된다. 페이지 코드는 건드릴 필요 없음.

import {
  USE_MOCK,
  mockFindings,
  mockPipeline,
  mockSeverityDaily,
  mockKpis,
  mockReportMeta,
  mockProductTrend,
  mockAnomalyKpis,
  mockAnalyses,
  mockMatches,
  mockTimeline,
} from "@/lib/mock-data";
import type {
  TodayFinding,
  PipelineStage,
  SeverityDaily,
  ProductTrendRow,
  AnomalyKpis,
  AgentAnalysis,
  ProductMatch,
} from "@/lib/supabase/types";
import type { TimelineEvent } from "@/lib/mock-data";
// import { supabaseServer } from "@/lib/supabase/server";

// ── 리포트 메타 ─────────────────────────────────────────────
export async function getReportMeta(date: string) {
  if (USE_MOCK) return { ...mockReportMeta, report_date: date };
  // SUPABASE:
  // const sb = await supabaseServer();
  // const { data } = await sb.from("daily_reports")
  //   .select("*").eq("report_date", date).single();
  // return data;
  return { ...mockReportMeta, report_date: date };
}

// ── KPI strip ───────────────────────────────────────────────
export async function getKpis(date: string) {
  if (USE_MOCK) return mockKpis;
  // SUPABASE: v_today_findings 집계 + daily_reports 조인
  void date;
  return mockKpis;
}

// ── 오늘의 findings (anomaly table) ─────────────────────────
export async function getTodayFindings(date: string): Promise<TodayFinding[]> {
  if (USE_MOCK) return mockFindings;
  // SUPABASE:
  // const sb = await supabaseServer();
  // const { data } = await sb.from("v_today_findings")
  //   .select("*").order("severity", { ascending: false });
  // return data ?? [];
  void date;
  return mockFindings;
}

// ── 파이프라인 상태 ─────────────────────────────────────────
export async function getPipeline(): Promise<PipelineStage[]> {
  if (USE_MOCK) return mockPipeline;
  // SUPABASE:
  // const sb = await supabaseServer();
  // const { data } = await sb.from("v_pipeline_today").select("*");
  // return data ?? [];
  return mockPipeline;
}

// ── 30일 severity 스택 ──────────────────────────────────────
export async function getSeverityDaily(
  startDate: string,
  endDate: string,
): Promise<SeverityDaily[]> {
  if (USE_MOCK) return mockSeverityDaily;
  // SUPABASE:
  // const sb = await supabaseServer();
  // const { data } = await sb.rpc("f_severity_daily", {
  //   start_date: startDate, end_date: endDate,
  // });
  // return data ?? [];
  void startDate;
  void endDate;
  return mockSeverityDaily;
}

// ── 단일 finding (anomaly 상세) ─────────────────────────────
export async function getFinding(
  anomalyId: string,
): Promise<TodayFinding | null> {
  if (USE_MOCK) {
    return mockFindings.find((f) => f.anomaly_id === anomalyId) ?? null;
  }
  // SUPABASE: v_today_findings 또는 anomalies 조인 쿼리
  return mockFindings.find((f) => f.anomaly_id === anomalyId) ?? null;
}

// ── anomaly KPI ─────────────────────────────────────────────
export async function getAnomalyKpis(anomalyId: string): Promise<AnomalyKpis> {
  if (USE_MOCK) return mockAnomalyKpis;
  // SUPABASE: sb.rpc("f_anomaly_kpis", { p_anomaly_id: anomalyId })
  void anomalyId;
  return mockAnomalyKpis;
}

// ── 상품 추이 ───────────────────────────────────────────────
export async function getProductTrend(
  productId: string,
  days = 30,
): Promise<ProductTrendRow[]> {
  if (USE_MOCK) return mockProductTrend;
  // SUPABASE: sb.rpc("f_product_trend", { p_product_id: productId, p_days: days })
  void productId;
  void days;
  return mockProductTrend;
}

// ── AI 분석 ─────────────────────────────────────────────────
export async function getAnalysis(
  anomalyId: string,
): Promise<AgentAnalysis | null> {
  if (USE_MOCK) return mockAnalyses[anomalyId] ?? null;
  // SUPABASE: agent_analyses where anomaly_id, order created_at desc limit 1
  return mockAnalyses[anomalyId] ?? null;
}

// ── 자사 매칭 SKU ───────────────────────────────────────────
export async function getMatches(productId: string): Promise<ProductMatch[]> {
  if (USE_MOCK) return mockMatches[productId] ?? [];
  // SUPABASE: product_matches join products(own), order similarity_score desc
  return mockMatches[productId] ?? [];
}

// ── 활동 타임라인 ───────────────────────────────────────────
export async function getTimeline(productId: string): Promise<TimelineEvent[]> {
  if (USE_MOCK) return mockTimeline;
  // SUPABASE: anomalies + agent_analyses + products.first_seen_at UNION
  void productId;
  return mockTimeline;
}
