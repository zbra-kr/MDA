// viewer/app/auth/callback/route.ts
// Supabase Auth 콜백 — 세션 쿠키를 response 객체에 직접 설정해야 리다이렉트 후 유지됨.
// token_hash(OTP) 방식과 code(PKCE) 방식 모두 처리.
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // 성공 리다이렉트 응답 미리 생성 → setAll이 이 객체에 쿠키를 직접 써야 세션이 유지됨
  const verified = NextResponse.redirect(`${origin}/auth/verified`);
  const dest = NextResponse.redirect(`${origin}${next === "/" ? "/auth/verified" : next}`);

  const makeClient = (response: NextResponse) =>
    createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (
            cookiesToSet: { name: string; value: string; options: CookieOptions }[],
          ) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

  // ── OTP / token_hash 방식 (Supabase 기본 이메일 인증) ────────────────────
  if (token_hash && type) {
    const supabase = makeClient(verified);
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) return verified;
  }

  // ── PKCE / code 방식 ──────────────────────────────────────────────────────
  if (code) {
    const supabase = makeClient(dest);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return dest;
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
}
