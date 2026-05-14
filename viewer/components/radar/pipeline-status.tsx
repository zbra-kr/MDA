// viewer/components/radar/pipeline-status.tsx
// 사이드바 파이프라인 단계 상태.
import type { PipelineStage } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  scrape: "수집",
  ingest: "적재",
  detect: "탐지",
  match: "매칭",
  analyze: "AI 분석",
  publish: "발송",
};

const STATUS_COLOR: Record<PipelineStage["status"], string> = {
  ok: "var(--trend-up)",
  running: "var(--house-soft)",
  pending: "var(--fg-quaternary)",
  error: "var(--sev-high-solid)",
};

function fmtDuration(iso: string | null): string {
  if (!iso) return "—";
  // "01:28:00" 형태 가정
  const [h, m] = iso.split(":").map(Number);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  stages: PipelineStage[];
}

export function PipelineStatus({ stages }: Props) {
  return (
    <div className="bg-surface border border-border-subtle rounded-md">
      <div className="px-5 py-3 border-b border-border-hair flex items-center justify-between">
        <h3 className="text-md font-semibold text-fg-primary">파이프라인</h3>
        <span className="text-2xs font-mono uppercase tracking-wide text-fg-tertiary">
          오늘 03:00 KST
        </span>
      </div>
      <ul className="p-2">
        {stages.map((s) => (
          <li
            key={s.stage_order}
            className="flex items-center gap-3 px-3 h-9 rounded-sm hover:bg-hover"
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                s.status === "running" && "animate-pulse",
              )}
              style={{ background: STATUS_COLOR[s.status] }}
            />
            <span className="text-base text-fg-secondary flex-1">
              {STAGE_LABEL[s.stage_name] ?? s.stage_name}
            </span>
            <span className="text-xs font-mono text-fg-tertiary num">
              {fmtDuration(s.duration)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
