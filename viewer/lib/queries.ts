// viewer/lib/queries.ts
//
// 데이터 접근 레이어. page.tsx는 이 함수들만 호출한다.
// USE_MOCK=true 면 mock-data 반환, false 면 Supabase 쿼리.
// NEXT_PUBLIC_USE_MOCK=true 로 언제든 mock 모드로 복귀 가능.

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
import { supabaseServer } from "@/lib/supabase/server";

// ── 리포트 메타 ─────────────────────────────────────────────
export async function getReportMeta(date: string) {
  if (USE_MOCK) return { ...mockReportMeta, report_date: date };
  try {
    const sb = await supabaseServer();
    const { data: rawData } = await sb
      .from("daily_reports")
      .select("*")
      .eq("report_date", date)
      .maybeSingle();
    // Cast through unknown: supabase-js 2.105 infers 'never' for table rows
    // when the full Database type is passed — the runtime value is correct.
    type ReportRow = { status: string | null; total_anomalies: number | null; duration_ms: number | null };
    const data = rawData as unknown as ReportRow | null;
    const ms = data?.duration_ms;
    const duration_label =
      ms != null
        ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
        : "—";
    return {
      report_date: date,
      model_version: "—",
      prompt_version: "—",
      status: (data?.status ?? "pending") as "pending" | "succeeded" | "failed",
      total_anomalies: data?.total_anomalies ?? 0,
      duration_label,
    };
  } catch (err) {
    console.error("[queries] getReportMeta failed", err);
    return {
      report_date: date,
      model_version: "—",
      prompt_version: "—",
      status: "pending" as const,
      total_anomalies: 0,
      duration_label: "—",
    };
  }
}

// ── KPI strip ───────────────────────────────────────────────
export async function getKpis(date: string) {
  if (USE_MOCK) return mockKpis;
  try {
    const sb = await supabaseServer();
    // v_today_findings는 최신 report_date 기준으로 자동 필터링됨
    const { data: rawRows } = await sb
      .from("v_today_findings")
      .select("*");
    type FindingPartial = { severity: number | null; matched_sku_count: number | null };
    const findings = (rawRows as unknown as FindingPartial[] | null) ?? [];
    const total = findings.length;
    const high = findings.filter((r) => (r.severity ?? 0) >= 0.8).length;
    const med = findings.filter(
      (r) => (r.severity ?? 0) >= 0.5 && (r.severity ?? 0) < 0.8,
    ).length;
    const low = findings.filter((r) => (r.severity ?? 0) < 0.5).length;
    const own_matches = findings.filter(
      (r) => (r.matched_sku_count ?? 0) > 0,
    ).length;

    const { data: rawReport } = await sb
      .from("daily_reports")
      .select("*")
      .eq("report_date", date)
      .maybeSingle();
    type ReportRow = { duration_ms: number | null };
    const report = rawReport as unknown as ReportRow | null;
    const ms = report?.duration_ms;
    const pipeline_duration =
      ms != null
        ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
        : "—";

    return {
      total,
      high,
      med,
      low,
      delta_total_1d: 0,
      pipeline_duration,
      own_matches,
      own_matches_delta: 0,
    };
  } catch (err) {
    console.error("[queries] getKpis failed", err);
    return {
      total: 0,
      high: 0,
      med: 0,
      low: 0,
      delta_total_1d: 0,
      pipeline_duration: "—",
      own_matches: 0,
      own_matches_delta: 0,
    };
  }
}

// ── 오늘의 findings (anomaly table) ─────────────────────────
export async function getTodayFindings(date: string): Promise<TodayFinding[]> {
  if (USE_MOCK) return mockFindings;
  void date; // v_today_findings는 latest_report 기준 자동 필터
  try {
    const sb = await supabaseServer();
    const { data } = await sb
      .from("v_today_findings")
      .select("*")
      .order("severity", { ascending: false });
    return (data ?? []) as unknown as TodayFinding[];
  } catch (err) {
    console.error("[queries] getTodayFindings failed", err);
    return [];
  }
}

// ── 파이프라인 상태 ─────────────────────────────────────────
export async function getPipeline(): Promise<PipelineStage[]> {
  if (USE_MOCK) return mockPipeline;
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from("v_pipeline_today").select("*");
    return (data ?? []) as unknown as PipelineStage[];
  } catch (err) {
    console.error("[queries] getPipeline failed", err);
    return [];
  }
}

