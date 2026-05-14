// viewer/components/radar/evidence-table.tsx
// anomaly 상세 — 탐지 근거 신호 테이블. evidence JSONB를 행으로 펼침.
import { cn } from "@/lib/utils";

export interface EvidenceSignal {
  name: string;
  baseline: string | number;
  current: string | number;
  delta: string;
  /** 0~1 — 기여도 바 길이 */
  contribution: number;
  trend?: "up" | "down" | "flat";
}

interface Props {
  signals: EvidenceSignal[];
}

export function EvidenceTable({ signals }: Props) {
  return (
    <table className="w-full border-collapse text-base">
      <thead>
        <tr className="border-b border-border-subtle text-left">
          <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary w-[28%]">
            신호
          </th>
          <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary text-right w-[16%]">
            14일 기준
          </th>
          <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary text-right w-[16%]">
            현재
          </th>
          <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary text-right w-[14%]">
            Δ
          </th>
          <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary w-[26%]">
            기여도
          </th>
        </tr>
      </thead>
      <tbody>
        {signals.map((s, i) => (
          <tr key={i} className="h-9 border-b border-border-hair">
            <td className="px-2 text-fg-secondary">{s.name}</td>
            <td className="px-2 text-right num text-fg-tertiary">
              {s.baseline}
            </td>
            <td className="px-2 text-right num text-fg-primary">{s.current}</td>
            <td
              className={cn(
                "px-2 text-right num",
                s.trend === "up" && "text-trend-up",
                s.trend === "down" && "text-trend-down",
                (!s.trend || s.trend === "flat") && "text-fg-quaternary",
              )}
            >
              {s.delta}
            </td>
            <td className="px-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-sunken overflow-hidden">
                  <div
                    className="h-full rounded-full bg-fg-tertiary"
                    style={{ width: `${Math.round(s.contribution * 100)}%` }}
                  />
                </div>
                <span className="text-2xs font-mono text-fg-quaternary num w-8 text-right">
                  {Math.round(s.contribution * 100)}%
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
