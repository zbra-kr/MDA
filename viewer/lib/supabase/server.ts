// viewer/lib/supabase/server.ts
// Server-only client for RSC, Route Handlers, Server Actions.
// @supabase/ssr 0.5+ getAll/setAll 패턴.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            // RSC에서 호출되면 set 불가 — 무시 (미들웨어가 갱신 담당)
          }
        },
      },
    },
  );
}
