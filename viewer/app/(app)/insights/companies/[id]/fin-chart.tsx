"use client";
// viewer/app/(app)/insights/companies/[id]/fin-chart.tsx
// 재무 시계열 라인차트 + 자산/부채/자본 영역차트 (recharts).

import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import type { FinancialRow } from "@/lib/queries-insights";

function fmtY(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}조`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 10_000)}억`;
  return `${v}`;
}

const TICK_STYLE = { fill: "var(--chart-tick)", fontSize: 11, fontFamily: "var(--font-mono)" };
const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 5,
  color: "var(--fg-primary)",
  fontSize: 12,
};

interface Props {
  financials: FinancialRow[];
}

export function FinChart({ financials }: Props) {
  if (financials.length === 0) {
    return (
      <p className="text-sm text-fg-quaternary py-10 text-center">재무 데이터 없음</p>
    );
  }

  const plData = financials.map((r) => ({
    year: String(r.fiscal_year),
    "매출": r.revenue_mkrw,
    "영업이익": r.operating_income_mkrw,
    "순이익": r.net_income_mkrw,
  }));

  const bsData = financials.map((r) => ({
    year: String(r.fiscal_year),
    "총자산": r.total_assets_mkrw,
    "총부채": r.total_liabilities_mkrw,
    "자본": r.total_equity_mkrw,
  }));

  return (
    <div className="space-y-8">
      {/* 손익 라인차트 */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-4">
          손익계산서 (백만원)
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={plData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtY} tick={TICK_STYLE} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v?.toLocaleString("ko-KR") ?? "—"} 백만원`]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "var(--fg-tertiary)" }}
            />
            <Line type="monotone" dataKey="매출" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="영업이익" stroke="var(--chart-2)" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="순이익" stroke="var(--chart-4)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 자산·부채·자본 영역차트 */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-4">
          재무상태표 (백만원)
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={bsData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtY} tick={TICK_STYLE} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v?.toLocaleString("ko-KR") ?? "—"} 백만원`]}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "var(--fg-tertiary)" }}
            />
            <Area type="monotone" dataKey="총자산" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.08} strokeWidth={2} connectNulls />
            <Area type="monotone" dataKey="총부채" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.08} strokeWidth={2} connectNulls />
            <Area type="monotone" dataKey="자본" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.10} strokeWidth={2} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
