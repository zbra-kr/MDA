"use client";
// viewer/components/radar/user-menu.tsx
// 우상단 프로필 드롭다운 — 이름·설정·로그아웃 (admin: 관리자 메뉴 추가).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Props {
  email: string;
  fullName: string;
  isAdmin: boolean;
}

export function UserMenu({ email, fullName, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSignOut() {
    setOpen(false);
    const sb = supabaseBrowser();
    await sb.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  const initials = fullName ? fullName.charAt(0) : email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`${fullName} · ${email}`}
        className="w-7 h-7 rounded-full bg-raised border border-border-strong text-2xs font-medium text-fg-secondary inline-flex items-center justify-center shrink-0 hover:border-border cursor-pointer"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-canvas border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          {/* 사용자 정보 */}
          <div className="px-3 py-2.5 border-b border-border-subtle">
            <p className="text-sm font-medium text-fg-primary truncate">
              {fullName || "이름 미설정"}
            </p>
            <p className="text-xs text-fg-tertiary truncate mt-0.5">{email}</p>
          </div>

          {/* 공통 메뉴 */}
          <div className="py-0.5">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center px-3 py-1.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-raised transition-colors"
            >
              설정
            </Link>
          </div>

          {/* 관리자 메뉴 */}
          {isAdmin && (
            <div className="border-t border-border-subtle py-0.5">
              <p className="px-3 py-1 text-xs font-medium text-fg-quaternary uppercase tracking-wide">
                관리자
              </p>
              <Link
                href="/admin/users"
                onClick={() => setOpen(false)}
                className="flex items-center px-3 py-1.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-raised transition-colors"
              >
                사용자 관리
              </Link>
              <Link
                href="/admin/audit"
                onClick={() => setOpen(false)}
                className="flex items-center px-3 py-1.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-raised transition-colors"
              >
                감사 로그
              </Link>
            </div>
          )}

          {/* 로그아웃 */}
          <div className="border-t border-border-subtle py-0.5">
            <button
              onClick={handleSignOut}
              className="w-full text-left flex items-center px-3 py-1.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-raised transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
