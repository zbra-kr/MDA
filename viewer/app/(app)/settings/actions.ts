"use server";
// viewer/app/(app)/settings/actions.ts
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";

export async function updateProfile(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const { user } = await requireAuth();
  const fullName = (formData.get("full_name") as string).trim();
  const team = (formData.get("team") as string).trim();

  const sb = await supabaseServer();
  const { error } = await sb
    .from("profiles")
    .update({ full_name: fullName, team: team || null })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: "프로필이 저장되었습니다." };
}

export async function changePassword(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  await requireAuth();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (password !== confirm) return { error: "비밀번호가 일치하지 않습니다." };
  if (password.length < 8) return { error: "비밀번호는 최소 8자 이상이어야 합니다." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { success: "비밀번호가 변경되었습니다." };
}
