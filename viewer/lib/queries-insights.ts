// viewer/lib/queries-insights.ts
// Phase 1.8 — 시각화 데이터 접근 레이어.
// 모든 쿼리는 supabaseServer() (anon read) 를 사용한다.
// service_role 사용 금지.
//
// 재무 data_source 정책 (2026-05-16 정호철 확정):
//   - finstate_api (listed, Phase 1.6) + audit_report_xml (unlisted·자사, Phase 1.7)
//     모두 동등하게 표시. viewer 에서 출처 구분 안 함.
//   - 같은 (company_id, fiscal_year) 두 source 가 있을 경우 (현재 0건, 미래 대비):
//     우선순위 = is_consolidated=true > false, finstate_api > audit_report_xml.

import { supabaseServer } from "@/lib/supabase/server";

// ─── 타입 정의 ─────────────────────────────────────────────────

export interface FinancialRow {
  fiscal_year: number;
  revenue_mkrw: number | null;
  operating_income_mkrw: number | null;
  net_income_mkrw: number | null;
  total_assets_mkrw: number | null;
  total_liabilities_mkrw: number | null;
  total_equity_mkrw: number | null;
}

export interface DisclosureRow {
  id: string;
  rcept_no: string;
  report_nm: string;
  rcept_dt: string;
  disclosure_type: string;
  dart_url: string;
}

export interface BrandInsightRow {
  id: string;
  name: string;
  slug: string;
  musinsa_brand_id: string | null;
  brand_category: string | null;
  price_tier: string | null;
  target_gender: string | null;
  hq_country: string | null;
  target_age: string | null;
  description: string | null;
  metadata_source: string | null;
}

export interface CompanyDashboardData {
  company: {
    id: string;
    name: string;
    name_alt: string | null;
    is_own: boolean;
    listing_type: string;
    corp_code: string | null;
    stock_code: string | null;
    business_number: string | null;
  };
  financials: FinancialRow[];
  disclosures: DisclosureRow[];
  brands: {
    total: number;
    musinsa_listed: number;
    list: BrandInsightRow[];
  };
}

export interface CompanyFinSummary {
  id: string;
  name: string;
  is_own: boolean;
  listing_type: string;
  fy2024: FinancialRow | null;
  fy2023: FinancialRow | null;
  brand_count: number;
  brand_categories: string[];
}

export interface BrandWithCompany {
  id: string;
  name: string;
  slug: string;
  brand_category: string | null;
  price_tier: string | null;
  target_gender: string | null;
  hq_country: string | null;
  description: string | null;
  company_id: string | null;
  company_name: string | null;
  company_revenue_mkrw: number | null;
}

// ─── 내부 타입 / 헬퍼 ──────────────────────────────────────────

interface FinRaw {
  company_id: string;
  fiscal_year: number;
  is_consolidated: boolean;
  data_source: string;
  revenue_mkrw: number | null;
  operating_income_mkrw: number | null;
  net_income_mkrw: number | null;
  total_assets_mkrw: number | null;
  total_liabilities_mkrw: number | null;
  total_equity_mkrw: number | null;
}

// 낮을수록 우선 (0 = 가장 선호)
function finPriority(f: FinRaw): number {
  return (f.is_consolidated ? 0 : 2) + (f.data_source === "finstate_api" ? 0 : 1);
}

/**
 * 같은 (company_id, fiscal_year) 내에서 우선순위 높은 행 1개만 남긴다.
 * 우선순위: consolidated=true > false, finstate_api > audit_report_xml.
 */
function dedupByYear(rows: FinRaw[]): Map<string, FinRaw> {
  // key = `${company_id}|${fiscal_year}`
  const best = new Map<string, FinRaw>();
  for (const f of rows) {
    const key = `${f.company_id}|${f.fiscal_year}`;
    const prev = best.get(key);
    if (!prev || finPriority(f) < finPriority(prev)) {
      best.set(key, f);
    }
  }
  return best;
}

