"use client";
// viewer/app/(app)/insights/categories/categories-client.tsx
// 카테고리 트렌드 인터랙티브 UI

import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Legend,
} from "recharts";
import type { BrandWithCompany } from "@/lib/queries-insights";
import { fmtRevenueMkrw } from "@/lib/format";

const CATEGORY_LIST = [
  "스트릿", "캐주얼", "럭셔리", "아웃도어", "스포츠", "골프",
  "언더웨어", "아동", "액세서리", "슈즈", "백·가방", "기타",
] as const;

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
];

const TICK_STYLE = { fill: "var(--chart-tick)", fontSize: 11, fontFamily: "var(--font-mono)" };
const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 5,
  color: "var(--fg-primary)",
  fontSize: 12,
};

const PRICE_TIER_BADGE: Record<string, string> = {
  저가: "bg-sunken text-fg-quaternary",
  중가: "bg-sunken text-fg-tertiary",
  프리미엄: "bg-sev-med-bg text-sev-med-fg border-sev-med-border",
  럭셔리: "bg-sev-high-bg text-sev-high-fg border-sev-high-border",
};

interface Props {
  brands: BrandWithCompany[];
}

export function CategoriesClient({ brands }: Props) {
  // 카테고리별 brand 수
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of brands) {
      if (b.brand_category) m.set(b.brand_category, (m.get(b.brand_category) ?? 0) + 1);
    }
    return m;
  }, [brands]);

  const [activeCategory, setActiveCategory] = useState<string>(
    CATEGORY_LIST.find((c) => (catCounts.get(c) ?? 0) > 0) ?? "스트릿"
  );

  const filteredBrands = brands.filter((b) => b.brand_category === activeCategory);

  // 카테고리 내 회사별 brand 수 (도넛용)
  const companyDist = useMemo(() => {
    const m = new Map<string, { name: string; count: number; revenue: number | null }>();
    for (const b of filteredBrands) {
      const key = b.company_id ?? "__none__";
      const name = b.company_name ?? "미분류";
      if (!m.has(key)) m.set(key, { name, count: 0, revenue: b.company_revenue_mkrw });
      m.get(key)!.count++;
    }
    return Array.from(m.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredBrands]);

  // 카테고리 전체 분포 (막대용)
  const allCatData = CATEGORY_LIST
    .map((c) => ({ name: c, brand수: catCounts.get(c) ?? 0 }))
    .filter((d) => d.brand수 > 0);

  // 카테고리 내 회사 매출 막대
  const revenueData = companyDist
    .filter((d) => d.revenue != null)
    .map((d) => ({ name: d.name, 매출: d.revenue! }));

  return (
    <div>
      {/* 카테고리 필터 */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-3">
          카테고리 선택
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_LIST.map((cat) => {
            const count = catCounts.get(cat) ?? 0;
            if (count === 0) return null;
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "text-xs font-medium px-3 py-1.5 rounded-sm border transition-colors",
                  active
                    ? "bg-selected border-border-strong text-fg-primary"
                    : "bg-sunken border-border-hair text-fg-tertiary hover:text-fg-primary",
                ].join(" ")}
              >
                {cat}
                <span className="ml-1.5 font-mono opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2열 레이아웃 — 도넛 + 카테고리 분포 막대 */}
      <div className="grid grid-cols-[auto_1fr] gap-6 mb-8">
        {/* 도넛차트 — 카테고리 내 회사별 */}
        <div className="bg-surface border border-border-subtle rounded-md p-6 min-w-[280px]">
          <h3 className="text-md font-semibold text-fg-primary mb-4">{activeCategory} — 회사 분포</h3>
          {companyDist.length === 0 ? (
            <p className="text-sm text-fg-quaternary">회사 매핑 없음</p>
          ) : (
            <PieChart width={230} height={200}>
              <Pie
                data={companyDist}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {companyDist.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v}개 brand`]}
              />
            </PieChart>
          )}
          <ul className="mt-3 space-y-1.5">
            {companyDist.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-xs text-fg-secondary truncate">{d.name}</span>
                </div>
                <span className="text-xs font-mono text-fg-quaternary">{d.count}개</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 전체 카테고리 분포 막대 */}
        <div className="bg-surface border border-border-subtle rounded-md p-6">
          <h3 className="text-md font-semibold text-fg-primary mb-4">전체 카테고리 brand 분포</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={allCatData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }} layout="vertical">
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} width={64} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}개 brand`]} />
              <Bar dataKey="brand수" fill="var(--chart-1)" radius={[0, 2, 2, 0]}
                label={{ position: "right", fill: "var(--chart-tick)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 카테고리 내 회사 매출 */}
      {revenueData.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-md p-6 mb-6">
          <h3 className="text-md font-semibold text-fg-primary mb-4">
            {activeCategory} 카테고리 — 회사별 FY2024 매출
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}조`;
                if (v >= 10_000) return `${Math.round(v / 10_000)}억`;
                return String(v);
              }} tick={TICK_STYLE} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [fmtRevenueMkrw(v), "매출"]}
              />
              <Bar dataKey="매출" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Brand 목록 */}
      <div className="bg-surface border border-border-subtle rounded-md">
        <div className="px-6 py-4 border-b border-border-hair flex items-center gap-2.5">
          <h3 className="text-md font-semibold text-fg-primary">{activeCategory} Brand 목록</h3>
          <span className="text-xs font-mono text-fg-quaternary">{filteredBrands.length}개</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-2">
          {filteredBrands.map((b) => (
            <div key={b.id} className="px-4 py-3 rounded-sm bg-raised border border-border-hair">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg-primary truncate">{b.name}</p>
                  {b.company_name && (
                    <p className="text-xs text-fg-tertiary truncate mt-0.5">{b.company_name}</p>
                  )}
                  {b.description && (
                    <p className="text-xs text-fg-quaternary mt-1 line-clamp-1">{b.description}</p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {b.price_tier && (
                    <span className={`text-2xs font-mono px-1 rounded-sm border ${PRICE_TIER_BADGE[b.price_tier] ?? "bg-sunken text-fg-quaternary border-border-hair"}`}>
                      {b.price_tier}
                    </span>
                  )}
                  {b.hq_country && b.hq_country !== "한국" && (
                    <span className="text-2xs font-mono text-fg-quaternary">{b.hq_country}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
