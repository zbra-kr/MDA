// viewer/components/radar/stacked-severity-chart.tsx
// 30일 severity 스택 바 차트. 오늘 막대는 풀 불투명, 이전은 0.85.
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SeverityDaily } from "@/lib/supabase/types";
import { fmtDate } from "@/lib/format";

interface Props {
  data: SeverityDaily[];
}

export function StackedSeverityChart({ data }: Props) {
  const todayIdx = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
        <CartesianGrid stroke="var(--chart-grid)" horizontal vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => fmtDate(d).slice(5)}
          stroke="var(--chart-axis)"
          tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-axis)" }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          stroke="var(--chart-axis)"
          tick={{ fill: "var(--chart-tick)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "var(--bg-hover)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-sans)",
            fontSize: 12,
          }}
          labelFormatter={(d) => fmtDate(d as string)}
        />
        <Bar dataKey="low" stackId="s" fill="var(--sev-low-solid)" name="Low">
          {data.map((_, i) => (
            <Cell key={i} fillOpacity={i === todayIdx ? 1 : 0.85} />
          ))}
        </Bar>
        <Bar dataKey="med" stackId="s" fill="var(--sev-med-solid)" name="Medium">
          {data.map((_, i) => (
            <Cell key={i} fillOpacity={i === todayIdx ? 1 : 0.85} />
          ))}
        </Bar>
        <Bar
          dataKey="high"
          stackId="s"
          fill="var(--sev-high-solid)"
          name="High"
          radius={[2, 2, 0, 0]}
        >
          {data.map((_, i) => (
            <Cell key={i} fillOpacity={i === todayIdx ? 1 : 0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
