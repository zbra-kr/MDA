// viewer/lib/mock-data.ts
//
// Supabase 연결 전, 화면을 바로 확인하기 위한 더미 데이터.
// design-reference/dashboard.html · anomaly.html 의 목업 수치를 옮김.
//
// 실제 연결 후에는 각 page.tsx에서 이 모듈 대신 supabaseServer()를
// 사용한다. USE_MOCK 플래그로 전환.
//
// 전환 방법: .env.local 에 NEXT_PUBLIC_USE_MOCK=false 설정,
//            또는 이 파일을 import 하는 쪽에서 분기.

import type {
  TodayFinding,
  PipelineStage,
  SeverityDaily,
  ProductTrendRow,
  AnomalyKpis,
  AgentAnalysis,
  ProductMatch,
} from "@/lib/supabase/types";

export const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK !== "false"; // 기본 true

// ── 오늘의 리포트 메타 ──────────────────────────────────────
export const mockReportMeta = {
  report_date: "2026-05-15",
  model_version: "qwen2.5:14b-instruct-q4_K_M",
  prompt_version: "v1",
  status: "succeeded" as const,
  total_anomalies: 17,
  duration_label: "2h 16m",
};

// ── KPI strip ───────────────────────────────────────────────
export const mockKpis = {
  total: 17,
  high: 8,
  med: 6,
  low: 3,
  delta_total_1d: -4, // 어제 21건 → 오늘 17건
  pipeline_duration: "2h 16m",
  own_matches: 11,
  own_matches_delta: 2,
};

