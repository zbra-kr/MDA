// viewer/app/(app)/admin/users/page.tsx
// 사용자 목록 + role 변경 (admin 전용).
// middleware 에서 admin 검증 완료 — 이 페이지는 role 표시만.
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RoleToggle } from "./_components/role-toggle";

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: string;
  team: string | null;
  created_at: string;
}

export default async function AdminUsersPage() {
  const { user: me } = await requireAdmin();

  const admin = supabaseAdmin();

  // auth.users 전체 목록
  const { data: authData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  const authUsers = authData?.users ?? [];

  // profiles 전체
  const { data: profilesData } = await admin
    .from("profiles")
    .select("id, full_name, role, team, created_at")
    .order("created_at", { ascending: true });
  const profiles = (profilesData ?? []) as ProfileRow[];

  // 병합
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const users = authUsers.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    lastSignIn: u.last_sign_in_at ?? null,
    profile: profileMap.get(u.id) ?? null,
  }));

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <h1 className="text-xl font-semibold text-fg-primary mb-2">사용자 관리</h1>
      <p className="text-sm text-fg-tertiary mb-8">
        총 {users.length}명 · role 변경은 즉시 적용됩니다.
      </p>

      <div className="bg-raised border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-fg-tertiary text-xs font-medium uppercase tracking-wide">
              <th className="text-left px-4 py-3">이름</th>
              <th className="text-left px-4 py-3">이메일</th>
              <th className="text-left px-4 py-3">팀</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">마지막 로그인</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me.id;
              return (
                <tr
                  key={u.id}
                  className="border-b border-border-hair last:border-0 hover:bg-canvas/50"
                >
                  <td className="px-4 py-3 text-fg-primary font-medium">
                    {u.profile?.full_name || (
                      <span className="text-fg-quaternary">미설정</span>
                    )}
                    {isMe && (
                      <span className="ml-2 text-2xs text-fg-quaternary">(나)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary font-mono text-xs">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {u.profile?.team || (
                      <span className="text-fg-quaternary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.profile?.role === "admin"
                          ? "text-xs font-mono px-1.5 py-0.5 rounded bg-sunken border border-border-hair text-fg-primary"
                          : "text-xs font-mono px-1.5 py-0.5 rounded bg-sunken border border-border-hair text-fg-tertiary"
                      }
                    >
                      {u.profile?.role ?? "viewer"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-tertiary text-xs font-mono">
                    {u.lastSignIn
                      ? new Date(u.lastSignIn).toLocaleDateString("ko-KR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isMe && u.profile && (
                      <RoleToggle
                        userId={u.id}
                        currentRole={u.profile.role as "admin" | "viewer"}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