// ── 30일 severity 스택 ──────────────────────────────────────
export async function getSeverityDaily(
  startDate: string,
  endDate: string,
): Promise<SeverityDaily[]> {
  if (USE_MOCK) return mockSeverityDaily;
  try {
    const sb = await supabaseServer();
    const { data } = await sb.rpc("f_severity_daily", {
      start_date: startDate,
      end_date: endDate,
    });
    return (data ?? []) as SeverityDaily[];
  } catch (err) {
    console.error("[queries] getSeverityDaily failed", err);
    return [];
  }
}

// ── 단일 finding (anomaly 상세) ─────────────────────────────
export async function getFinding(
  anomalyId: string,
): Promise<TodayFinding | null> {
  if (USE_MOCK) {
    return mockFindings.find((f) => f.anomaly_id === anomalyId) ?? null;
  }
  try {
    const sb = await supabaseServer();
    const { data } = await sb
      .from("v_today_findings")
      .select("*")
      .eq("anomaly_id", anomalyId)
      .maybeSingle();
    return data ? (data as unknown as TodayFinding) : null;
  } catch (err) {
    console.error("[queries] getFinding failed", err);
    return null;
  }
}

// ── anomaly KPI ─────────────────────────────────────────────
export async function getAnomalyKpis(anomalyId: string): Promise<AnomalyKpis> {
  if (USE_MOCK) return mockAnomalyKpis;
  const fallback: AnomalyKpis = {
    rank_main: null,
    delta_rank_1d: null,
    delta_rank_7d: null,
    wishlist_count: null,
    delta_wishlist_pct: null,
    review_velocity_x: null,
    matched_sku_count: 0,
    severity: 0,
    anomaly_type: "rank_surge",
  };
  try {
    const sb = await supabaseServer();
    const { data } = await sb.rpc("f_anomaly_kpis", {
      p_anomaly_id: anomalyId,
    });
    const rows = data ?? [];
    return rows.length > 0 ? (rows[0] as unknown as AnomalyKpis) : fallback;
  } catch (err) {
    console.error("[queries] getAnomalyKpis failed", err);
    return fallback;
  }
}

// ── 상품 추이 ───────────────────────────────────────────────
export async function getProductTrend(
  productId: string,
  days = 30,
): Promise<ProductTrendRow[]> {
  if (USE_MOCK) return mockProductTrend;
  try {
    const sb = await supabaseServer();
    const { data } = await sb.rpc("f_product_trend", {
      p_product_id: productId,
      p_days: days,
    });
    return (data ?? []) as unknown as ProductTrendRow[];
  } catch (err) {
    console.error("[queries] getProductTrend failed", err);
    return [];
  }
}

