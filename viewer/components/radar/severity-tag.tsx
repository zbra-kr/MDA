// viewer/components/radar/severity-tag.tsx
// Reference implementation of the severity tag from components.html.
// Use the data-testid for snapshot tests against the mocks.

import type { SeverityTier } from "@/lib/severity";
import { severityLabel } from "@/lib/severity";
import { cn } from "@/lib/utils";

const tierClasses: Record<SeverityTier, string> = {
  high: "bg-sev-high-bg text-sev-high-fg border-sev-high-border",
  med:  "bg-sev-med-bg  text-sev-med-fg  border-sev-med-border",
  low:  "bg-sev-low-bg  text-sev-low-fg  border-sev-low-border",
};

const pipClasses: Record<SeverityTier, string> = {
  high: "bg-sev-high-solid",
  med:  "bg-sev-med-solid",
  low:  "bg-sev-low-solid",
};

interface Props {
  tier: SeverityTier;
  /** override label (default uses severityLabel map) */
  label?: string;
  /** optional score (e.g. "0.91") shown after the label */
  score?: number;
  className?: string;
}

export function SeverityTag({ tier, label, score, className }: Props) {
  return (
    <span
      data-testid="severity-tag"
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-px",
        "border rounded-sm text-2xs font-medium uppercase tracking-wide",
        "whitespace-nowrap",
        tierClasses[tier],
        className,
      )}
    >
      <span className={cn("w-1 h-1 rounded-full", pipClasses[tier])} />
      <span>{label ?? severityLabel[tier]}</span>
      {score != null && (
        <span className="font-mono text-fg-tertiary ml-1">
          {score.toFixed(2)}
        </span>
      )}
    </span>
  );
}
