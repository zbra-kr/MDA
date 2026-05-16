"use server";
// viewer/app/(app)/brands/actions.ts
// Phase 2.0 — 세션 검증 후 service_role 쓰기 (ADR-023).
// toggleCompetitor: viewer 이상 인증 확인.

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth";

export async function toggleCompetitor(
  brandId: string,
  currentValue: boolean,
): Promise<{ error?: string }> {
  try {
    // viewer 이상이면 가능 — admin 불필요
    await requireAuth();

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("brands")
      .update({ is_competitor: !currentValue })
      .eq("id", brandId);
    if (error) return { error: error.message };
    revalidatePath("/brands");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "서버 오류가 발생했습니다." };
  }
}
