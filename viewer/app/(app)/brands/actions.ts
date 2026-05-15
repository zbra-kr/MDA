"use server";
// viewer/app/(app)/brands/actions.ts
// service_role 쓰기 전용 Server Actions.
// 클라이언트 코드에서는 import 불가 — 'use server' 경계 내에서만 실행.

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function toggleCompetitor(
  brandId: string,
  currentValue: boolean,
): Promise<{ error?: string }> {
  try {
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
