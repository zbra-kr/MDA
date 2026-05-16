// viewer/app/auth/callback/route.ts
// Supabase Auth 콜백 — 이메일 확인·비밀번호 재설정 링크 처리.
// token_hash(OTP) 방식과 code(PKCE) 방식 모두 처리.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        },
      },
    },
  );

  // ── OTP / token_hash 방식 (Supabase 기본 이메일 인증) ────────────────────
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}/auth/verified`);
    }
  }

  // ── PKCE / code 방식 ──────────────────────────────────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const dest = next === "/" ? "/auth/verified" : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
}
