"use client";
// viewer/app/(app)/settings/_components/password-form.tsx
import { useActionState } from "react";
import { changePassword } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-fg-secondary mb-1"
        >
          새 비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="최소 8자"
          className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:ring-1 focus:ring-border-strong"
        />
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-fg-secondary mb-1"
        >
          비밀번호 확인
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:ring-1 focus:ring-border-strong"
        />
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-600">{state.success}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-9 px-4 rounded-md bg-fg-primary text-canvas text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? "변경 중..." : "비밀번호 변경"}
      </button>
    </form>
  );
}