// ── AI 분석 ─────────────────────────────────────────────────
export async function getAnalysis(
  anomalyId: string,
): Promise<AgentAnalysis | null> {
  if (USE_MOCK) return mockAnalyses[anomalyId] ?? null;
  try {
    const sb = await supabaseServer();
    const { data: rawData } = await sb
      .from("agent_analyses")
      .select("*")
      .eq("anomaly_id", anomalyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // strategy_recommendation은 DB상 Json, 런타임에 StrategyRecommendation 객체
    const data = rawData as unknown as AgentAnalysis | null;
    return data ?? null;
  } catch (err) {
    console.error("[queries] getAnalysis failed", err);
    return null;
  }
}

// ── 자사 매칭 SKU ───────────────────────────────────────────
export async function getMatches(productId: string): Promise<ProductMatch[]> {
  if (USE_MOCK) return mockMatches[productId] ?? [];
  try {
    const sb = await supabaseServer();
    const { data } = await sb
      .from("product_matches")
      .select("*")
      .eq("competitor_product_id", productId)
      .order("similarity_score", { ascending: false });
    return (data ?? []) as unknown as ProductMatch[];
  } catch (err) {
    console.error("[queries] getMatches failed", err);
    return [];
  }
}

// ── 활동 타임라인 ───────────────────────────────────────────
// TODO: anomalies + agent_analyses + products.first_seen_at UNION 쿼리로 구현 예정
export async function getTimeline(productId: string): Promise<TimelineEvent[]> {
  if (USE_MOCK) return mockTimeline;
  void productId;
  return [];
}

// ── 카테고리 목록 ────────────────────────────────────────────
export interface CategoryRow {
  id: string;
  musinsa_code: string;
  name_kr: string;
}

export async function getActiveCategories(): Promise<CategoryRow[]> {
  if (USE_MOCK) return [];
  try {
    const sb = await supabaseServer();
    const { data } = await sb
      .from("categories")
      .select("id, musinsa_code, name_kr")
      .eq("is_active", true)
      .eq("depth", 1)
      .order("musinsa_code");
    return (data ?? []) as unknown as CategoryRow[];
  } catch (err) {
    console.error("[queries] getActiveCategories failed", err);
    return [];
  }
}

// ── 오늘 수집된 상품 랭킹 ────────────────────────────────────
export interface ProductTodayRow {
  product_id: string;
  musinsa_no: string;
  product_name: string;
  product_url: string;
  brand_name: string;
  brand_slug: string | null;
  company_name: string | null;
  rank_main: number | null;
  current_price: number;
  discount_rate: number | null;
  rating: number | null;
  is_sold_out: boolean;
  thumbnail_url: string | null;
  category_name: string | null;
}

export async function getProductsToday(opts: {
  category_code?: string;
  brand_slug?: string;
  date?: string; // YYYY-MM-DD; 생략 시 오늘 KST
  limit?: number;
  offset?: number;
}): Promise<{ rows: ProductTodayRow[]; total: number }> {
  if (USE_MOCK) return { rows: [], total: 0 };
  const { category_code, brand_slug, limit = 50, offset = 0 } = opts;
  try {
    const sb = await supabaseServer();
    const todayKST = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const today = opts.date ?? todayKST;

    // 카테고리 코드 → id 변환
    let categoryId: string | null = null;
    if (category_code) {
      const { data: catRow } = await sb
        .from("categories")
        .select("id")
        .eq("musinsa_code", category_code)
        .maybeSingle();
      categoryId = (catRow as unknown as { id: string } | null)?.id ?? null;
    }

    // 브랜드 slug → id 변환
    let brandId: string | null = null;
    if (brand_slug) {
      const { data: bRow } = await sb
        .from("brands")
        .select("id")
        .eq("slug", brand_slug)
        .maybeSingle();
      brandId = (bRow as unknown as { id: string } | null)?.id ?? null;
    }

    type RawRow = {
      product_id: string;
      rank_main: number | null;
      current_price: number;
      discount_rate: number | null;
      rating: number | null;
      is_sold_out: boolean | null;
      products: {
        musinsa_no: string;
        name: string;
        url: string;
        category_id: string | null;
        thumbnail_url: string | null;
        main_image_url: string | null;
        brands: { name: string; slug: string; companies: { name: string } | null } | null;
        categories: { name_kr: string } | null;
        product_images: Array<{ cdn_url: string | null; image_type: string | null; order_idx: number }>;
      } | null;
    };

    let query = sb
      .from("product_snapshots")
      .select(
        `product_id,
         rank_main,
         current_price,
         discount_rate,
         rating,
         is_sold_out,
         products!inner (
           musinsa_no,
           name,
           url,
           category_id,
           thumbnail_url,
           main_image_url,
           brands!inner ( name, slug, companies ( name ) ),
           categories ( name_kr ),
           product_images ( cdn_url, image_type, order_idx )
         )`,
        { count: "exact" }
      )
      .eq("snapshot_date", today)
      .not("rank_main", "is", null)
      .order("rank_main", { ascending: true })
      .range(offset, offset + limit - 1);

    if (categoryId) {
      query = query.eq("products.category_id", categoryId);
    }
    if (brandId) {
      query = query.eq("products.brand_id", brandId);
    }

    const { data: rawData, count } = await query;
    const rawRows = (rawData ?? []) as unknown as RawRow[];

    const rows: ProductTodayRow[] = rawRows.map((r) => {
      const prod = r.products;
      const brand = prod?.brands;
      const images = prod?.product_images ?? [];
      const thumb =
        prod?.main_image_url ??
        prod?.thumbnail_url ??
        images.find((i) => i.image_type === "thumbnail" || i.image_type === "main")?.cdn_url ??
        images[0]?.cdn_url ??
        null;
      return {
        product_id: r.product_id,
        musinsa_no: prod?.musinsa_no ?? "",
        product_name: prod?.name ?? "",
        product_url: prod?.url ?? "",
        brand_name: brand?.name ?? "",
        brand_slug: brand?.slug ?? null,
        company_name: brand?.companies?.name ?? null,
        rank_main: r.rank_main,
        current_price: r.current_price,
        discount_rate: r.discount_rate,
        rating: r.rating,
        is_sold_out: r.is_sold_out ?? false,
        thumbnail_url: thumb,
        category_name: prod?.categories?.name_kr ?? null,
      };
    });

    return { rows, total: count ?? 0 };
  } catch (err) {
    console.error("[queries] getProductsToday failed", err);
    return { rows: [], total: 0 };
  }
}

// ── 회사 목록 ─────────────────────────────────────────────────
export interface CompanyRow {
  id: string;
  name: string;
  name_alt: string | null;
  is_own: boolean;
  listing_type: "listed" | "unlisted";
  revenue_2025_mkrw: number | null;
  revenue_2024_mkrw: number | null;
  revenue_yoy_pct: number | null;
  op_income_2025_mkrw: number | null;
  op_income_2024_mkrw: number | null;
  op_margin_2025_pct: number | null;
  op_status_note: string | null;
  brand_count: number;
  today_active_brands: number;
}

export async function getCompanies(opts: {
  sort?: "revenue" | "op_margin" | "today_active";
  listing_type?: "listed" | "unlisted" | "all";
}): Promise<CompanyRow[]> {
  if (USE_MOCK) return [];
  const { sort = "revenue", listing_type = "all" } = opts;
  try {
    const sb = await supabaseServer();
    const today = new Date().toISOString().slice(0, 10);

    // 3개 병렬 쿼리
    type CRaw = {
      id: string; name: string; name_alt: string | null; is_own: boolean;
      listing_type: string;
      revenue_2025_mkrw: number | null; revenue_2024_mkrw: number | null;
      revenue_yoy_pct: number | null;
      op_income_2025_mkrw: number | null; op_income_2024_mkrw: number | null;
      op_margin_2025_pct: number | null; op_status_note: string | null;
    };
    type BRaw = { id: string; company_id: string | null };
    type SnapRaw = { products: { brand_id: string } | null };

    const [compRes, brandRes, snapRes] = await Promise.all([
      sb.from("companies").select(
        "id, name, name_alt, is_own, listing_type, revenue_2025_mkrw, revenue_2024_mkrw, revenue_yoy_pct, op_income_2025_mkrw, op_income_2024_mkrw, op_margin_2025_pct, op_status_note"
      ),
      sb.from("brands").select("id, company_id").not("company_id", "is", null),
      sb.from("product_snapshots").select("products!inner(brand_id)").eq("snapshot_date", today),
    ]);

    const companies = (compRes.data ?? []) as unknown as CRaw[];
    const brands    = (brandRes.data ?? []) as unknown as BRaw[];
    const snaps     = (snapRes.data ?? []) as unknown as SnapRaw[];

    // brand_id → company_id 역방향 맵
    const brandToCompany = new Map<string, string>();
    const brandsByCompany = new Map<string, number>();
    for (const b of brands) {
      if (!b.company_id) continue;
      brandToCompany.set(b.id, b.company_id);
      brandsByCompany.set(b.company_id, (brandsByCompany.get(b.company_id) ?? 0) + 1);
    }

    // 오늘 활동 브랜드 set
    const activeBrandIds = new Set(
      snaps.map((s) => s.products?.brand_id).filter(Boolean) as string[]
    );
    const todayActiveByCompany = new Map<string, number>();
    for (const bid of activeBrandIds) {
      const cid = brandToCompany.get(bid);
      if (cid) todayActiveByCompany.set(cid, (todayActiveByCompany.get(cid) ?? 0) + 1);
    }

    let rows: CompanyRow[] = companies.map((c) => ({
      id: c.id,
      name: c.name,
      name_alt: c.name_alt,
      is_own: c.is_own,
      listing_type: c.listing_type as "listed" | "unlisted",
      revenue_2025_mkrw: c.revenue_2025_mkrw,
      revenue_2024_mkrw: c.revenue_2024_mkrw,
      revenue_yoy_pct: c.revenue_yoy_pct,
      op_income_2025_mkrw: c.op_income_2025_mkrw,
      op_income_2024_mkrw: c.op_income_2024_mkrw,
      op_margin_2025_pct: c.op_margin_2025_pct,
      op_status_note: c.op_status_note,
      brand_count: brandsByCompany.get(c.id) ?? 0,
      today_active_brands: todayActiveByCompany.get(c.id) ?? 0,
    }));

    // 필터
    if (listing_type !== "all") {
      rows = rows.filter((r) => r.listing_type === listing_type);
    }

    // 정렬: is_own=true 는 항상 아래 (인위적 상단 배치 없음 — 숫자 정렬만)
    rows.sort((a, b) => {
      if (sort === "revenue") {
        return (b.revenue_2025_mkrw ?? -Infinity) - (a.revenue_2025_mkrw ?? -Infinity);
      }
      if (sort === "op_margin") {
        return (b.op_margin_2025_pct ?? -Infinity) - (a.op_margin_2025_pct ?? -Infinity);
      }
      // today_active
      return b.today_active_brands - a.today_active_brands;
    });

    return rows;
  } catch (err) {
    console.error("[queries] getCompanies failed", err);
    return [];
  }
}

// ── 브랜드 목록 ───────────────────────────────────────────────
export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  is_competitor: boolean;
  is_own: boolean;
  company_id: string | null;
  company_name: string | null;
  company_mapping_confidence: string | null;
  created_at: string;
  today_products: number;
  today_categories: string[];
}

