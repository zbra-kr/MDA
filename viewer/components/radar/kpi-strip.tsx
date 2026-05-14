// viewer/components/radar/kpi-strip.tsx
// 가로 KPI 스트립. dashboard(4칸) / anomaly(6칸) 공용.
import { cn } from "@/lib/utils";

export interface KpiBreakdownPip {
  label: string;
  value: number | string;
  color: string; // CSS var, e.g. "var(--sev-high-solid)"
}

export interface KpiItem {
  label: string;
  /** 메인 값. ReactNode 허용 — 색상 분할 표기 등 */
  value: React.ReactNode;
  unit?: string;
  /** 보조 라인 (delta 등) */
  sub?: React.ReactNode;
  /** 하단 분포 pip들 */
  breakdown?: KpiBreakdownPip[];
  /** 값 강조 색상 */
  valueClassName?: string;
}

interface Props {
  items: KpiItem[];
  /** grid 칸 수 — 기본 items.length */
  cols?: number;
}

export function KpiStrip({ items, cols }: Props) {
  const n = cols ?? items.length;
  return (
    <section
      className="grid gap-px bg-border-hair border border-border-subtle rounded-md overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {items.map((kpi, i) => (
        <div key={i} className="bg-surface px-5 py-4 flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-fg-tertiary">
            {kpi.label}
          </div>
          <div
            className={cn(
              "text-3xl font-semibold text-fg-primary leading-none num",
              kpi.valueClassName,
            )}
          >
            {kpi.value}
            {kpi.unit && (
              <span className="text-lg text-fg-quaternary ml-1">{kpi.unit}</span>
            )}
          </div>
          {kpi.sub && (
            <div className="text-xs text-fg-tertiary num">{kpi.sub}</div>
          )}
          {kpi.breakdown && (
            <div className="flex items-center gap-3 mt-0.5">
              {kpi.breakdown.map((b, j) => (
                <span
                  key={j}
                  className="inline-flex items-center gap-1.5 text-xs text-fg-secondary"
                >
                  <span
                    className="w-1 h-1 rounded-full"
                    style={{ background: b.color }}
                  />
                  <span className="num text-fg-primary">{b.value}</span>
                  <span className="text-fg-quaternary">{b.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
