"use server";
// viewer/app/(app)/admin/users/actions.ts
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

export async function updateUserRole(
  targetUserId: string,
  newRole: "admin" | "viewer",
): Promise<{ error?: string }> {
  // 현재 호출자가 admin 인지 검증 (아니면 redirect)
  await requireAdmin();

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return {};
}
