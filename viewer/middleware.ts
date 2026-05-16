// viewer/middleware.ts
// 인증 가드 — 세션 갱신 + 미인증 접근 차단 + admin 경로 role 검증.
// @supabase/ssr 0.5+ 패턴 (createServerClient + middleware).
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

// 인증이 없으면 /auth/login 으로 보내는 경로 (prefix 매칭)
const PROTECTED_PREFIXES = ["/insights/manage", "/settings"];
// admin role 이 없으면 / 로 보내는 경로 (prefix 매칭)
const ADMIN_PREFIXES = ["/admin"];
// 이미 로그인된 경우 / 로 보내는 auth 경로
const AUTH_ONLY_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
];

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

  // ── 1. auth 전용 경로: 이미 로그인 → / 로 ──────────────────────────────
  if (AUTH_ONLY_PATHS.includes(pathname) && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // ── 2. admin 경로: 미인증 → login, non-admin → / ─────────────────────────
  const isAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdmin) {
    if (!user) {
      const url = new URL("/auth/login", request.url);
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    // role 확인 (DB 조회 — admin 경로에서만 수행)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ── 3. 일반 보호 경로: 미인증 → login ────────────────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isProtected && !user) {
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·_next 제외, 나머지 모든 경로에 적용
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
