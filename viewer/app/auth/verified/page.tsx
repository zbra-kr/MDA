"use client";
// viewer/app/auth/verified/page.tsx
// 이메일 인증 완료 후 표시. 3초 후 자동으로 앱으로 이동.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthLogo } from "@/components/radar/auth-logo";

export default function VerifiedPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push("/"), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="w-full max-w-sm">
      <AuthLogo />
      <div className="bg-raised border border-border rounded-xl p-8 text-center">
        <p className="text-base font-semibold text-fg-primary mb-2">
          이메일 인증 완료
        </p>
        <p className="text-sm text-fg-secondary mb-8 leading-relaxed">
          B.CAVE Competitor Radar에 오신 것을 환영합니다.
          <br />
          잠시 후 메인 화면으로 이동합니다.
        </p>
        <button
          onClick={() => router.push("/")}
          className="text-sm text-fg-tertiary hover:text-fg-primary underline underline-offset-2 transition-colors"
        >
          바로 이동
        </button>
      </div>
    </div>
  );
}