function toFinancialRow(f: FinRaw): FinancialRow {
  return {
    fiscal_year: f.fiscal_year,
    revenue_mkrw: f.revenue_mkrw,
    operating_income_mkrw: f.operating_income_mkrw,
    net_income_mkrw: f.net_income_mkrw,
    total_assets_mkrw: f.total_assets_mkrw,
    total_liabilities_mkrw: f.total_liabilities_mkrw,
    total_equity_mkrw: f.total_equity_mkrw,
  };
}

// ─── getCompanyDashboard ────────────────────────────────────────

export async function getCompanyDashboard(
  companyId: string,
): Promise<CompanyDashboardData | null> {
  try {
    const sb = await supabaseServer();

    type CRaw = {
      id: string; name: string; name_alt: string | null;
      is_own: boolean; listing_type: string;
      dart_corp_codes: { corp_code: string; stock_code: string | null; business_number: string | null } | null;
    };
    type DRaw = {
      id: string; rcept_no: string; report_nm: string;
      rcept_dt: string; disclosure_type: string; dart_url: string;
    };
    type BRaw = {
      id: string; name: string; slug: string;
      musinsa_brand_id: string | null;
      brand_category: string | null; price_tier: string | null;
      target_gender: string | null; hq_country: string | null;
      target_age: string | null; description: string | null;
      metadata_source: string | null;
    };

    const [compRes, finRes, discRes, brandRes] = await Promise.all([
      sb.from("companies")
        .select("id, name, name_alt, is_own, listing_type, dart_corp_codes(corp_code, stock_code, business_number)")
        .eq("id", companyId)
        .maybeSingle(),

      // is_consolidated 필터 제거 — finstate_api(consolidated) + audit_report_xml(standalone) 모두 포함
      sb.from("company_financials_history")
        .select("company_id, fiscal_year, is_consolidated, data_source, revenue_mkrw, operating_income_mkrw, net_income_mkrw, total_assets_mkrw, total_liabilities_mkrw, total_equity_mkrw")
        .eq("company_id", companyId)
        .is("fiscal_quarter", null)
        .order("fiscal_year", { ascending: true }),

      sb.from("disclosures")
        .select("id, rcept_no, report_nm, rcept_dt, disclosure_type, dart_url")
        .eq("company_id", companyId)
        .order("rcept_dt", { ascending: false })
        .limit(30),

      sb.from("brands")
        .select("id, name, slug, musinsa_brand_id, brand_category, price_tier, target_gender, hq_country, target_age, description, metadata_source")
        .eq("company_id", companyId)
        .order("name"),
    ]);

    if (!compRes.data) return null;
    const c = compRes.data as unknown as CRaw;
    const dc = c.dart_corp_codes;

    // 단일 회사 dedup: 같은 fiscal_year 두 source 있으면 우선순위 높은 것 사용
    const rawFins = (finRes.data ?? []) as unknown as FinRaw[];
    const dedupMap = dedupByYear(rawFins);
    const financials: FinancialRow[] = Array.from(dedupMap.values())
      .sort((a, b) => a.fiscal_year - b.fiscal_year)
      .map(toFinancialRow);

    return {
      company: {
        id: c.id,
        name: c.name,
        name_alt: c.name_alt,
        is_own: c.is_own,
        listing_type: c.listing_type,
        corp_code: dc?.corp_code ?? null,
        stock_code: dc?.stock_code ?? null,
        business_number: dc?.business_number ?? null,
      },
      financials,
      disclosures: (discRes.data ?? []) as unknown as DRaw[],
      brands: (() => {
        const list = (brandRes.data ?? []) as unknown as BRaw[];
        return {
          total: list.length,
          musinsa_listed: list.filter((b) => b.musinsa_brand_id !== null).length,
          list,
        };
      })(),
    };
  } catch {
    return null;
  }
}

// ─── getCompetitorComparisonData ───────────────────────────────

