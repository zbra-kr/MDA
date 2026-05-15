// viewer/lib/format.ts
// Number / date / delta formatters used throughout the dashboard.

const krw = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
const time = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

export const fmtKRW = (n: number | null | undefined) => n == null ? "—" : krw.format(n);
export const fmtPct = (n: number | null | undefined) => n == null ? "—" : pct.format(n);
export const fmtDate = (d: string | Date) => date.format(new Date(d)).replace(/\. /g, ".").replace(/\.$/, "");
export const fmtTime = (d: string | Date) => time.format(new Date(d));

/**
 * Delta sign for our mocks.  Rank deltas are inverted (smaller = better),
 * so we accept an explicit `direction`.
 *
 *  fmtDelta(-35, "rank")   => { sign: "−", abs: "35", trend: "up" }
 *  fmtDelta(+184, "value", { unit: "%" }) => { sign: "+", abs: "184%", trend: "up" }
 */
export type DeltaDirection = "rank" | "value";
export interface Delta { sign: "+" | "−" | ""; abs: string; trend: "up" | "down" | "flat" }

/**
 * 백만원 단위 매출액을 조/억 단위로 변환.
 * 4895010 → "4조 8,950억"  /  274342 → "2,743억"
 */
export function fmtRevenueMkrw(mkrw: number | null | undefined): string {
  if (mkrw == null) return "—";
  const abs = Math.abs(mkrw);
  const sign = mkrw < 0 ? "−" : "";
  const jo = Math.floor(abs / 1_000_000);
  const eok = Math.floor((abs % 1_000_000) / 100);
  if (jo > 0 && eok > 0) {
    return `${sign}${jo.toLocaleString("ko-KR")}조 ${eok.toLocaleString("ko-KR")}억`;
  }
  if (jo > 0) return `${sign}${jo.toLocaleString("ko-KR")}조`;
  return `${sign}${eok.toLocaleString("ko-KR")}억`;
}

export function fmtDelta(n: number | null | undefined, dir: DeltaDirection = "value", opts?: { unit?: string }): Delta {
  if (n == null || isNaN(n)) return { sign: "", abs: "—", trend: "flat" };
  if (n === 0) return { sign: "", abs: `0${opts?.unit ?? ""}`, trend: "flat" };
  const positive = n > 0;
  const trend: Delta["trend"] = dir === "rank"
    ? (positive ? "down" : "up")     // rank up (number ↑) = bad
    : (positive ? "up" : "down");
  return {
    sign: positive ? "+" : "−",
    abs: `${Math.abs(n)}${opts?.unit ?? ""}`,
    trend,
  };
}
