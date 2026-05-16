"use client";
// viewer/app/auth/login/page.tsx
import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "../actions";
import { AuthLogo } from "@/components/radar/auth-logo";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null);

  return (
    <div className="w-full max-w-sm">
      <AuthLogo />

      {/* 카드 */}
      <div className="bg-raised border border-border rounded-xl p-6">
        <h2 className="text-base font-medium text-fg-primary mb-5">로그인</h2>

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

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-fg-secondary mb-1"
            >
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
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
            {pending ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/auth/forgot-password"
            className="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
          >
            비밀번호를 잊으셨나요?
          </Link>
        </div>
      </div>

      <p className="text-center mt-4 text-sm text-fg-tertiary">
        계정이 없으신가요?{" "}
        <Link
          href="/auth/signup"
          className="text-fg-secondary hover:text-fg-primary transition-colors"
        >
          가입하기
        </Link>
      </p>
    </div>
  );
}