// ── v_today_findings (anomaly table 행) ─────────────────────
export const mockFindings: TodayFinding[] = [
  {
    anomaly_id: "a1000000-0000-0000-0000-000000000001",
    detected_on: "2026-05-15",
    anomaly_type: "rank_surge",
    severity: 0.91,
    evidence: { yesterday_rank: 73, today_rank: 18, delta: 55, threshold: 20 },
    product_id: "p0000000-0000-0000-0000-000000000001",
    musinsa_no: "3892011",
    product_name: "T-Logo Hooded Sweatshirt",
    product_url: "https://www.musinsa.com/products/3892011",
    brand_id: "b0000000-0000-0000-0000-000000000001",
    brand_name: "디스이즈네버댓",
    brand_slug: "thisisneverthat",
    brand_is_own: false,
    rank_main: 18,
    current_price: 79000,
    wishlist_count: 12400,
    review_count: 892,
    prev_rank: 73,
    prev_wishlist: 9800,
    prev_price: 79000,
    delta_rank_1d: -55,
    matched_sku_count: 3,
  },
  {
    anomaly_id: "a1000000-0000-0000-0000-000000000002",
    detected_on: "2026-05-15",
    anomaly_type: "price_change",
    severity: 0.74,
    evidence: {
      yesterday_price: 39000,
      today_price: 24000,
      delta_pct: -38.5,
      trigger: "discount_started",
    },
    product_id: "p0000000-0000-0000-0000-000000000002",
    musinsa_no: "3120988",
    product_name: "Floral Pattern Half Tee",
    product_url: "https://www.musinsa.com/products/3120988",
    brand_id: "b0000000-0000-0000-0000-000000000002",
    brand_name: "LMC",
    brand_slug: "lmc",
    brand_is_own: false,
    rank_main: 41,
    current_price: 24000,
    wishlist_count: 5600,
    review_count: 433,
    prev_rank: 39,
    prev_wishlist: 5400,
    prev_price: 39000,
    delta_rank_1d: 2,
    matched_sku_count: 2,
  },
  {
    anomaly_id: "a1000000-0000-0000-0000-000000000003",
    detected_on: "2026-05-15",
    anomaly_type: "new_entrant",
    severity: 0.42,
    evidence: { today_rank: 58, first_seen: "2026-05-15" },
    product_id: "p0000000-0000-0000-0000-000000000003",
    musinsa_no: "3920771",
    product_name: "Wide Cargo Pants",
    product_url: "https://www.musinsa.com/products/3920771",
    brand_id: "b0000000-0000-0000-0000-000000000003",
    brand_name: "메인부스",
    brand_slug: "mainbooth",
    brand_is_own: false,
    rank_main: 58,
    current_price: 68000,
    wishlist_count: 2100,
    review_count: 47,
    prev_rank: null,
    prev_wishlist: null,
    prev_price: null,
    delta_rank_1d: null,
    matched_sku_count: 1,
  },
  {
    anomaly_id: "a1000000-0000-0000-0000-000000000004",
    detected_on: "2026-05-15",
    anomaly_type: "review_velocity",
    severity: 0.83,
    evidence: { today_count: 64, avg_n: 11.2, ratio: 5.7 },
    product_id: "p0000000-0000-0000-0000-000000000004",
    musinsa_no: "3771203",
    product_name: "Heavyweight Pocket Tee",
    product_url: "https://www.musinsa.com/products/3771203",
    brand_id: "b0000000-0000-0000-0000-000000000004",
    brand_name: "파르티멘토",
    brand_slug: "partimento",
    brand_is_own: false,
    rank_main: 27,
    current_price: 32000,
    wishlist_count: 8800,
    review_count: 1240,
    prev_rank: 33,
    prev_wishlist: 8100,
    prev_price: 32000,
    delta_rank_1d: -6,
    matched_sku_count: 4,
  },
  {
    anomaly_id: "a1000000-0000-0000-0000-000000000005",
    detected_on: "2026-05-15",
    anomaly_type: "wishlist_surge",
    severity: 0.68,
    evidence: { prev: 4200, today: 6900, delta_pct: 64.3 },
    product_id: "p0000000-0000-0000-0000-000000000005",
    musinsa_no: "3650412",
    product_name: "Nylon Coach Jacket",
    product_url: "https://www.musinsa.com/products/3650412",
    brand_id: "b0000000-0000-0000-0000-000000000005",
    brand_name: "비바스튜디오",
    brand_slug: "vivastudio",
    brand_is_own: false,
    rank_main: 35,
    current_price: 89000,
    wishlist_count: 6900,
    review_count: 318,
    prev_rank: 38,
    prev_wishlist: 4200,
    prev_price: 89000,
    delta_rank_1d: -3,
    matched_sku_count: 2,
  },
  {
    anomaly_id: "a1000000-0000-0000-0000-000000000006",
    detected_on: "2026-05-15",
    anomaly_type: "promo_start",
    severity: 0.55,
    evidence: { promo_type: "time_deal", discount_rate: 30 },
    product_id: "p0000000-0000-0000-0000-000000000006",
    musinsa_no: "3401255",
    product_name: "Standard Sweat Pants",
    product_url: "https://www.musinsa.com/products/3401255",
    brand_id: "b0000000-0000-0000-0000-000000000001",
    brand_name: "디스이즈네버댓",
    brand_slug: "thisisneverthat",
    brand_is_own: false,
    rank_main: 52,
    current_price: 45500,
    wishlist_count: 3300,
    review_count: 211,
    prev_rank: 51,
    prev_wishlist: 3200,
    prev_price: 65000,
    delta_rank_1d: -1,
    matched_sku_count: 1,
  },
];

// ── v_pipeline_today ────────────────────────────────────────
export const mockPipeline: PipelineStage[] = [
  {
    stage_name: "scrape",
    status: "ok",
    started_at: "2026-05-15T03:00:00+09:00",
    ended_at: "2026-05-15T04:28:00+09:00",
    duration: "01:28:00",
    stage_order: 1,
  },
  {
    stage_name: "ingest",
    status: "ok",
    started_at: "2026-05-15T04:28:00+09:00",
    ended_at: "2026-05-15T04:46:00+09:00",
    duration: "00:18:00",
    stage_order: 2,
  },
  {
    stage_name: "detect",
    status: "ok",
    started_at: "2026-05-15T04:46:00+09:00",
    ended_at: "2026-05-15T04:50:00+09:00",
    duration: "00:04:00",
    stage_order: 3,
  },
  {
    stage_name: "match",
    status: "ok",
    started_at: "2026-05-15T04:50:00+09:00",
    ended_at: "2026-05-15T04:58:00+09:00",
    duration: "00:08:00",
    stage_order: 4,
  },
  {
    stage_name: "analyze",
    status: "ok",
    started_at: "2026-05-15T04:58:00+09:00",
    ended_at: "2026-05-15T05:12:00+09:00",
    duration: "00:14:00",
    stage_order: 5,
  },
  {
    stage_name: "publish",
    status: "ok",
    started_at: "2026-05-15T05:12:00+09:00",
    ended_at: "2026-05-15T05:16:00+09:00",
    duration: "00:04:00",
    stage_order: 6,
  },
];

