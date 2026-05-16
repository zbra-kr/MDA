"use server";
// viewer/app/(app)/insights/manage/actions.ts
// Phase 1.9 — 매핑 관리 Server Actions (service_role 쓰기).
// is_own=true brand 는 모든 변경 금지.
// actor = '정호철' 고정 (Phase 3 Auth 도입 후 user_id 전환).

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ACTOR = "정호철";
const MANAGE_PATH = "/insights/manage";

// ─── 내부 헬퍼 ─────────────────────────────────────────────────────────────

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  is_own: boolean;
  company_id: string | null;
}

async function _fetchBrand(admin: ReturnType<typeof supabaseAdmin>, brandId: string): Promise<BrandRow | null> {
  const { data, error } = await admin
    .from("brands")
    .select("id, slug, name, is_own, company_id")
    .eq("id", brandId)
    .single();
  if (error || !data) return null;
  return data as BrandRow;
}

async function _fetchCompanyName(admin: ReturnType<typeof supabaseAdmin>, companyId: string): Promise<string> {
  const { data } = await admin
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();
  return (data as { name: string } | null)?.name ?? "";
}

// ─── assignBrandToCompany ───────────────────────────────────────────────────

export async function assignBrandToCompany(
  brandId: string,
  newCompanyId: string,
  reasoning: string,
): Promise<{ error?: string }> {
  try {
    const admin = supabaseAdmin();

    const brand = await _fetchBrand(admin, brandId);
    if (!brand) return { error: "브랜드를 찾을 수 없습니다." };
    if (brand.is_own) return { error: "자사 브랜드는 매핑을 변경할 수 없습니다." };

    const oldCompanyId = brand.company_id;
    const action = oldCompanyId ? "reassign" : "add";

    const [oldCompanyName, newCompanyName] = await Promise.all([
      oldCompanyId ? _fetchCompanyName(admin, oldCompanyId) : Promise.resolve(""),
      _fetchCompanyName(admin, newCompanyId),
    ]);

    const { error: updateErr } = await admin
      .from("brands")
      .update({ company_id: newCompanyId, company_mapping_confidence: "high" })
      .eq("id", brandId);
    if (updateErr) return { error: updateErr.message };

    await admin.from("brand_audit_log").insert({
      brand_id: brandId,
      brand_slug: brand.slug,
      brand_name: brand.name,
      action,
      old_company_id: oldCompanyId ?? null,
      old_company_name: oldCompanyName || null,
      new_company_id: newCompanyId,
      new_company_name: newCompanyName,
      actor: ACTOR,
      source: "manual_ui",
      reasoning: reasoning || null,
    });

    revalidatePath(MANAGE_PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "서버 오류가 발생했습니다." };
  }
}

// ─── removeBrandFromCompany ─────────────────────────────────────────────────

export async function removeBrandFromCompany(
  brandId: string,
  reasoning: string,
): Promise<{ error?: string }> {
  try {
    const admin = supabaseAdmin();

    const brand = await _fetchBrand(admin, brandId);
    if (!brand) return { error: "브랜드를 찾을 수 없습니다." };
    if (brand.is_own) return { error: "자사 브랜드는 매핑을 변경할 수 없습니다." };
    if (!brand.company_id) return { error: "이미 회사에 매핑되어 있지 않습니다." };

    const oldCompanyName = await _fetchCompanyName(admin, brand.company_id);

    const { error: updateErr } = await admin
      .from("brands")
      .update({ company_id: null, company_mapping_confidence: "unknown" })
      .eq("id", brandId);
    if (updateErr) return { error: updateErr.message };

    await admin.from("brand_audit_log").insert({
      brand_id: brandId,
      brand_slug: brand.slug,
      brand_name: brand.name,
      action: "remove",
      old_company_id: brand.company_id,
      old_company_name: oldCompanyName || null,
      new_company_id: null,
      new_company_name: null,
      actor: ACTOR,
      source: "manual_ui",
      reasoning: reasoning || null,
    });

    revalidatePath(MANAGE_PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "서버 오류가 발생했습니다." };
  }
}

