// viewer/lib/severity.ts
// Maps anomaly severity score (0..1) to display tier.

export type SeverityTier = "high" | "med" | "low";

export function severityTier(score: number): SeverityTier {
  if (score >= 0.80) return "high";
  if (score >= 0.50) return "med";
  return "low";
}

export const severityLabel: Record<SeverityTier, string> = {
  high: "High",
  med:  "Medium",
  low:  "Low",
};

/** For the inverted rank chart Y axis. */
export const RANK_Y_DOMAIN: [number, number] = [0, 60];
