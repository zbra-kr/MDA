// viewer/components/radar/anomaly-table.tsx
// 오늘의 이상 징후 테이블. 36px 행 그리드, 숫자는 모노.
"use client";

import { useRouter } from "next/navigation";
import type { TodayFinding, AnomalyType } from "@/lib/supabase/types";
import { severityTier } from "@/lib/severity";
import { fmtKRW, fmtDelta } from "@/lib/format";
import { SeverityTag } from "@/components/radar/severity-tag";
import { cn } from "@/lib/utils";

const ANOMALY_LABEL: Record<AnomalyType, string> = {
  rank_surge: "랭킹 급상승",
  price_change: "가격 변동",
  review_velocity: "리뷰 폭증",
  new_entrant: "신규 진입",
  promo_start: "프로모션",
  wishlist_surge: "위시리스트 급증",
};

interface Props {
  rows: TodayFinding[];
}

export function AnomalyTable({ rows }: Props) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <Th className="w-[34%]">상품 / 브랜드</Th>
            <Th className="w-[12%]">유형</Th>
            <Th className="w-[8%] text-right">랭킹</Th>
            <Th className="w-[10%] text-right">Δ 1일</Th>
            <Th className="w-[12%] text-right">현재가</Th>
            <Th className="w-[10%] text-right">자사 매칭</Th>
            <Th className="w-[14%]">심각도</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tier = severityTier(r.severity);
            const rankDelta = fmtDelta(r.delta_rank_1d, "rank");
            return (
              <tr
                key={r.anomaly_id}
                onClick={() => router.push(`/anomalies/${r.anomaly_id}`)}
                className={cn(
                  "h-9 border-b border-border-hair cursor-pointer",
                  "hover:bg-hover transition-colors",
                )}
              >
                {/* 상품 / 브랜드 */}
                <td className="px-2">
                  <div className="flex flex-col">
                    <span className="text-fg-primary font-medium leading-tight">
                      {r.product_name}
                    </span>
                    <span className="text-xs text-fg-tertiary">
                      {r.brand_name}
                      {r.brand_is_own && (
                        <span className="ml-1.5 text-2xs uppercase tracking-wide text-house-soft">
                          자사
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                {/* 유형 */}
                <td className="px-2">
                  <span className="text-sm text-fg-secondary">
                    {ANOMALY_LABEL[r.anomaly_type]}
                  </span>
                </td>
                {/* 랭킹 */}
                <td className="px-2 text-right num text-fg-primary">
                  {r.rank_main ?? "—"}
                </td>
                {/* Δ 1일 */}
                <td
                  className={cn(
                    "px-2 text-right num",
                    rankDelta.trend === "up" && "text-trend-up",
                    rankDelta.trend === "down" && "text-trend-down",
                    rankDelta.trend === "flat" && "text-fg-quaternary",
                  )}
                >
                  {rankDelta.sign}
                  {rankDelta.abs}
                </td>
                {/* 현재가 */}
                <td className="px-2 text-right num text-fg-secondary">
                  {fmtKRW(r.current_price)}
                </td>
                {/* 자사 매칭 */}
                <td className="px-2 text-right num">
                  {r.matched_sku_count > 0 ? (
                    <span className="text-fg-primary">
                      {r.matched_sku_count}
                    </span>
                  ) : (
                    <span className="text-fg-quaternary">—</span>
                  )}
                </td>
                {/* 심각도 */}
                <td className="px-2">
                  <SeverityTag tier={tier} score={r.severity} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="py-16 text-center text-fg-tertiary text-sm">
          오늘 탐지된 이상 징후가 없습니다.
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary",
        className,
      )}
    >
      {children}
    </th>
  );
}