export interface BrandStats {
  total: number;
  competitors: number;
  own: number;
  unreviewed: number;
  today_active: number;
}

const BRAND_PAGE_SIZE = 50;

export async function getBrands(opts: {
  filter?: "all" | "competitor" | "own" | "unreviewed" | "today_active";
  sort?: "today_products" | "name" | "created";
  page?: number;
}): Promise<{ rows: BrandRow[]; total: number; stats: BrandStats }> {
  const empty = { rows: [], total: 0, stats: { total: 0, competitors: 0, own: 0, unreviewed: 0, today_active: 0 } };
  if (USE_MOCK) return empty;
  const { filter = "all", sort = "today_products", page = 1 } = opts;
  try {
    const sb = await supabaseServer();
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    type BRaw = {
      id: string; name: string; slug: string;
      is_competitor: boolean; is_own: boolean;
      company_id: string | null;
      company_mapping_confidence: string | null;
      created_at: string;
      companies: { id: string; name: string } | null;
    };
    type SnapRaw = {
      products: { brand_id: string; categories: { name_kr: string } | null } | null;
    };

    // 브랜드 전체 + 회사 조인, 오늘 스냅샷 병렬 조회
    const [brandsRes, snapsRes] = await Promise.all([
      sb.from("brands").select(
        "id, name, slug, is_competitor, is_own, company_id, company_mapping_confidence, created_at, companies(id, name)"
      ),
      sb.from("product_snapshots")
        .select("products!inner(brand_id, categories(name_kr))")
        .eq("snapshot_date", today),
    ]);

    const rawBrands = (brandsRes.data ?? []) as unknown as BRaw[];
    const rawSnaps  = (snapsRes.data  ?? []) as unknown as SnapRaw[];

    // 오늘 활동 집계: brand_id → { count, categories }
    const todayMap = new Map<string, { count: number; cats: Set<string> }>();
    for (const s of rawSnaps) {
      const bid = s.products?.brand_id;
      if (!bid) continue;
      if (!todayMap.has(bid)) todayMap.set(bid, { count: 0, cats: new Set() });
      const e = todayMap.get(bid)!;
      e.count++;
      const cat = s.products?.categories?.name_kr;
      if (cat) e.cats.add(cat);
    }

    // 전체 BrandRow 구성
    const all: BrandRow[] = rawBrands.map((b) => {
      const t = todayMap.get(b.id);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        is_competitor: b.is_competitor,
        is_own: b.is_own,
        company_id: b.companies?.id ?? b.company_id ?? null,
        company_name: b.companies?.name ?? null,
        company_mapping_confidence: b.company_mapping_confidence,
        created_at: b.created_at,
        today_products: t?.count ?? 0,
        today_categories: t ? Array.from(t.cats) : [],
      };
    });

    // 통계 (필터 전 전체 기준)
    const stats: BrandStats = {
      total: all.length,
      competitors: all.filter((r) => r.is_competitor).length,
      own: all.filter((r) => r.is_own).length,
      unreviewed: all.filter(
        (r) => !r.is_competitor && !r.is_own && r.created_at >= sevenDaysAgoStr
      ).length,
      today_active: all.filter((r) => r.today_products > 0).length,
    };

    // 필터
    let filtered = all;
    if (filter === "competitor")   filtered = all.filter((r) => r.is_competitor);
    if (filter === "own")          filtered = all.filter((r) => r.is_own);
    if (filter === "unreviewed")   filtered = all.filter((r) => !r.is_competitor && !r.is_own && r.created_at >= sevenDaysAgoStr);
    if (filter === "today_active") filtered = all.filter((r) => r.today_products > 0);

    // 정렬
    if (sort === "today_products") {
      filtered.sort((a, b) => b.today_products - a.today_products || a.name.localeCompare(b.name, "ko"));
    } else if (sort === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else {
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    // 페이지네이션
    const offset = (page - 1) * BRAND_PAGE_SIZE;
    const rows = filtered.slice(offset, offset + BRAND_PAGE_SIZE);
    return { rows, total: filtered.length, stats };
  } catch (err) {
    console.error("[queries] getBrands failed", err);
    return empty;
  }
}
