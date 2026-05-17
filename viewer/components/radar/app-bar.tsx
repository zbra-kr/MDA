// viewer/components/radar/app-bar.tsx
// 2행 sticky 상단바: row1(브랜드·검색·테마·유저) + row2(탭 네비)
"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/radar/user-menu";
import { SearchBar } from "@/components/radar/search-bar";

// ─── 탭 정의 ────────────────────────────────────────────────────────────────

type LinkTab = {
  type: "link";
  href: string;
  label: string;
  key: string;
  matchPrefixes?: string[];
};

type DropdownTab = {
  type: "dropdown";
  label: string;
  key: string;
  matchPrefixes: string[];
  children: { href: string; label: string }[];
};

type TabDef = LinkTab | DropdownTab;

const TABS: TabDef[] = [
  {
    type: "link",
    href: "/",
    label: "대시보드",
    key: "dashboard",
    matchPrefixes: ["/", "/reports"],
  },
  {
    type: "dropdown",
    label: "자사",
    key: "own",
    matchPrefixes: ["/own"],
    children: [
      { href: "/", label: "경쟁현황요약" },
      { href: "/own", label: "자사운영현황" },
    ],
  },
  {
    type: "dropdown",
    label: "이상탐지",
    key: "detect",
    matchPrefixes: ["/anomalies", "/trends"],
    children: [
      { href: "/anomalies", label: "이상 징후" },
      { href: "/trends", label: "트렌드" },
    ],
  },
  {
    type: "link",
    href: "/products/today",
    label: "랭킹",
    key: "products",
    matchPrefixes: ["/products"],
  },
  {
    type: "link",
    href: "/brands",
    label: "브랜드",
    key: "brands",
    matchPrefixes: ["/brands"],
  },
  {
    type: "dropdown",
    label: "회사",
    key: "companies",
    matchPrefixes: ["/companies", "/insights"],
    children: [
      { href: "/companies", label: "회사 목록" },
      { href: "/insights/compare", label: "인사이트" },
    ],
  },
  {
    type: "link",
    href: "/matches",
    label: "매칭",
    key: "matches",
    matchPrefixes: ["/matches"],
  },
  {
    type: "link",
    href: "/settings",
    label: "설정",
    key: "settings",
    matchPrefixes: ["/settings"],
  },
];

const ADMIN_TABS: LinkTab[] = [
  { type: "link", href: "/admin/users", label: "사용자 관리", key: "admin_users" },
  { type: "link", href: "/admin/audit", label: "감사 로그", key: "admin_audit" },
];

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  crumbs?: Crumb[];
  tabCounts?: Partial<Record<string, number>>;
  userEmail?: string | null;
  userFullName?: string | null;
  userRole?: "admin" | "viewer" | null;
}

export function AppBar({
  crumbs = [],
  tabCounts,
  userEmail,
  userFullName,
  userRole,
}: Props) {
  const pathname = usePathname();

  function isTabActive(tab: TabDef): boolean {
    const prefixes = tab.type === "dropdown" ? tab.matchPrefixes : (tab.matchPrefixes ?? [tab.href]);
    return prefixes.some((p) => {
      if (p === "/") return pathname === "/";
      return pathname === p || pathname.startsWith(p + "/");
    });
  }

  function isChildActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const visibleTabs: TabDef[] = [
    ...TABS,
    ...(userRole === "admin" ? ADMIN_TABS : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur border-b border-border-subtle">
      {/* row 1 */}
      <div className="max-w-[1280px] mx-auto px-10 h-[52px] flex items-center gap-5">
        {/* brand — 홈으로 이동 */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
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
        </Link>

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
        <SearchBar />

        <ThemeToggle />

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
      <div className="max-w-[1280px] mx-auto px-10 h-10 flex items-center">
        <nav className="flex items-center">
          {visibleTabs.map((tab) => {
            const active = isTabActive(tab);
            const count = tabCounts?.[tab.key];

            if (tab.type === "link") {
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={cn(
                    "relative h-10 px-3 inline-flex items-center gap-1.5 text-sm font-medium",
                    "transition-colors",
                    active
                      ? "text-fg-primary"
                      : "text-fg-tertiary hover:text-fg-primary",
                  )}
                >
                  {tab.label}
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
            }

            // dropdown tab
            return (
              <div key={tab.key} className="relative group/tab">
                {/* 탭 헤더 */}
                <div
                  className={cn(
                    "relative h-10 px-3 inline-flex items-center gap-1 text-sm font-medium",
                    "select-none cursor-default transition-colors",
                    active
                      ? "text-fg-primary"
                      : "text-fg-tertiary group-hover/tab:text-fg-primary",
                  )}
                >
                  {tab.label}
                  <ChevronDown
                    size={12}
                    className="transition-transform duration-150 group-hover/tab:rotate-180"
                  />
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
                </div>

                {/* 드롭다운 패널 — pt-1은 호버 브릿지 역할 */}
                <div className="absolute top-full left-0 hidden group-hover/tab:block z-50 pt-1">
                  <div className="min-w-[148px] py-1 rounded-md border border-border bg-canvas shadow-md">
                    {tab.children.map((child) => {
                      const childActive = isChildActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block px-3 py-1.5 text-sm transition-colors",
                            childActive
                              ? "text-fg-primary font-medium bg-selected"
                              : "text-fg-secondary hover:text-fg-primary hover:bg-hover",
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