export async function getCompetitorComparisonData(): Promise<CompanyFinSummary[]> {
  try {
    const sb = await supabaseServer();

    type CRaw = { id: string; name: string; is_own: boolean; listing_type: string };
    type BRaw = { company_id: string | null; brand_category: string | null };

    const [compRes, finRes, brandRes] = await Promise.all([
      sb.from("companies").select("id, name, is_own, listing_type"),

      // is_consolidated 필터 제거 — FY2024·2023 전체 (양 source)
      sb.from("company_financials_history")
        .select("company_id, fiscal_year, is_consolidated, data_source, revenue_mkrw, operating_income_mkrw, net_income_mkrw, total_assets_mkrw, total_liabilities_mkrw, total_equity_mkrw")
        .is("fiscal_quarter", null)
        .in("fiscal_year", [2024, 2023]),

      sb.from("brands")
        .select("company_id, brand_category")
        .not("company_id", "is", null),
    ]);

    const companies = (compRes.data ?? []) as unknown as CRaw[];
    const rawFins = (finRes.data ?? []) as unknown as FinRaw[];
    const brands = (brandRes.data ?? []) as unknown as BRaw[];

    // (company_id, fiscal_year) dedup — 우선순위 적용
    const dedupMap = dedupByYear(rawFins);

    // company_id → { fy2024, fy2023 } 인덱스
    const finMap = new Map<string, { fy2024: FinRaw | null; fy2023: FinRaw | null }>();
    for (const f of dedupMap.values()) {
      if (!finMap.has(f.company_id)) finMap.set(f.company_id, { fy2024: null, fy2023: null });
      const entry = finMap.get(f.company_id)!;
      if (f.fiscal_year === 2024) entry.fy2024 = f;
      if (f.fiscal_year === 2023) entry.fy2023 = f;
    }

    // brand 집계
    const brandMap = new Map<string, { count: number; cats: Set<string> }>();
    for (const b of brands) {
      if (!b.company_id) continue;
      if (!brandMap.has(b.company_id)) brandMap.set(b.company_id, { count: 0, cats: new Set() });
      const e = brandMap.get(b.company_id)!;
      e.count++;
      if (b.brand_category) e.cats.add(b.brand_category);
    }

    const rows: CompanyFinSummary[] = companies.map((c) => {
      const fm = finMap.get(c.id) ?? { fy2024: null, fy2023: null };
      const bm = brandMap.get(c.id) ?? { count: 0, cats: new Set() };
      return {
        id: c.id,
        name: c.name,
        is_own: c.is_own,
        listing_type: c.listing_type,
        fy2024: fm.fy2024 ? toFinancialRow(fm.fy2024) : null,
        fy2023: fm.fy2023 ? toFinancialRow(fm.fy2023) : null,
        brand_count: bm.count,
        brand_categories: Array.from(bm.cats),
      };
    });

    // 자사 항상 최상단, 나머지 매출 desc
    rows.sort((a, b) => {
      if (a.is_own && !b.is_own) return -1;
      if (!a.is_own && b.is_own) return 1;
      return (b.fy2024?.revenue_mkrw ?? -Infinity) - (a.fy2024?.revenue_mkrw ?? -Infinity);
    });

    return rows;
  } catch {
    return [];
  }
}

// ─── getCategoryData ────────────────────────────────────────────

