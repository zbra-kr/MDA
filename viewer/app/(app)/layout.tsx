// viewer/app/(app)/layout.tsx
import { AppBar } from "@/components/radar/app-bar";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    try {
      const { data } = await sb
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      profile = data as Profile | null;
    } catch {
      // profiles 테이블 미존재 시 무시 (마이그레이션 00014 적용 전)
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppBar
        userEmail={user?.email ?? null}
        userFullName={profile?.full_name ?? null}
        userRole={profile?.role ?? null}
      />
      {children}
      <footer className="max-w-[1280px] mx-auto px-10 py-7 mt-26 border-t border-border-subtle flex justify-between text-2xs font-mono uppercase tracking-wide text-fg-quaternary">
        <span>B.CAVE Competitor Radar</span>
        <span>radar.tokens v0.3 · AI 생성 분석 포함</span>
      </footer>
    </div>
  );
}
