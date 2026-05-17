// viewer/lib/queries-anomaly.ts
// 이상탐지·자사 매칭 데이터 접근 레이어 (Phase 2.1 단계 F-1).
// supabaseServer() (anon read) 전용. service_role 사용 금지.

import { supabaseServer } from "@/lib/supabase/server";

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export type AnomalyType =
  | "rank_surge"
  | "price_change"
  | "review_velocity"
  | "new_entrant"
  | "promo_start"
  | "wishlist_surge";

export interface AnomalyRow {
  id: string;
  product_id: string;
  anomaly_type: AnomalyType;
  severity: number;
  detected_on: string;
  analyzed: boolean;
  evidence: Record<string, unknown>;
  product_name: string | null;
  product_current_price: number | null;
  product_thumbnail_url: string | null;
  brand_name: string | null;
  brand_slug: string | null;
}

export interface AnomalyDetailRow extends AnomalyRow {
  product_list_price: number | null;
  product_review_count: number | null;
  product_musinsa_no: number | null;
  product_url: string | null;
  agent_analysis: AgentAnalysisRow | null;
  matches: MatchRow[];
}

export interface AgentAnalysisRow {
  id: string;
  model_version: string;
  prompt_version: string;
  strategy_recommendation: StrategyRecommendation | null;
  latency_ms: number | null;
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

export interface MatchRow {
  id: string;
  competitor_product_id: string;
  own_sku_id: string;
  similarity_score: number;
  match_method: "vector" | "name_exact" | "category";
  diff_summary: DiffSummary;
  detected_at: string;
  own_sku_code: string | null;
  own_sku_name: string | null;
  own_sku_price: number | null;
  own_brand_slug: string | null;
}

export interface DiffSummary {
  price_diff_krw?: number | null;
  price_diff_pct?: number | null;
  competitor_price?: number | null;
  own_price_msrp?: number | null;
  own_price_pos?: number | null;
  stock_status?: "out" | "critical" | "low" | "normal" | "overstock" | null;
  stock_qty?: number | null;
  sales_yesterday?: number | null;
  sales_avg_7d?: number | null;
  color_overlap?: string[];
  fit_diff?: string | null;
}

export interface MatchDetailRow extends MatchRow {
  competitor_product_name: string | null;
  competitor_product_price: number | null;
  competitor_brand_name: string | null;
  competitor_brand_slug: string | null;
}

// 시계열 집계
export interface AnomalyTimeSeriesRow {
  detected_on: string;
  anomaly_type: AnomalyType;
  count: number;
}

// ─── getAnomalies ────────────────────────────────────────────────────────────

export interface AnomalyFilter {
  anomaly_types?: AnomalyType[];
  date_from?: string; // YYYY-MM-DD
  date_to?: string;
  brand_slugs?: string[];
  limit?: number;
}

export async function getAnomalies(filter: AnomalyFilter = {}): Promise<AnomalyRow[]> {
  try {
    const sb = await supabaseServer();

    type RawAnomaly = {
      id: string;
      product_id: string;
      anomaly_type: string;
      severity: number;
      detected_on: string;
      analyzed: boolean;
      evidence: Record<string, unknown>;
      products: {
        name: string | null;
        thumbnail_url: string | null;
        brands: { name: string | null; slug: string | null } | null;
      } | null;
    };

    let q = sb
      .from("anomalies")
      .select(
        "id, product_id, anomaly_type, severity, detected_on, analyzed, evidence, " +
        "products(name, thumbnail_url, brands(name, slug))",
      )
      .order("severity", { ascending: false });

    if (filter.anomaly_types?.length) {
      q = q.in("anomaly_type", filter.anomaly_types);
    }
    if (filter.date_from) q = q.gte("detected_on", filter.date_from);
    if (filter.date_to)   q = q.lte("detected_on", filter.date_to);
    q = q.limit(filter.limit ?? 200);

    const { data, error } = await q;
    if (error) console.error("[getAnomalies] error:", error.code, error.message);
    const rows = (data ?? []) as unknown as RawAnomaly[];

    const result = rows.map((r) => ({
      id:                    r.id,
      product_id:            r.product_id,
      anomaly_type:          r.anomaly_type as AnomalyType,
      severity:              r.severity,
      detected_on:           r.detected_on,
      analyzed:              r.analyzed,
      evidence:              r.evidence ?? {},
      product_name:          r.products?.name ?? null,
      product_current_price: null, // products 테이블에 없음 — product_snapshots에 있음
      product_thumbnail_url: r.products?.thumbnail_url ?? null,
      brand_name:            r.products?.brands?.name ?? null,
      brand_slug:            r.products?.brands?.slug ?? null,
    }));

    // brand_slugs 필터 (JS 레벨)
    if (filter.brand_slugs?.length) {
      return result.filter((r) => r.brand_slug && filter.brand_slugs!.includes(r.brand_slug));
    }
    return result;
  } catch (err) {
    console.error("[queries-anomaly] getAnomalies failed", err);
    return [];
  }
}

// ─── getAnomalyDetail ────────────────────────────────────────────────────────

export async function getAnomalyDetail(anomalyId: string): Promise<AnomalyDetailRow | null> {
  try {
    const sb = await supabaseServer();

    type RawDetail = {
      id: string;
      product_id: string;
      anomaly_type: string;
      severity: number;
      detected_on: string;
      analyzed: boolean;
      evidence: Record<string, unknown>;
      products: {
        name: string | null;
        list_price: number | null;
        musinsa_no: number | null;
        thumbnail_url: string | null;
        brands: { name: string | null; slug: string | null } | null;
      } | null;
    };

    const { data: raw, error: rawError } = await sb
      .from("anomalies")
      .select(
        "id, product_id, anomaly_type, severity, detected_on, analyzed, evidence, " +
        "products(name, list_price, musinsa_no, thumbnail_url, brands(name, slug))",
      )
      .eq("id", anomalyId)
      .maybeSingle();

    if (rawError) console.error("[getAnomalyDetail] error:", rawError.code, rawError.message);
    if (!raw) return null;
    const r = raw as unknown as RawDetail;

    // agent_analyses (최신 1건)
    const { data: analysisData } = await sb
      .from("agent_analyses")
      .select("id, model_version, prompt_version, strategy_recommendation, latency_ms, created_at")
      .eq("anomaly_id", anomalyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // product_matches
    const matches = await getMatches({ competitor_product_id: r.product_id });

    const msNo = r.products?.musinsa_no;
    return {
      id:                    r.id,
      product_id:            r.product_id,
      anomaly_type:          r.anomaly_type as AnomalyType,
      severity:              r.severity,
      detected_on:           r.detected_on,
      analyzed:              r.analyzed,
      evidence:              r.evidence ?? {},
      product_name:          r.products?.name ?? null,
      product_current_price: null, // products 테이블에 없음 — product_snapshots에 있음
      product_thumbnail_url: r.products?.thumbnail_url ?? null,
      product_list_price:    r.products?.list_price ?? null,
      product_review_count:  null, // products 테이블에 없음 — product_snapshots에 있음
      product_musinsa_no:    msNo ?? null,
      product_url:           msNo ? `https://www.musinsa.com/products/${msNo}` : null,
      brand_name:            r.products?.brands?.name ?? null,
      brand_slug:            r.products?.brands?.slug ?? null,
      agent_analysis: analysisData
        ? (analysisData as unknown as AgentAnalysisRow)
        : null,
      matches,
    };
  } catch (err) {
    console.error("[queries-anomaly] getAnomalyDetail failed", err);
    return null;
  }
}

// ─── getMatches ──────────────────────────────────────────────────────────────

export interface MatchFilter {
  competitor_product_id?: string;
  brand_slugs?: string[];
  score_min?: number;
  limit?: number;
}

export async function getMatches(filter: MatchFilter = {}): Promise<MatchRow[]> {
  try {
    const sb = await supabaseServer();

    type RawMatch = {
      id: string;
      competitor_product_id: string;
      own_sku_id: string;
      similarity_score: number;
      match_method: string;
      diff_summary: DiffSummary;
      detected_at: string;
      own_skus: {
        id: string;
        sku_code: string | null;
        product_name: string | null;
        price: number | null;
        brand_slug: string | null;
      } | null;
    };

    let q = sb
      .from("product_matches")
      .select(
        "id, competitor_product_id, own_sku_id, similarity_score, match_method, " +
        "diff_summary, detected_at, " +
        "own_skus(id, sku_code, product_name, price, brand_slug)",
      )
      .eq("is_active", true)
      .order("similarity_score", { ascending: false });

    if (filter.competitor_product_id) {
      q = q.eq("competitor_product_id", filter.competitor_product_id);
    }
    if (filter.score_min != null) {
      q = q.gte("similarity_score", filter.score_min);
    }
    q = q.limit(filter.limit ?? 100);

    const { data } = await q;
    const rows = (data ?? []) as unknown as RawMatch[];

    const result = rows.map((r) => ({
      id:                    r.id,
      competitor_product_id: r.competitor_product_id,
      own_sku_id:            r.own_sku_id,
      similarity_score:      r.similarity_score,
      match_method:          r.match_method as MatchRow["match_method"],
      diff_summary:          (r.diff_summary ?? {}) as DiffSummary,
      detected_at:           r.detected_at,
      own_sku_code:          r.own_skus?.sku_code ?? null,
      own_sku_name:          r.own_skus?.product_name ?? null,
      own_sku_price:         r.own_skus?.price ?? null,
      own_brand_slug:        r.own_skus?.brand_slug ?? null,
    }));

    // brand_slugs 필터 (JS 레벨)
    if (filter.brand_slugs?.length) {
      return result.filter(
        (r) => r.own_brand_slug && filter.brand_slugs!.includes(r.own_brand_slug),
      );
    }
    return result;
  } catch (err) {
    console.error("[queries-anomaly] getMatches failed", err);
    return [];
  }
}

// ─── getMatchDetail ──────────────────────────────────────────────────────────

export async function getMatchDetail(matchId: string): Promise<MatchDetailRow | null> {
  try {
    const sb = await supabaseServer();

    type RawMatchDetail = {
      id: string;
      competitor_product_id: string;
      own_sku_id: string;
      similarity_score: number;
      match_method: string;
      diff_summary: DiffSummary;
      detected_at: string;
      own_skus: {
        sku_code: string | null;
        product_name: string | null;
        price: number | null;
        brand_slug: string | null;
      } | null;
      products: {
        name: string | null;
        brands: { name: string | null; slug: string | null } | null;
      } | null;
    };

    const { data: raw } = await sb
      .from("product_matches")
      .select(
        "id, competitor_product_id, own_sku_id, similarity_score, match_method, " +
        "diff_summary, detected_at, " +
        "own_skus(sku_code, product_name, price, brand_slug), " +
        "products!competitor_product_id(name, brands(name, slug))",
      )
      .eq("id", matchId)
      .maybeSingle();

    if (!raw) return null;
    const r = raw as unknown as RawMatchDetail;

    return {
      id:                       r.id,
      competitor_product_id:    r.competitor_product_id,
      own_sku_id:               r.own_sku_id,
      similarity_score:         r.similarity_score,
      match_method:             r.match_method as MatchRow["match_method"],
      diff_summary:             (r.diff_summary ?? {}) as DiffSummary,
      detected_at:              r.detected_at,
      own_sku_code:             r.own_skus?.sku_code ?? null,
      own_sku_name:             r.own_skus?.product_name ?? null,
      own_sku_price:            r.own_skus?.price ?? null,
      own_brand_slug:           r.own_skus?.brand_slug ?? null,
      competitor_product_name:  r.products?.name ?? null,
      competitor_product_price: null, // products 테이블에 없음
      competitor_brand_name:    r.products?.brands?.name ?? null,
      competitor_brand_slug:    r.products?.brands?.slug ?? null,
    };
  } catch (err) {
    console.error("[queries-anomaly] getMatchDetail failed", err);
    return null;
  }
}

// ─── getAnomalyTimeSeries (차트용 집계) ─────────────────────────────────────

export async function getAnomalyTimeSeries(
  dateFrom: string,
  dateTo: string,
): Promise<AnomalyTimeSeriesRow[]> {
  try {
    const sb = await supabaseServer();

    type RawRow = { detected_on: string; anomaly_type: string };
    const { data, error } = await sb
      .from("anomalies")
      .select("detected_on, anomaly_type")
      .gte("detected_on", dateFrom)
      .lte("detected_on", dateTo);

    if (error) console.error("[getAnomalyTimeSeries] error:", error.code, error.message);
    const rows = (data ?? []) as unknown as RawRow[];

    // 날짜 × 타입별 집계
    const countMap = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.detected_on}|${r.anomaly_type}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    return Array.from(countMap.entries()).map(([key, count]) => {
      const [detected_on, anomaly_type] = key.split("|");
      return { detected_on, anomaly_type: anomaly_type as AnomalyType, count };
    }).sort((a, b) => a.detected_on.localeCompare(b.detected_on));
  } catch (err) {
    console.error("[queries-anomaly] getAnomalyTimeSeries failed", err);
    return [];
  }
}