export async function getCategoryData(): Promise<BrandWithCompany[]> {
  try {
    const sb = await supabaseServer();

    type BRaw = {
      id: string; name: string; slug: string;
      brand_category: string | null; price_tier: string | null;
      target_gender: string | null; hq_country: string | null;
      description: string | null; company_id: string | null;
      companies: { name: string } | null;
    };

    const [brandRes, finRes] = await Promise.all([
      sb.from("brands")
        .select("id, name, slug, brand_category, price_tier, target_gender, hq_country, description, company_id, companies(name)")
        .not("brand_category", "is", null)
        .order("name"),

      // is_consolidated 필터 제거 — audit_report_xml(비상장·자사) 포함
      sb.from("company_financials_history")
        .select("company_id, fiscal_year, is_consolidated, data_source, revenue_mkrw")
        .is("fiscal_quarter", null)
        .eq("fiscal_year", 2024),
    ]);

    const brands = (brandRes.data ?? []) as unknown as BRaw[];
    const rawFins = (finRes.data ?? []) as unknown as (FinRaw & { revenue_mkrw: number | null })[];

    // FY2024 dedup — 우선순위 높은 행만
    const dedupMap = dedupByYear(rawFins);
    const revMap = new Map<string, number | null>();
    for (const f of dedupMap.values()) {
      revMap.set(f.company_id, f.revenue_mkrw);
    }

    return brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      brand_category: b.brand_category,
      price_tier: b.price_tier,
      target_gender: b.target_gender,
      hq_country: b.hq_country,
      description: b.description,
      company_id: b.company_id,
      company_name: b.companies?.name ?? null,
      company_revenue_mkrw: b.company_id ? (revMap.get(b.company_id) ?? null) : null,
    }));
  } catch {
    return [];
  }
}

// ─── getInsightCompanyList ──────────────────────────────────────

export interface InsightCompanyListItem {
  id: string;
  name: string;
  is_own: boolean;
  listing_type: string;
  revenue_mkrw: number | null;
  fiscal_year_shown: number | null;
  brand_count: number;
  has_financials: boolean;
}

export async function getInsightCompanyList(): Promise<InsightCompanyListItem[]> {
  try {
    const sb = await supabaseServer();

    type CRaw = { id: string; name: string; is_own: boolean; listing_type: string };
    type BRaw = { company_id: string | null };

    const [compRes, finRes, brandRes] = await Promise.all([
      sb.from("companies").select("id, name, is_own, listing_type").order("name"),

      // is_consolidated 필터 제거 — 최신 연도별 최선 행 취득
      sb.from("company_financials_history")
        .select("company_id, fiscal_year, is_consolidated, data_source, revenue_mkrw")
        .is("fiscal_quarter", null)
        .in("fiscal_year", [2025, 2024, 2023]),

      sb.from("brands").select("company_id").not("company_id", "is", null),
    ]);

    const companies = (compRes.data ?? []) as unknown as CRaw[];
    const rawFins = (finRes.data ?? []) as unknown as FinRaw[];
    const brands = (brandRes.data ?? []) as unknown as BRaw[];

    // (company_id, fiscal_year) dedup
    const dedupMap = dedupByYear(rawFins);

    // company_id → 최신 연도 rev (2025 > 2024 > 2023)
    const revMap = new Map<string, { revenue: number | null; year: number }>();
    for (const f of dedupMap.values()) {
      const prev = revMap.get(f.company_id);
      if (!prev || f.fiscal_year > prev.year) {
        revMap.set(f.company_id, { revenue: f.revenue_mkrw, year: f.fiscal_year });
      }
    }

    const brandCount = new Map<string, number>();
    for (const b of brands) {
      if (b.company_id) brandCount.set(b.company_id, (brandCount.get(b.company_id) ?? 0) + 1);
    }

    const rows: InsightCompanyListItem[] = companies.map((c) => {
      const rv = revMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        is_own: c.is_own,
        listing_type: c.listing_type,
        revenue_mkrw: rv?.revenue ?? null,
        fiscal_year_shown: rv?.year ?? null,
        brand_count: brandCount.get(c.id) ?? 0,
        has_financials: rv != null,
      };
    });

    // 자사 최상단, 나머지 매출 desc
    rows.sort((a, b) => {
      if (a.is_own && !b.is_own) return -1;
      if (!a.is_own && b.is_own) return 1;
      return (b.revenue_mkrw ?? -Infinity) - (a.revenue_mkrw ?? -Infinity);
    });

    return rows;
  } catch {
    return [];
  }
}
