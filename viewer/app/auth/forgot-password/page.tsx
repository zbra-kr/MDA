"use client";
// viewer/app/auth/forgot-password/page.tsx
import { useActionState } from "react";
import Link from "next/link";
import { resetPassword } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(resetPassword, null);

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-xl font-semibold text-fg-primary tracking-[-0.018em]">
          Competitor Radar
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">B.CAVE IT팀</p>
      </div>

      <div className="bg-raised border border-border rounded-xl p-6">
        <h2 className="text-base font-medium text-fg-primary mb-1">
          비밀번호 재설정
        </h2>
        <p className="text-sm text-fg-tertiary mb-5">
          가입한 이메일로 재설정 링크를 발송합니다.
        </p>

        {state?.success ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-secondary leading-relaxed">
              {state.success}
            </p>
            <Link
              href="/auth/login"
              className="block w-full h-9 rounded-md border border-border text-sm font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors text-center leading-9"
            >
              로그인으로 돌아가기
            </Link>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-fg-secondary mb-1"
              >
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@bcave.co.kr"
                className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:ring-1 focus:ring-border-strong"
              />
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full h-9 rounded-md bg-fg-primary text-canvas text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {pending ? "발송 중..." : "재설정 링크 발송"}
            </button>
          </form>
        )}
      </div>

      <p className="text-center mt-4 text-sm text-fg-tertiary">
        <Link
          href="/auth/login"
          className="text-fg-secondary hover:text-fg-primary transition-colors"
        >
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
