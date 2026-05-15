// viewer/components/radar/competitor-toggle.tsx
// is_competitor 토글 스위치. 낙관적 업데이트 + 인라인 피드백.
"use client";

import { useOptimistic, useTransition, useState } from "react";
import { Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleCompetitor } from "@/app/(app)/brands/actions";

interface Props {
  brandId: string;
  brandName: string;
  isCompetitor: boolean;
  disabled?: boolean;
}

type Feedback = { ok: true; msg: string } | { ok: false; msg: string } | null;

export function CompetitorToggle({ brandId, brandName, isCompetitor, disabled = false }: Props) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, addOptimistic] = useOptimistic(
    isCompetitor,
    (_: boolean, next: boolean) => next,
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  function handleClick() {
    if (disabled || isPending) return;
    const nextValue = !optimistic;
    startTransition(async () => {
      addOptimistic(nextValue);
      setFeedback(null);
      const result = await toggleCompetitor(brandId, isCompetitor);
      if (result.error) {
        setFeedback({ ok: false, msg: result.error });
        setTimeout(() => setFeedback(null), 5000);
      } else {
        const msg = nextValue ? `${brandName} 경쟁사 승급` : `${brandName} 경쟁사 해제`;
        setFeedback({ ok: true, msg });
        setTimeout(() => setFeedback(null), 2000);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* 토글 스위치 */}
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={`${brandName} 경쟁사 지정 토글`}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-primary focus-visible:ring-offset-2",
          disabled
            ? "cursor-not-allowed opacity-40 border-border bg-sunken"
            : "cursor-pointer",
          !disabled && optimistic
            ? "border-fg-primary bg-fg-primary"
            : !disabled && "border-border bg-sunken",
          isPending && "opacity-60",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow",
            "translate-y-0 transition-transform duration-150 mt-px",
            optimistic ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </button>

      {/* 인라인 피드백 */}
      {feedback && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs whitespace-nowrap",
            feedback.ok ? "text-trend-up" : "text-trend-down",
          )}
        >
          {feedback.ok ? <Check size={11} /> : <AlertCircle size={11} />}
          {feedback.msg}
        </span>
      )}
    </div>
  );
}
