// viewer/components/radar/ai-insight-card.tsx
// AI 분석 카드. dashboard 2×2 그리드 + anomaly 상세 풀카드 공용.
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { AgentAnalysis } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<string, string> = {
  price_match: "가격 대응",
  promo_match: "프로모션 대응",
  inventory_push: "재고 푸시",
  monitor: "모니터링",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

interface Props {
  analysis: AgentAnalysis;
  /** 헤더에 표시할 상품명·브랜드 */
  productName?: string;
  brandName?: string;
  /** 카드 클릭 시 이동 — 대시보드 그리드에서 사용 */
  href?: string;
  /** 풀 모드: anomaly 상세에서 reasoning 전문 + 4칸 전략 푸터 */
  full?: boolean;
}

export function AiInsightCard({
  analysis,
  productName,
  brandName,
  href,
  full = false,
}: Props) {
  const rec = analysis.strategy_recommendation;
  const isHigh = rec?.priority === "high";

  const inner = (
    <div
      className={cn(
        "bg-surface border rounded-md overflow-hidden h-full flex flex-col",
        isHigh ? "border-sev-high-border" : "border-border-subtle",
      )}
    >
      {/* head */}
      <div className="flex items-start gap-3 p-5 pb-3">
        <div
          className={cn(
            "w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0",
            isHigh
              ? "bg-sev-high-bg text-sev-high-fg"
              : "bg-raised text-fg-tertiary",
          )}
        >
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          {productName && (
            <div className="text-md font-semibold text-fg-primary truncate">
              {productName}
            </div>
          )}
          {brandName && (
            <div className="text-xs text-fg-tertiary">{brandName}</div>
          )}
        </div>
        {rec && (
          <span
            className={cn(
              "shrink-0 text-2xs font-medium uppercase tracking-wide px-2 py-px rounded-sm border",
              rec.priority === "high" &&
                "bg-sev-high-bg text-sev-high-fg border-sev-high-border",
              rec.priority === "medium" &&
                "bg-sev-med-bg text-sev-med-fg border-sev-med-border",
              rec.priority === "low" &&
                "bg-sev-low-bg text-sev-low-fg border-sev-low-border",
            )}
          >
            {PRIORITY_LABEL[rec.priority]}
          </span>
        )}
      </div>

      {/* body */}
      <div className="px-5 pb-4 flex-1">
        {rec ? (
          <p className="text-base text-fg-secondary leading-relaxed">
            <span className="text-fg-tertiary">가설 · </span>
            {rec.cause_hypothesis}
          </p>
        ) : (
          <p className="text-sm text-fg-quaternary">분석 대기 중</p>
        )}
        {full && (
          <p className="mt-3 text-base text-fg-secondary leading-relaxed whitespace-pre-line">
            {analysis.llm_reasoning}
          </p>
        )}
      </div>

      {/* foot — 전략 */}
      {rec && (
        <div
          className={cn(
            "border-t border-border-hair",
            full
              ? "grid grid-cols-4 divide-x divide-border-hair"
              : "px-5 py-3 flex items-center gap-4",
          )}
        >
          {full ? (
            <>
              <FootCell label="권장 액션" value={ACTION_LABEL[rec.action]} />
              <FootCell label="우선순위" value={PRIORITY_LABEL[rec.priority]} />
              <FootCell
                label="신뢰도"
                value={`${(rec.confidence * 100).toFixed(0)}%`}
              />
              <FootCell label="자사 영향" value={rec.impact_on_own} wide />
            </>
          ) : (
            <>
              <span className="text-xs text-fg-tertiary">
                권장 ·{" "}
                <span className="text-fg-primary font-medium">
                  {ACTION_LABEL[rec.action]}
                </span>
              </span>
              <span className="text-xs text-fg-quaternary num ml-auto">
                conf {(rec.confidence * 100).toFixed(0)}%
              </span>
            </>
          )}
        </div>
      )}

      {full && rec && (
        <div className="px-5 py-3 border-t border-border-hair text-base text-fg-secondary">
          <span className="text-fg-tertiary">실행 방안 · </span>
          {rec.action_detail}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

function FootCell({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("px-4 py-3", wide && "col-span-1")}>
      <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
        {label}
      </div>
      <div
        className={cn(
          "text-sm text-fg-primary",
          wide ? "font-normal leading-snug" : "font-medium",
        )}
      >
        {value}
      </div>
    </div>
  );
}
