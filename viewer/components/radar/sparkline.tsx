// viewer/components/radar/sparkline.tsx
// Inline 56×16 sparkline. Hand-rolled SVG — Recharts is overkill for table cells.

import { cn } from "@/lib/utils";

interface Props {
  data: number[];
  /** Determines stroke color. */
  trend?: "up" | "down" | "flat";
  width?: number;
  height?: number;
  className?: string;
}

const TREND_COLOR: Record<NonNullable<Props["trend"]>, string> = {
  up:   "var(--trend-up)",
  down: "var(--trend-down)",
  flat: "var(--fg-tertiary)",
};

export function Sparkline({
  data,
  trend = "flat",
  width = 56,
  height = 16,
  className,
}: Props) {
  if (data.length < 2) {
    return <span className={cn("inline-block", className)} style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = 1 + (i / (data.length - 1)) * (width - 2);
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const d = "M" + pts.join(" L");

  return (
    <span
      className={cn("inline-block align-middle", className)}
      style={{ width, height }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full h-full">
        <path
          d={d}
          fill="none"
          stroke={TREND_COLOR[trend]}
          strokeWidth={1.3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
