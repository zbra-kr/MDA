// viewer/middleware.ts
// 인증 가드 — 세션 갱신 + 미인증 접근 차단 + admin 경로 role 검증.
// @supabase/ssr 0.5+ 패턴 (createServerClient + middleware).
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

// 로그인 없이 접근 가능한 경로 (완전 일치)
const PUBLIC_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/verified",
]);
// 로그인 없이 접근 가능한 경로 (prefix 매칭)
const PUBLIC_PREFIXES = ["/auth/callback", "/auth/reset-password"];

// 이미 로그인된 경우 / 로 보내는 auth 경로
const AUTH_ONLY_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
]);

// admin role 이 없으면 / 로 보내는 경로 (prefix 매칭)
const ADMIN_PREFIXES = ["/admin"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() — 세션 검증 + 쿠키 갱신
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── 1. 공개 prefix 경로: 세션 갱신만, 차단 없음 ──────────────────────────
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return response;
  }

  // ── 2. 공개 완전일치 경로 ───────────────────────────────────────────────
  if (PUBLIC_PATHS.has(pathname)) {
    // 이미 로그인됐으면 앱으로
    if (user && AUTH_ONLY_PATHS.has(pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // ── 3. 이하 모든 경로: 로그인 필수 ──────────────────────────────────────
  if (!user) {
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // ── 4. admin 경로: admin role 확인 ───────────────────────────────────────
  if (ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·_next 제외, 나머지 모든 경로에 적용
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
