// viewer/components/radar/section-card.tsx
// 공용 카드 셸 — 헤더(제목·메타·액션) + 본문.
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  count?: number | string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({
  title,
  count,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: Props) {
  return (
    <div
      className={cn(
        "bg-surface border border-border-subtle rounded-md",
        className,
      )}
    >
      {(title || actions) && (
        <div className="px-6 py-4 border-b border-border-hair flex items-center justify-between gap-5">
          <div className="flex items-baseline gap-2.5">
            {title && (
              <h3 className="text-md font-semibold text-fg-primary tracking-[-0.01em]">
                {title}
              </h3>
            )}
            {count != null && (
              <span className="text-xs font-mono text-fg-quaternary">
                {count}
              </span>
            )}
            {meta && (
              <span className="text-xs font-mono text-fg-tertiary">{meta}</span>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-6", bodyClassName)}>{children}</div>
    </div>
  );
}
