"use server";
// viewer/app/auth/actions.ts
// 인증 Server Actions — signIn, signUp, signOut, resetPassword, updatePassword.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function signIn(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = (formData.get("full_name") as string).trim();

  if (!email.toLowerCase().endsWith("@bcave.co.kr")) {
    return { error: "@bcave.co.kr 도메인만 가입할 수 있습니다." };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 최소 8자 이상이어야 합니다." };
  }

  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    if (
      error.message.includes("Unauthorized domain") ||
      error.message.includes("P0001")
    ) {
      return { error: "@bcave.co.kr 도메인만 가입할 수 있습니다." };
    }
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "이미 가입된 이메일입니다. 로그인해 주세요." };
    }
    return { error: error.message };
  }

  return {
    success:
      "가입이 완료되었습니다. 이메일 확인 후 로그인해 주세요. (이메일 확인이 비활성화된 경우 바로 로그인 가능)",
  };
}

export async function signOut(): Promise<void> {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/auth/login");
}

export async function resetPassword(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const email = formData.get("email") as string;

  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/auth/update-password`,
  });

  if (error) return { error: error.message };
  return { success: "비밀번호 재설정 링크를 이메일로 발송했습니다." };
}

export async function updatePassword(
  _prev: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (password !== confirm) return { error: "비밀번호가 일치하지 않습니다." };
  if (password.length < 8) return { error: "비밀번호는 최소 8자 이상이어야 합니다." };

  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}
