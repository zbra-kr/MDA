// viewer/components/radar/activity-timeline.tsx
// anomaly 상세 사이드바 — 30일 활동 타임라인.
import type { TimelineEvent } from "@/lib/mock-data";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  events: TimelineEvent[];
}

export function ActivityTimeline({ events }: Props) {
  return (
    <ul className="relative">
      {/* 세로 라인 */}
      <span className="absolute left-[5px] top-2 bottom-2 w-px bg-border-hair" />
      {events.map((e, i) => (
        <li key={i} className="relative pl-6 pb-5 last:pb-0">
          <span
            className={cn(
              "absolute left-0 top-1 w-[11px] h-[11px] rounded-full border-2 border-canvas",
              e.marker === "now" && "bg-house-soft",
              e.marker === "high" && "bg-sev-high-solid",
              !e.marker && "bg-fg-quaternary",
            )}
          />
          <div className="text-2xs font-mono text-fg-quaternary mb-0.5">
            {fmtDate(e.ts)}
          </div>
          <div className="text-base font-medium text-fg-primary leading-tight">
            {e.title}
          </div>
          <div className="text-sm text-fg-tertiary mt-0.5">{e.desc}</div>
        </li>
      ))}
    </ul>
  );
}
