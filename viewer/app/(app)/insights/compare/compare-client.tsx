"use client";
// viewer/app/(app)/insights/compare/compare-client.tsx
// 회사 비교 인터랙티브 UI — 회사 선택 + 차트

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { CompanyFinSummary } from "@/lib/queries-insights";
import { fmtRevenueMkrw } from "@/lib/format";

const TICK_STYLE = { fill: "var(--chart-tick)", fontSize: 11, fontFamily: "var(--font-mono)" };
const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 5,
  color: "var(--fg-primary)",
  fontSize: 12,
};

function fmtY(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}조`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 10_000)}억`;
  return String(v);
}

interface Props {
  companies: CompanyFinSummary[];
}

const MAX_COMPARE = 12;

export function CompareClient({ companies }: Props) {
  // 기본 선택: 비케이브 + 매출 상위 9개 (= 최대 10개)
  const defaultSelected = useMemo(() => {
    const ids = new Set<string>();
    for (const c of companies) {
      if (ids.size >= MAX_COMPARE) break;
      if (c.fy2024?.revenue_mkrw != null || c.is_own) ids.add(c.id);
    }
    return ids;
  }, [companies]);

  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 2) return prev; // 최소 2개
        next.delete(id);
      } else {
        if (next.size >= MAX_COMPARE) return prev;
        next.add(id);
      }
      return next;
    });
  }

  const filtered = companies.filter((c) => selected.has(c.id));

  const revenueData = filtered.map((c) => ({
    name: c.name,
    매출: c.fy2024?.revenue_mkrw ?? 0,
    own: c.is_own,
  }));

  const bsData = filtered.map((c) => ({
    name: c.name,
    총자산: c.fy2024?.total_assets_mkrw ?? 0,
    총부채: c.fy2024?.total_liabilities_mkrw ?? 0,
    자본: c.fy2024?.total_equity_mkrw ?? 0,
    own: c.is_own,
  }));

  const opData = filtered.map((c) => ({
    name: c.name,
    영업이익: c.fy2024?.operating_income_mkrw ?? 0,
    순이익: c.fy2024?.net_income_mkrw ?? 0,
    own: c.is_own,
  }));

  const brandData = filtered
    .filter((c) => c.brand_count > 0)
    .map((c) => ({ name: c.name, brand수: c.brand_count }));

  return (
    <div>
      {/* 회사 선택 chips */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-3">
          비교 대상 선택 (최대 {MAX_COMPARE}개 · 현재 {selected.size}개)
        </p>
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={[
                  "text-xs font-medium px-2.5 py-1 rounded-sm border transition-colors",
                  c.is_own
                    ? on
                      ? "bg-house/30 border-house text-house-soft"
                      : "bg-house/10 border-house/30 text-house-soft/60"
                    : on
                      ? "bg-selected border-border-strong text-fg-primary"
                      : "bg-sunken border-border-hair text-fg-quaternary",
                ].join(" ")}
              >
                {c.name}
                {c.fy2024?.revenue_mkrw != null && (
                  <span className="ml-1.5 font-mono opacity-60">
                    {fmtRevenueMkrw(c.fy2024.revenue_mkrw)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 차트 3종 */}
      <div className="space-y-8">
        {/* 매출 비교 */}
        <ChartCard title="FY2024 매출 비교 (백만원)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenueData} margin={{ top: 4, right: 16, bottom: 60, left: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtY} tick={TICK_STYLE} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v?.toLocaleString("ko-KR") ?? "—"} 백만원`, "매출"]}
              />
              <Bar dataKey="매출" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 영업이익·순이익 */}
        <ChartCard title="FY2024 영업이익 · 순이익 (백만원)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={opData} margin={{ top: 4, right: 16, bottom: 60, left: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtY} tick={TICK_STYLE} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v?.toLocaleString("ko-KR") ?? "—"} 백만원`]}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--fg-tertiary)" }} />
              <Bar dataKey="영업이익" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="순이익" fill="var(--chart-4)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 자산·부채·자본 */}
        <ChartCard title="FY2024 자산 · 부채 · 자본 (백만원)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bsData} margin={{ top: 4, right: 16, bottom: 60, left: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtY} tick={TICK_STYLE} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v?.toLocaleString("ko-KR") ?? "—"} 백만원`]}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--fg-tertiary)" }} />
              <Bar dataKey="총자산" fill="var(--chart-5)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="총부채" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="자본" fill="var(--chart-4)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Brand 수 (data 있는 경우만) */}
        {brandData.length > 0 && (
          <ChartCard title="Brand 수 (무신사 매핑 기준)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={brandData} margin={{ top: 4, right: 16, bottom: 60, left: 8 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}개`, "Brand"]} />
                <Bar dataKey="brand수" fill="var(--chart-3)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-md">
      <div className="px-6 py-4 border-b border-border-hair">
        <h3 className="text-md font-semibold text-fg-primary tracking-[-0.01em]">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
