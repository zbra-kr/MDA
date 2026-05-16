// viewer/lib/queries-dashboard.ts
// 메인 대시보드 · 자사 운영 · 매핑 상태 데이터 접근 레이어.
// supabaseServer() (anon read) 전용. service_role 사용 금지.
//
// 재무 data_source 정책: audit_report_xml + finstate_api 모두 포함.
// 중복 (company_id, fiscal_year) 은 dedupByYear 로 우선순위 높은 행 1개만 사용.

import { supabaseServer } from "@/lib/supabase/server";

// ─── 내부 헬퍼 (queries-insights 동일 정책) ──────────────────────

interface FinRaw {
  company_id: string;
  fiscal_year: number;
  is_consolidated: boolean;
  data_source: string;
  total_assets_mkrw: number | null;
}

function finPriority(f: FinRaw): number {
  return (f.is_consolidated ? 0 : 2) + (f.data_source === "finstate_api" ? 0 : 1);
}

function dedupByYear(rows: FinRaw[]): Map<string, FinRaw> {
  const best = new Map<string, FinRaw>();
  for (const f of rows) {
    const key = `${f.company_id}|${f.fiscal_year}`;
    const prev = best.get(key);
    if (!prev || finPriority(f) < finPriority(prev)) best.set(key, f);
  }
  return best;
}

// ─── 타입 정의 ───────────────────────────────────────────────────

export interface OwnBrandRankRow {
  id: string;
  name: string;
  slug: string;
  sku_count: number;
  avg_rank_week: number | null;
  price_tier: string | null;
  brand_category: string | null;
}

export interface RecentDisclosure {
  id: string;
  report_nm: string;
  rcept_dt: string;
  disclosure_type: string;
  dart_url: string;
  company_name: string | null;
}

export interface MappingSummary {
  total_companies: number;
  total_mapped_brands: number;
  deficient_companies: number;
}

export interface MappingCompanyRow {
  id: string;
  name: string;
  is_own: boolean;
  brand_count: number;
  musinsa_present_count: number;
  signal: "충분" | "보통" | "부족";
}

export interface MainDashboardData {
  own_revenue_mkrw: number | null;
  own_assets_mkrw: number | null;
  own_brand_count: number;
  competitor_avg_revenue_mkrw: number | null;
  competitor_count: number;
  recent_disclosures: RecentDisclosure[];
  mapping_summary: MappingSummary;
  last_updated: string | null;
}

// ─── getMainDashboardData ────────────────────────────────────────