// ─── searchMusinsaBrand ─────────────────────────────────────────────────────

export interface MusinsaBrandItem {
  slug: string;
  name: string;
  linkUrl: string;
  isExclusive: boolean;
  isFlagship: boolean;
}

export async function searchMusinsaBrand(
  keyword: string,
): Promise<{ items?: MusinsaBrandItem[]; error?: string }> {
  try {
    const url = `https://api.musinsa.com/api2/dp/v1/search/brand?gf=A&keyword=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.musinsa.com/",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { error: `무신사 API 오류: ${res.status}` };
    const json = await res.json();
    const raw: Array<Record<string, unknown>> = json?.data?.items ?? [];
    const items: MusinsaBrandItem[] = raw.map((it) => ({
      slug: String(it.brand ?? ""),
      name: String(it.brandName ?? ""),
      linkUrl: String(it.brandLinkUrl ?? ""),
      isExclusive: Boolean(it.isExclusive),
      isFlagship: Boolean(it.isFlagship),
    }));
    return { items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "검색 중 오류가 발생했습니다." };
  }
}

// ─── addCustomBrand ─────────────────────────────────────────────────────────

export async function addCustomBrand(
  companyId: string,
  brandName: string,
  brandSlug: string,
  reasoning: string,
  musinsaSlug?: string,
): Promise<{ error?: string }> {
  try {
    const admin = supabaseAdmin();

    // slug 중복 확인 — 이미 존재하면 INSERT 대신 company_id 재매핑
    const { data: existing } = await admin
      .from("brands")
      .select("id, slug, name, is_own, company_id")
      .eq("slug", brandSlug)
      .maybeSingle();

    const companyName = await _fetchCompanyName(admin, companyId);

    if (existing) {
      const e = existing as BrandRow;
      if (e.is_own) return { error: "자사 브랜드는 매핑을 변경할 수 없습니다." };
      if (e.company_id === companyId) return { error: "이미 이 회사에 매핑된 브랜드입니다." };

      const oldCompanyId = e.company_id;
      const oldCompanyName = oldCompanyId ? await _fetchCompanyName(admin, oldCompanyId) : "";
      const action = oldCompanyId ? "reassign" : "add";

      const { error: updateErr } = await admin
        .from("brands")
        .update({ company_id: companyId, company_mapping_confidence: musinsaSlug ? "high" : "medium" })
        .eq("id", e.id);
      if (updateErr) return { error: updateErr.message };

      await admin.from("brand_audit_log").insert({
        brand_id: e.id,
        brand_slug: e.slug,
        brand_name: e.name,
        action,
        old_company_id: oldCompanyId ?? null,
        old_company_name: oldCompanyName || null,
        new_company_id: companyId,
        new_company_name: companyName || null,
        actor: ACTOR,
        source: "manual_ui",
        reasoning: reasoning || null,
      });

      revalidatePath(MANAGE_PATH);
      return {};
    }

    const { data: inserted, error: insertErr } = await admin
      .from("brands")
      .insert({
        slug: brandSlug,
        name: brandName,
        musinsa_brand_id: musinsaSlug ?? null,
        company_id: companyId,
        is_competitor: true,
        is_own: false,
        company_mapping_confidence: musinsaSlug ? "high" : "low",
      })
      .select("id, slug, name")
      .single();
    if (insertErr) return { error: insertErr.message };

    await admin.from("brand_audit_log").insert({
      brand_id: (inserted as { id: string }).id,
      brand_slug: brandSlug,
      brand_name: brandName,
      action: "add",
      old_company_id: null,
      old_company_name: null,
      new_company_id: companyId,
      new_company_name: companyName || null,
      actor: ACTOR,
      source: "manual_ui",
      reasoning: reasoning || null,
    });

    revalidatePath(MANAGE_PATH);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "서버 오류가 발생했습니다." };
  }
}
