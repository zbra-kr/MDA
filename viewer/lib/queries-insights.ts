// viewer/lib/queries-insights.ts
// Phase 1.8 — 시각화 데이터 접근 레이어.
// 모든 쿼리는 supabaseServer() (anon read) 를 사용한다.
// service_role 사용 금지.

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
  brands: BrandInsightRow[];
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
    type FRaw = {
      fiscal_year: number;
      revenue_mkrw: number | null; operating_income_mkrw: number | null;
      net_income_mkrw: number | null; total_assets_mkrw: number | null;
      total_liabilities_mkrw: number | null; total_equity_mkrw: number | null;
    };
    type DRaw = {
      id: string; rcept_no: string; report_nm: string;
      rcept_dt: string; disclosure_type: string; dart_url: string;
    };
    type BRaw = {
      id: string; name: string; slug: string;
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

      sb.from("company_financials_history")
        .select("fiscal_year, revenue_mkrw, operating_income_mkrw, net_income_mkrw, total_assets_mkrw, total_liabilities_mkrw, total_equity_mkrw")
        .eq("company_id", companyId)
        .eq("is_consolidated", true)
        .is("fiscal_quarter", null)
        .order("fiscal_year", { ascending: true }),

      sb.from("disclosures")
        .select("id, rcept_no, report_nm, rcept_dt, disclosure_type, dart_url")
        .eq("company_id", companyId)
        .order("rcept_dt", { ascending: false })
        .limit(30),

      sb.from("brands")
        .select("id, name, slug, brand_category, price_tier, target_gender, hq_country, target_age, description, metadata_source")
        .eq("company_id", companyId)
        .order("name"),
    ]);

    if (!compRes.data) return null;
    const c = compRes.data as unknown as CRaw;
    const dc = c.dart_corp_codes;

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
      financials: ((finRes.data ?? []) as unknown as FRaw[]).map((r) => ({
        fiscal_year: r.fiscal_year,
        revenue_mkrw: r.revenue_mkrw,
        operating_income_mkrw: r.operating_income_mkrw,
        net_income_mkrw: r.net_income_mkrw,
        total_assets_mkrw: r.total_assets_mkrw,
        total_liabilities_mkrw: r.total_liabilities_mkrw,
        total_equity_mkrw: r.total_equity_mkrw,
      })),
      disclosures: (discRes.data ?? []) as unknown as DRaw[],
      brands: (brandRes.data ?? []) as unknown as BRaw[],
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
    type FRaw = {
      company_id: string; fiscal_year: number;
      revenue_mkrw: number | null; operating_income_mkrw: number | null;
      net_income_mkrw: number | null; total_assets_mkrw: number | null;
      total_liabilities_mkrw: number | null; total_equity_mkrw: number | null;
    };
    type BRaw = { company_id: string | null; brand_category: string | null };

    const [compRes, finRes, brandRes] = await Promise.all([
      sb.from("companies").select("id, name, is_own, listing_type"),
      sb.from("company_financials_history")
        .select("company_id, fiscal_year, revenue_mkrw, operating_income_mkrw, net_income_mkrw, total_assets_mkrw, total_liabilities_mkrw, total_equity_mkrw")
        .eq("is_consolidated", true)
        .is("fiscal_quarter", null)
        .in("fiscal_year", [2024, 2023]),
      sb.from("brands")
        .select("company_id, brand_category")
        .not("company_id", "is", null),
    ]);

    const companies = (compRes.data ?? []) as unknown as CRaw[];
    const fins = (finRes.data ?? []) as unknown as FRaw[];
    const brands = (brandRes.data ?? []) as unknown as BRaw[];

    // fiscal_year 인덱스
    const finMap = new Map<string, { fy2024: FRaw | null; fy2023: FRaw | null }>();
    for (const f of fins) {
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

    const toFin = (f: FRaw | null): FinancialRow | null =>
      f == null ? null : {
        fiscal_year: f.fiscal_year,
        revenue_mkrw: f.revenue_mkrw,
        operating_income_mkrw: f.operating_income_mkrw,
        net_income_mkrw: f.net_income_mkrw,
        total_assets_mkrw: f.total_assets_mkrw,
        total_liabilities_mkrw: f.total_liabilities_mkrw,
        total_equity_mkrw: f.total_equity_mkrw,
      };

    const rows: CompanyFinSummary[] = companies.map((c) => {
      const fm = finMap.get(c.id) ?? { fy2024: null, fy2023: null };
      const bm = brandMap.get(c.id) ?? { count: 0, cats: new Set() };
      return {
        id: c.id,
        name: c.name,
        is_own: c.is_own,
        listing_type: c.listing_type,
        fy2024: toFin(fm.fy2024),
        fy2023: toFin(fm.fy2023),
        brand_count: bm.count,
        brand_categories: Array.from(bm.cats),
      };
    });

    // 매출 기준 정렬 (비케이브 항상 상단)
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
    type FRaw = { company_id: string; revenue_mkrw: number | null };

    const [brandRes, finRes] = await Promise.all([
      sb.from("brands")
        .select("id, name, slug, brand_category, price_tier, target_gender, hq_country, description, company_id, companies(name)")
        .not("brand_category", "is", null)
        .order("name"),
      sb.from("company_financials_history")
        .select("company_id, revenue_mkrw")
        .eq("is_consolidated", true)
        .is("fiscal_quarter", null)
        .eq("fiscal_year", 2024),
    ]);

    const brands = (brandRes.data ?? []) as unknown as BRaw[];
    const fins = (finRes.data ?? []) as unknown as FRaw[];

    const revMap = new Map<string, number | null>();
    for (const f of fins) revMap.set(f.company_id, f.revenue_mkrw);

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
  brand_count: number;
  has_financials: boolean;
}

export async function getInsightCompanyList(): Promise<InsightCompanyListItem[]> {
  try {
    const sb = await supabaseServer();

    type CRaw = { id: string; name: string; is_own: boolean; listing_type: string };
    type FRaw = { company_id: string; revenue_mkrw: number | null };
    type BRaw = { company_id: string | null };

    const [compRes, finRes, brandRes] = await Promise.all([
      sb.from("companies").select("id, name, is_own, listing_type").order("name"),
      sb.from("company_financials_history")
        .select("company_id, revenue_mkrw")
        .eq("is_consolidated", true)
        .is("fiscal_quarter", null)
        .eq("fiscal_year", 2024),
      sb.from("brands").select("company_id").not("company_id", "is", null),
    ]);

    const companies = (compRes.data ?? []) as unknown as CRaw[];
    const fins = (finRes.data ?? []) as unknown as FRaw[];
    const brands = (brandRes.data ?? []) as unknown as BRaw[];

    const revMap = new Map<string, number | null>();
    for (const f of fins) revMap.set(f.company_id, f.revenue_mkrw);

    const brandCount = new Map<string, number>();
    for (const b of brands) {
      if (b.company_id) brandCount.set(b.company_id, (brandCount.get(b.company_id) ?? 0) + 1);
    }

    const rows: InsightCompanyListItem[] = companies.map((c) => ({
      id: c.id,
      name: c.name,
      is_own: c.is_own,
      listing_type: c.listing_type,
      revenue_mkrw: revMap.get(c.id) ?? null,
      brand_count: brandCount.get(c.id) ?? 0,
      has_financials: revMap.has(c.id),
    }));

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