export async function getMainDashboardData(): Promise<MainDashboardData> {
  const fallback: MainDashboardData = {
    own_revenue_mkrw: null,
    own_assets_mkrw: null,
    own_brand_count: 0,
    competitor_avg_revenue_mkrw: null,
    competitor_count: 0,
    recent_disclosures: [],
    mapping_summary: { total_companies: 0, total_mapped_brands: 0, deficient_companies: 0 },
    last_updated: null,
  };

  try {
    const sb = await supabaseServer();

    type CRaw = { id: string; is_own: boolean; revenue_2024_mkrw: number | null };
    type DRaw = {
      id: string; report_nm: string; rcept_dt: string;
      disclosure_type: string; dart_url: string;
      companies: { name: string } | null;
    };
    type SummaryRaw = { brand_count: number; musinsa_present_count: number };
    type FinHistRaw = FinRaw;
    type ReportRaw = { report_date: string };

    const [compRes, finRes, discRes, summaryRes, lastUpdRes] = await Promise.all([
      sb.from("companies").select("id, is_own, revenue_2024_mkrw"),

      // is_consolidated 필터 없음 — dedupByYear 로 우선순위 처리
      sb.from("company_financials_history")
        .select("company_id, fiscal_year, is_consolidated, data_source, total_assets_mkrw")
        .is("fiscal_quarter", null)
        .eq("fiscal_year", 2024),

      sb.from("disclosures")
        .select("id, report_nm, rcept_dt, disclosure_type, dart_url, companies(name)")
        .order("rcept_dt", { ascending: false })
        .limit(5),

      sb.from("v_company_brand_summary")
        .select("brand_count, musinsa_present_count"),

      sb.from("daily_reports")
        .select("report_date")
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const companies = (compRes.data ?? []) as unknown as CRaw[];
    const ownCompany = companies.find((c) => c.is_own) ?? null;
    const competitors = companies.filter((c) => !c.is_own && c.revenue_2024_mkrw != null);
    const competitorAvg =
      competitors.length > 0
        ? Math.round(
            competitors.reduce((sum, c) => sum + (c.revenue_2024_mkrw ?? 0), 0) /
              competitors.length,
          )
        : null;

    // 자사 총자산: company_financials_history FY2024 with dedup
    const rawFins = (finRes.data ?? []) as unknown as FinHistRaw[];
    const dedupMap = dedupByYear(rawFins);
    const ownAssets = ownCompany
      ? (dedupMap.get(`${ownCompany.id}|2024`)?.total_assets_mkrw ?? null)
      : null;

    // 자사 brand 수
    const { count: ownBrandCount } = await sb
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("is_own", true);

    // 공시
    const recentDisclosures = ((discRes.data ?? []) as unknown as DRaw[]).map((d) => ({
      id: d.id,
      report_nm: d.report_nm,
      rcept_dt: d.rcept_dt,
      disclosure_type: d.disclosure_type,
      dart_url: d.dart_url,
      company_name: d.companies?.name ?? null,
    }));

    // 매핑 요약
    const summaryRows = (summaryRes.data ?? []) as unknown as SummaryRaw[];
    const mappingSummary: MappingSummary = {
      total_companies: summaryRows.length,
      total_mapped_brands: summaryRows.reduce((s, r) => s + (r.brand_count ?? 0), 0),
      deficient_companies: summaryRows.filter((r) => (r.brand_count ?? 0) <= 1).length,
    };

    return {
      own_revenue_mkrw: ownCompany?.revenue_2024_mkrw ?? null,
      own_assets_mkrw: ownAssets,
      own_brand_count: ownBrandCount ?? 0,
      competitor_avg_revenue_mkrw: competitorAvg,
      competitor_count: competitors.length,
      recent_disclosures: recentDisclosures,
      mapping_summary: mappingSummary,
      last_updated: ((lastUpdRes.data as unknown as ReportRaw | null)?.report_date) ?? null,
    };
  } catch (err) {
    console.error("[queries-dashboard] getMainDashboardData failed", err);
    return fallback;
  }
}

// ─── getOwnBrandsData ────────────────────────────────────────────

export async function getOwnBrandsData(): Promise<OwnBrandRankRow[]> {
  try {
    const sb = await supabaseServer();

    type BRaw = {
      id: string; name: string; slug: string;
      price_tier: string | null; brand_category: string | null;
    };
    type ProdRaw = { id: string; brand_id: string };
    type SnapRaw = { product_id: string; rank_main: number | null };
    type SnapDateRaw = { snapshot_date: string };

    // 1. 자사 brand 목록
    const { data: brandsData } = await sb
      .from("brands")
      .select("id, name, slug, price_tier, brand_category")
      .eq("is_own", true)
      .order("name");

    const ownBrands = (brandsData ?? []) as unknown as BRaw[];
    if (ownBrands.length === 0) return [];
    const ownBrandIds = ownBrands.map((b) => b.id);

    // 2. 제품 목록 (SKU 수)
    const { data: prodsData } = await sb
      .from("products")
      .select("id, brand_id")
      .in("brand_id", ownBrandIds);

    const products = (prodsData ?? []) as unknown as ProdRaw[];
    const skuCountMap = new Map<string, number>();
    const prodToBrand = new Map<string, string>();
    const allProdIds: string[] = [];

    for (const p of products) {
      skuCountMap.set(p.brand_id, (skuCountMap.get(p.brand_id) ?? 0) + 1);
      prodToBrand.set(p.id, p.brand_id);
      allProdIds.push(p.id);
    }

    // 3. 최근 7일 스냅샷으로 평균 랭킹 계산 (데이터 없으면 null)
    const rankMap = new Map<string, { sum: number; count: number }>();
    if (allProdIds.length > 0) {
      const { data: latestSnapData } = await sb
        .from("product_snapshots")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestDate = (latestSnapData as unknown as SnapDateRaw | null)?.snapshot_date;
      if (latestDate) {
        const d = new Date(latestDate);
        d.setDate(d.getDate() - 6);
        const weekAgo = d.toISOString().slice(0, 10);

        const { data: snapsData } = await sb
          .from("product_snapshots")
          .select("product_id, rank_main")
          .in("product_id", allProdIds)
          .gte("snapshot_date", weekAgo)
          .lte("snapshot_date", latestDate)
          .not("rank_main", "is", null);

        for (const s of (snapsData ?? []) as unknown as SnapRaw[]) {
          const brandId = prodToBrand.get(s.product_id);
          if (!brandId || s.rank_main == null) continue;
          const cur = rankMap.get(brandId) ?? { sum: 0, count: 0 };
          cur.sum += s.rank_main;
          cur.count += 1;
          rankMap.set(brandId, cur);
        }
      }
    }

    return ownBrands.map((b) => {
      const r = rankMap.get(b.id);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        sku_count: skuCountMap.get(b.id) ?? 0,
        avg_rank_week: r ? Math.round(r.sum / r.count) : null,
        price_tier: b.price_tier,
        brand_category: b.brand_category,
      };
    });
  } catch (err) {
    console.error("[queries-dashboard] getOwnBrandsData failed", err);
    return [];
  }
}

// ─── getMappingStatusData ────────────────────────────────────────

export async function getMappingStatusData(): Promise<{
  companies: MappingCompanyRow[];
  conflict_count: number;
}> {
  try {
    const sb = await supabaseServer();

    type SummaryRaw = {
      id: string; name: string; is_own: boolean;
      brand_count: number; musinsa_present_count: number;
    };

    const [summaryRes, conflictRes] = await Promise.all([
      sb.from("v_company_brand_summary")
        .select("id, name, is_own, brand_count, musinsa_present_count"),
      sb.from("brands")
        .select("id", { count: "exact", head: true })
        .eq("company_mapping_confidence", "medium"),
    ]);

    const companies: MappingCompanyRow[] = ((summaryRes.data ?? []) as unknown as SummaryRaw[]).map(
      (c) => {
        const bc = c.brand_count ?? 0;
        const mp = c.musinsa_present_count ?? 0;
        const signal: MappingCompanyRow["signal"] =
          bc >= 5 && mp >= 3 ? "충분" : bc >= 2 ? "보통" : "부족";
        return {
          id: c.id,
          name: c.name,
          is_own: c.is_own ?? false,
          brand_count: bc,
          musinsa_present_count: mp,
          signal,
        };
      },
    );

    companies.sort((a, b) => {
      if (a.is_own && !b.is_own) return -1;
      if (!a.is_own && b.is_own) return 1;
      return a.name.localeCompare(b.name, "ko");
    });

    return {
      companies,
      conflict_count: conflictRes.count ?? 0,
    };
  } catch (err) {
    console.error("[queries-dashboard] getMappingStatusData failed", err);
    return { companies: [], conflict_count: 0 };
  }
}

// ─── getRecentDisclosures ────────────────────────────────────────

export async function getRecentDisclosures(n = 5): Promise<RecentDisclosure[]> {
  try {
    const sb = await supabaseServer();
    type DRaw = {
      id: string; report_nm: string; rcept_dt: string;
      disclosure_type: string; dart_url: string;
      companies: { name: string } | null;
    };
    const { data } = await sb
      .from("disclosures")
      .select("id, report_nm, rcept_dt, disclosure_type, dart_url, companies(name)")
      .order("rcept_dt", { ascending: false })
      .limit(n);
    return ((data ?? []) as unknown as DRaw[]).map((d) => ({
      id: d.id,
      report_nm: d.report_nm,
      rcept_dt: d.rcept_dt,
      disclosure_type: d.disclosure_type,
      dart_url: d.dart_url,
      company_name: d.companies?.name ?? null,
    }));
  } catch (err) {
    console.error("[queries-dashboard] getRecentDisclosures failed", err);
    return [];
  }
}

// ─── getMappingSummary ───────────────────────────────────────────

export async function getMappingSummary(): Promise<MappingSummary> {
  try {
    const sb = await supabaseServer();
    type SummaryRaw = { brand_count: number };
    const { data } = await sb
      .from("v_company_brand_summary")
      .select("brand_count");
    const rows = (data ?? []) as unknown as SummaryRaw[];
    return {
      total_companies: rows.length,
      total_mapped_brands: rows.reduce((s, r) => s + (r.brand_count ?? 0), 0),
      deficient_companies: rows.filter((r) => (r.brand_count ?? 0) <= 1).length,
    };
  } catch (err) {
    console.error("[queries-dashboard] getMappingSummary failed", err);
    return { total_companies: 0, total_mapped_brands: 0, deficient_companies: 0 };
  }
}
