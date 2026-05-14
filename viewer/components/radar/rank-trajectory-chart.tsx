// viewer/components/radar/rank-trajectory-chart.tsx
// Single product rank-over-time chart. Inverted Y axis (1 = top) — see
// design system docs for why. Anomaly trigger annotation if provided.

"use client";

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
import { RANK_Y_DOMAIN } from "@/lib/severity";
import { fmtDate } from "@/lib/format";

export interface TrendPoint {
  date: string;        // ISO date
  rank_main: number | null;
}

interface Props {
  data: TrendPoint[];
  /** ISO date of anomaly trigger to mark with vertical rule */
  anomalyAt?: string;
  /** "today" label for the right-most point */
  todayLabel?: string;
}

export function RankTrajectoryChart({ data, anomalyAt, todayLabel }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" horizontal vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => fmtDate(d).slice(5)}
          stroke="var(--chart-axis)"
          tick={{ fill: "var(--chart-tick)", fontFamily: "var(--font-mono)", fontSize: 10 }}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          reversed
          domain={RANK_Y_DOMAIN}
          stroke="var(--chart-axis)"
          tick={{ fill: "var(--chart-tick)", fontFamily: "var(--font-mono)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          cursor={{ stroke: "var(--fg-tertiary)", strokeDasharray: "3 3", opacity: 0.5 }}
          contentStyle={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-sans)",
          }}
          labelFormatter={(d) => fmtDate(d as string)}
          formatter={(v) => [`${v}`, "rank"]}
        />
        <Area
          dataKey="rank_main"
          stroke="none"
          fill="var(--chart-1)"
          fillOpacity={0.10}
        />
        <Line
          type="monotone"
          dataKey="rank_main"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: "var(--bg-canvas)", stroke: "var(--chart-1)", strokeWidth: 1.8 }}
        />
        {anomalyAt && (
          <ReferenceLine
            x={anomalyAt}
            stroke="var(--sev-high-solid)"
            strokeDasharray="3 3"
            strokeOpacity={0.6}
            label={{
              value: "rank_surge",
              position: "insideTopRight",
              fill: "var(--sev-high-fg)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
