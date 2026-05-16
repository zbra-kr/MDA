// viewer/components/radar/app-bar.tsx
// 2행 sticky 상단바: row1(브랜드·검색·테마·유저) + row2(탭 네비)
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/radar/user-menu";

const TABS = [
  { href: "/reports/today", label: "대시보드", key: "dashboard" },
  { href: "/anomalies", label: "이상 징후", key: "anomalies" },
  { href: "/products/today", label: "상품", key: "products" },
  { href: "/brands", label: "브랜드", key: "brands" },
  { href: "/companies", label: "회사", key: "companies" },
  { href: "/insights/compare", label: "인사이트", key: "insights" },
  { href: "/trends", label: "트렌드", key: "trends" },
  { href: "/matches", label: "매칭", key: "matches" },
  { href: "/settings", label: "설정", key: "settings" },
] as const;

const ADMIN_TABS = [
  { href: "/admin/users", label: "사용자 관리", key: "admin_users" },
  { href: "/admin/audit", label: "감사 로그", key: "admin_audit" },
] as const;

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  currentTab?: string;
  crumbs?: Crumb[];
  tabCounts?: Partial<Record<string, number>>;
  userEmail?: string | null;
  userFullName?: string | null;
  userRole?: "admin" | "viewer" | null;
}

export function AppBar({
  currentTab = "dashboard",
  crumbs = [],
  tabCounts,
  userEmail,
  userFullName,
  userRole,
}: Props) {
  const visibleTabs = [
    ...TABS,
    ...(userRole === "admin" ? ADMIN_TABS : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur border-b border-border-subtle">
      {/* row 1 */}
      <div className="max-w-[1280px] mx-auto px-10 h-[52px] flex items-center gap-5">
        {/* brand */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-[22px] h-[22px] inline-flex items-center justify-center shrink-0">
            <Image
              src="/brand/bcave-icon.png"
              alt="B.CAVE"
              width={22}
              height={22}
              className="object-contain dark:invert"
            />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-md font-semibold text-fg-primary tracking-[-0.018em]">
              Competitor Radar
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-fg-tertiary">
              B.CAVE
            </span>
          </span>
        </div>

        {/* crumbs */}
        {crumbs.length > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-fg-tertiary">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-fg-quaternary">/</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-fg-primary">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-fg-secondary">{c.label}</span>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* quick search */}
        <div className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border text-sm text-fg-tertiary">
          <Search size={13} />
          <span>브랜드 · 상품 검색</span>
          <kbd className="ml-2 text-2xs font-mono px-1 py-px rounded-sm bg-sunken border border-border-hair text-fg-quaternary">
            /
          </kbd>
        </div>

        <ThemeToggle />

        {/* 사용자 메뉴 */}
        {userEmail ? (
          <UserMenu
            email={userEmail}
            fullName={userFullName ?? ""}
            isAdmin={userRole === "admin"}
          />
        ) : (
          <Link
            href="/auth/login"
            className="h-7 px-3 rounded-md border border-border text-xs font-medium text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors inline-flex items-center"
          >
            로그인
          </Link>
        )}
      </div>

      {/* row 2 — tabs */}
      <div className="max-w-[1280px] mx-auto px-10 h-10 flex items-center gap-0">
        <nav className="flex items-center gap-0">
          {visibleTabs.map((t) => {
            const active = t.key === currentTab;
            const count = tabCounts?.[t.key];
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "relative h-10 px-3 inline-flex items-center gap-1.5 text-sm font-medium",
                  "transition-colors",
                  active
                    ? "text-fg-primary"
                    : "text-fg-tertiary hover:text-fg-primary",
                )}
              >
                {t.label}
                {count != null && (
                  <span
                    className={cn(
                      "text-2xs font-mono px-1 rounded-sm",
                      active
                        ? "bg-selected text-fg-secondary"
                        : "bg-sunken text-fg-quaternary",
                    )}
                  >
                    {count}
                  </span>
                )}
                {active && (
                  <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-fg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
