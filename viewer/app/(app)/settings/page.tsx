// viewer/app/(app)/settings/page.tsx
// 사용자 설정 — 프로필 수정 (이름·팀) + 비밀번호 변경.
import { requireAuth } from "@/lib/auth";
import { ProfileForm } from "./_components/profile-form";
import { PasswordForm } from "./_components/password-form";

export default async function SettingsPage() {
  const { user, profile } = await requireAuth();

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <h1 className="text-xl font-semibold text-fg-primary mb-8">설정</h1>

      <div className="max-w-lg space-y-8">
        {/* 프로필 */}
        <section className="bg-raised border border-border rounded-xl p-6">
          <h2 className="text-base font-medium text-fg-primary mb-5">프로필</h2>
          <div className="mb-4 text-sm text-fg-tertiary">
            <span className="font-mono text-fg-secondary">{user.email}</span>
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-sunken border border-border-hair font-mono uppercase">
              {profile?.role ?? "viewer"}
            </span>
          </div>
          <ProfileForm
            userId={user.id}
            initialFullName={profile?.full_name ?? ""}
            initialTeam={profile?.team ?? ""}
          />
        </section>

        {/* 비밀번호 변경 */}
        <section className="bg-raised border border-border rounded-xl p-6">
          <h2 className="text-base font-medium text-fg-primary mb-5">
            비밀번호 변경
          </h2>
          <PasswordForm />
        </section>
      </div>
    </main>
  );
}