// ── f_severity_daily (30일 스택 차트) ───────────────────────
export const mockSeverityDaily: SeverityDaily[] = Array.from(
  { length: 30 },
  (_, i) => {
    const d = new Date("2026-05-15");
    d.setDate(d.getDate() - (29 - i));
    // 의사 난수 — 마지막 날이 오늘(17건)
    const seed = (i * 7919) % 13;
    const high = i === 29 ? 8 : 2 + (seed % 6);
    const med = i === 29 ? 6 : 3 + ((seed * 3) % 7);
    const low = i === 29 ? 3 : 2 + ((seed * 5) % 6);
    return { date: d.toISOString().slice(0, 10), high, med, low };
  },
);

// ── f_product_trend (anomaly 상세 — 랭킹 추이) ──────────────
export const mockProductTrend: ProductTrendRow[] = Array.from(
  { length: 30 },
  (_, i) => {
    const d = new Date("2026-05-15");
    d.setDate(d.getDate() - (29 - i));
    // 73위 근처에서 횡보하다 마지막 5일 급상승 → 18위
    let rank: number;
    if (i < 25) rank = 68 + ((i * 13) % 12);
    else rank = Math.round(73 - (i - 24) * 11);
    return {
      date: d.toISOString().slice(0, 10),
      rank_main: Math.max(rank, 12),
      rank_realtime: Math.max(rank - 2, 10),
      current_price: 79000,
      discount_rate: 0,
      wishlist_count: 9000 + i * 110,
      review_count: 700 + i * 6,
      rating: 4.6,
    };
  },
);

// ── f_anomaly_kpis ──────────────────────────────────────────
export const mockAnomalyKpis: AnomalyKpis = {
  rank_main: 18,
  delta_rank_1d: -55,
  delta_rank_7d: -48,
  wishlist_count: 12400,
  delta_wishlist_pct: 26.5,
  review_velocity_x: 2.1,
  matched_sku_count: 3,
  severity: 0.91,
  anomaly_type: "rank_surge",
};

// ── agent_analyses (AI 분석) ────────────────────────────────
export const mockAnalyses: Record<string, AgentAnalysis> = {
  "a1000000-0000-0000-0000-000000000001": {
    id: "an000000-0000-0000-0000-000000000001",
    anomaly_id: "a1000000-0000-0000-0000-000000000001",
    model_version: "qwen2.5:14b-instruct-q4_K_M",
    prompt_version: "v1",
    llm_reasoning:
      "디스이즈네버댓 T-Logo 후드가 5일 만에 73위에서 18위로 급상승했습니다. " +
      "동 기간 위시리스트가 26% 증가했고, 가격 변동은 없었습니다. " +
      "리뷰 증가율도 평소의 2.1배로, 자연 유입보다는 외부 노출(인플루언서 " +
      "착용 또는 무신사 큐레이션 배치) 가능성이 높습니다. 자사 커버낫 " +
      "'베이직 로고 후드'가 동일 카테고리에서 경쟁 포지션이며, 현재 " +
      "POS 가격이 경쟁사보다 4,000원 낮고 재고도 충분합니다.",
    strategy_recommendation: {
      cause_hypothesis:
        "가격·할인 변동 없이 랭킹·위시리스트·리뷰가 동반 급등 — 외부 노출(인플루언서/큐레이션) 유입으로 추정.",
      impact_on_own:
        "자사 커버낫 '베이직 로고 후드'가 동일 카테고리 경쟁 상품. POS 가격 우위(-4,000원), 재고 충분.",
      action: "promo_match",
      action_detail:
        "가격 우위가 있으므로 인하 대신 노출 강화 — 위시리스트 쿠폰 + 무신사 내 자사 후드 큐레이션 신청.",
      priority: "high",
      confidence: 0.78,
    },
    created_at: "2026-05-15T05:08:00+09:00",
  },
};

