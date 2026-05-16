// viewer/app/auth/callback/route.ts
// Supabase Auth 콜백 — 이메일 확인·비밀번호 재설정 링크 처리.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 이메일 인증 완료 → verified 페이지로 (next가 /이면 verified, 아니면 next 경로로)
      const dest = next === "/" ? "/auth/verified" : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
}
