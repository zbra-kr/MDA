// viewer/lib/supabase/types.ts
//
// 이 파일은 임시 stub이다. 실제 Supabase 프로젝트 연결 후
//   pnpm types   (supabase gen types typescript --linked)
// 로 생성된 전체 타입으로 교체할 것.
//
// 지금은 viewer가 사용하는 뷰/RPC의 반환 형태만 최소한으로 정의해
// 타입 체크와 빌드가 통과하도록 한다.

export type SeverityScore = number; // 0.0 ~ 1.0
export type AnomalyType =
  | "rank_surge"
  | "price_change"
  | "review_velocity"
  | "new_entrant"
  | "promo_start"
  | "wishlist_surge";

// ── v_today_findings ────────────────────────────────────────
export interface TodayFinding {
  anomaly_id: string;
  detected_on: string;
  anomaly_type: AnomalyType;
  severity: SeverityScore;
  evidence: Record<string, unknown>;
  product_id: string;
  musinsa_no: string;
  product_name: string;
  product_url: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  brand_is_own: boolean;
  rank_main: number | null;
  current_price: number | null;
  wishlist_count: number | null;
  review_count: number | null;
  prev_rank: number | null;
  prev_wishlist: number | null;
  prev_price: number | null;
  delta_rank_1d: number | null;
  matched_sku_count: number;
}

// ── v_pipeline_today ────────────────────────────────────────
export interface PipelineStage {
  stage_name: string;
  status: "ok" | "running" | "pending" | "error";
  started_at: string | null;
  ended_at: string | null;
  duration: string | null; // interval
  stage_order: number;
}

// ── f_severity_daily ────────────────────────────────────────
export interface SeverityDaily {
  date: string;
  high: number;
  med: number;
  low: number;
}

// ── f_product_trend ─────────────────────────────────────────
export interface ProductTrendRow {
  date: string;
  rank_main: number | null;
  rank_realtime: number | null;
  current_price: number | null;
  discount_rate: number | null;
  wishlist_count: number | null;
  review_count: number | null;
  rating: number | null;
}

// ── f_anomaly_kpis ──────────────────────────────────────────
export interface AnomalyKpis {
  rank_main: number | null;
  delta_rank_1d: number | null;
  delta_rank_7d: number | null;
  wishlist_count: number | null;
  delta_wishlist_pct: number | null;
  review_velocity_x: number | null;
  matched_sku_count: number;
  severity: SeverityScore;
  anomaly_type: AnomalyType;
}

// ── f_own_sku_status ────────────────────────────────────────
export interface OwnSkuStatus {
  pos_price: number | null;
  stock_ea: number | null;
  sales_7d: number | null;
  stock_tier: "low" | "mid" | "high";
  refreshed_at: string;
}

// ── product_matches (join 결과) ─────────────────────────────
export interface ProductMatch {
  id: string;
  competitor_product_id: string;
  own_product_id: string | null;
  own_sku: string | null;
  similarity_score: number;
  match_basis: Record<string, unknown> | null;
  diff_summary: Record<string, unknown> | null;
}

// ── agent_analyses ──────────────────────────────────────────
export interface AgentAnalysis {
  id: string;
  anomaly_id: string;
  model_version: string;
  prompt_version: string | null;
  llm_reasoning: string;
  strategy_recommendation: StrategyRecommendation | null;
  created_at: string;
}

export interface StrategyRecommendation {
  cause_hypothesis: string;
  impact_on_own: string;
  action: "price_match" | "promo_match" | "inventory_push" | "monitor";
  action_detail: string;
  priority: "high" | "medium" | "low";
  confidence: number;
}

// ── 최소 Database 인터페이스 ────────────────────────────────
// supabase-js 제네릭이 요구하는 형태. gen types로 교체 시 전체 채워짐.
export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
    Views: {
      v_today_findings: { Row: TodayFinding };
      v_pipeline_today: { Row: PipelineStage };
    };
    Functions: Record<string, unknown>;
  };
}