// ── product_matches (자사 매칭 SKU) ─────────────────────────
export const mockMatches: Record<string, ProductMatch[]> = {
  "p0000000-0000-0000-0000-000000000001": [
    {
      id: "m0000000-0000-0000-0000-000000000001",
      competitor_product_id: "p0000000-0000-0000-0000-000000000001",
      own_product_id: "po000000-0000-0000-0000-000000000001",
      own_sku: "CN-HD-2026-BLK",
      similarity_score: 0.91,
      match_basis: { vector: 0.91, category: true, price_band: true },
      diff_summary: {
        own_product_name: "베이직 로고 후드 (블랙)",
        price_diff_krw: -4000,
        price_diff_pct: -5.1,
        competitor_price: 79000,
        own_price_msrp: 79000,
        own_price_pos: 75000,
        stock_qty: 1840,
        stock_status: "normal",
        sales_avg_7d: 62,
        color_overlap: ["black", "cream"],
        fit_diff: "competitor:loose vs own:regular",
      },
    },
    {
      id: "m0000000-0000-0000-0000-000000000002",
      competitor_product_id: "p0000000-0000-0000-0000-000000000001",
      own_product_id: "po000000-0000-0000-0000-000000000002",
      own_sku: "CN-HD-2026-CRM",
      similarity_score: 0.86,
      match_basis: { vector: 0.86, category: true, price_band: true },
      diff_summary: {
        own_product_name: "베이직 로고 후드 (크림)",
        price_diff_krw: -4000,
        price_diff_pct: -5.1,
        competitor_price: 79000,
        own_price_msrp: 79000,
        own_price_pos: 75000,
        stock_qty: 920,
        stock_status: "low",
        sales_avg_7d: 41,
        color_overlap: ["cream"],
        fit_diff: "competitor:loose vs own:regular",
      },
    },
    {
      id: "m0000000-0000-0000-0000-000000000003",
      competitor_product_id: "p0000000-0000-0000-0000-000000000001",
      own_product_id: "po000000-0000-0000-0000-000000000003",
      own_sku: "CN-HD-2025-NVY",
      similarity_score: 0.79,
      match_basis: { vector: 0.79, category: true, price_band: false },
      diff_summary: {
        own_product_name: "쿠버낫 아치 후드 (네이비)",
        price_diff_krw: -14000,
        price_diff_pct: -17.7,
        competitor_price: 79000,
        own_price_msrp: 69000,
        own_price_pos: 65000,
        stock_qty: 210,
        stock_status: "critical",
        sales_avg_7d: 28,
        color_overlap: [],
        fit_diff: "competitor:loose vs own:oversized",
      },
    },
  ],
};

// ── 활동 타임라인 (anomaly 상세) ────────────────────────────
export interface TimelineEvent {
  ts: string;
  title: string;
  desc: string;
  marker?: "now" | "high";
}

export const mockTimeline: TimelineEvent[] = [
  {
    ts: "2026-05-15",
    title: "랭킹 급상승 감지",
    desc: "73위 → 18위 (Δ55). severity 0.91, high tier.",
    marker: "now",
  },
  {
    ts: "2026-05-13",
    title: "위시리스트 증가 시작",
    desc: "9,800 → 10,900. 이상 임계 미달.",
  },
  {
    ts: "2026-05-11",
    title: "리뷰 증가율 상승",
    desc: "일 12건 → 일 27건.",
  },
  {
    ts: "2026-04-28",
    title: "모니터링 시작",
    desc: "products.first_seen_at — 추적 대상 등록.",
  },
];
