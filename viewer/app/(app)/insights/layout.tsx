// viewer/app/(app)/insights/layout.tsx
// /insights/* 서브 네비게이션
import Link from "next/link";

const SUB_TABS = [
  { href: "/insights/compare", label: "자사 vs 경쟁" },
  { href: "/insights/categories", label: "카테고리 트렌드" },
  { href: "/insights/status", label: "매핑 상태" },
  { href: "/insights/manage", label: "매핑 관리" },
] as const;

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* 서브 네비 */}
      <div className="border-b border-border-hair bg-canvas/80">
        <div className="max-w-[1280px] mx-auto px-10 h-9 flex items-center gap-0">
          {SUB_TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="h-9 px-4 inline-flex items-center text-sm text-fg-tertiary hover:text-fg-primary transition-colors"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
