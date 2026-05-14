// viewer/components/radar/app-bar.tsx
// 2행 sticky 상단바: row1(브랜드·검색·테마·유저) + row2(탭 네비)
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const TABS = [
  { href: "/reports/today", label: "대시보드", key: "dashboard" },
  { href: "/anomalies", label: "이상 징후", key: "anomalies" },
  { href: "/trends", label: "트렌드", key: "trends" },
  { href: "/matches", label: "매칭", key: "matches" },
  { href: "/settings", label: "설정", key: "settings" },
] as const;

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  currentTab?: (typeof TABS)[number]["key"];
  crumbs?: Crumb[];
  tabCounts?: Partial<Record<(typeof TABS)[number]["key"], number>>;
}

export function AppBar({ currentTab = "dashboard", crumbs = [], tabCounts }: Props) {
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

        {/* quick search (정적 — 인터랙션은 Phase 3) */}
        <div className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border text-sm text-fg-tertiary">
          <Search size={13} />
          <span>브랜드 · 상품 검색</span>
          <kbd className="ml-2 text-2xs font-mono px-1 py-px rounded-sm bg-sunken border border-border-hair text-fg-quaternary">
            /
          </kbd>
        </div>

        <ThemeToggle />

        {/* user */}
        <div
          title="정호철 · IT팀장"
          className="w-7 h-7 rounded-full bg-raised border border-border-strong text-2xs font-medium text-fg-secondary inline-flex items-center justify-center shrink-0"
        >
          정
        </div>
      </div>

      {/* row 2 — tabs */}
      <div className="max-w-[1280px] mx-auto px-10 h-10 flex items-center gap-0">
        <nav className="flex items-center gap-0">
          {TABS.map((t) => {
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
