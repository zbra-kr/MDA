// viewer/lib/supabase/admin.ts
// service_role 클라이언트 — 서버 전용. 클라이언트 번들에 절대 포함 안 됨.
// 'use server' 함수나 Server Component에서만 import할 것.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. viewer/.env.local 확인.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
