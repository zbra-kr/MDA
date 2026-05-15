// viewer/components/radar/brands-controls.tsx
// 브랜드 필터·정렬 컨트롤 — 클라이언트 컴포넌트
"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BrandStats } from "@/lib/queries";

type Filter = "all" | "competitor" | "own" | "unreviewed" | "today_active";
type Sort   = "today_products" | "name" | "created";

interface Props {
  currentFilter: Filter;
  currentSort: Sort;
  stats: BrandStats;
}

const FILTER_ITEMS: { key: Filter; label: string; countKey: keyof BrandStats }[] = [
  { key: "all",          label: "전체",    countKey: "total" },
  { key: "competitor",   label: "경쟁사",  countKey: "competitors" },
  { key: "own",          label: "자사",    countKey: "own" },
  { key: "unreviewed",   label: "미검토",  countKey: "unreviewed" },
  { key: "today_active", label: "오늘활동", countKey: "today_active" },
];

export function BrandsControls({ currentFilter, currentSort, stats }: Props) {
  const router = useRouter();

  function navigate(filter: Filter, sort: Sort) {
    const params = new URLSearchParams();
    if (filter !== "all")           params.set("filter", filter);
    if (sort !== "today_products")  params.set("sort", sort);
    const qs = params.toString();
    router.push(`/brands${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* 필터 칩 */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTER_ITEMS.map((item) => {
          const count = stats[item.countKey];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.key, currentSort)}
              className={cn(
                "h-7 px-3 text-sm rounded-md border transition-colors inline-flex items-center gap-1.5",
                currentFilter === item.key
                  ? "border-fg-primary bg-fg-primary text-fg-inverse"
                  : "border-border text-fg-secondary hover:bg-hover hover:text-fg-primary",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "text-2xs font-mono rounded-sm px-1",
                  currentFilter === item.key
                    ? "bg-white/20 text-fg-inverse"
                    : "bg-sunken text-fg-quaternary",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 bg-border-subtle" />

      {/* 정렬 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-quaternary mr-1.5 font-medium uppercase tracking-wide">
          정렬
        </span>
        {(
          [
            { key: "today_products" as Sort, label: "오늘 활동순" },
            { key: "name"          as Sort, label: "이름순" },
            { key: "created"       as Sort, label: "신규순" },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => navigate(currentFilter, s.key)}
            className={cn(
              "h-7 px-3 text-sm rounded-md border transition-colors",
              currentSort === s.key
                ? "border-fg-primary bg-fg-primary text-fg-inverse"
                : "border-border text-fg-secondary hover:bg-hover hover:text-fg-primary",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
