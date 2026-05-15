// viewer/components/radar/companies-table.tsx
// 패션 회사 목록 테이블. 매출/영업이익률/오늘활동 컬럼.
import { cn } from "@/lib/utils";
import { fmtRevenueMkrw } from "@/lib/format";
import type { CompanyRow } from "@/lib/queries";

const LISTING_LABEL: Record<string, string> = {
  listed: "상장",
  unlisted: "비상장",
};

interface Props {
  rows: CompanyRow[];
  sort: "revenue" | "op_margin" | "today_active";
}

export function CompaniesTable({ rows, sort }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <Th className="w-10 text-right">#</Th>
            <Th className="w-[30%]">회사명</Th>
            <Th className="w-[8%]">상장</Th>
            <Th className="w-[18%] text-right">매출 2025</Th>
            <Th className="w-[12%] text-right">영업이익률</Th>
            <Th className="w-[10%] text-right">매핑 브랜드</Th>
            <Th className="w-[12%] text-right">오늘 활동 브랜드</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const isLoss = (r.op_income_2025_mkrw ?? 0) < 0;
            const marginColor = isLoss
              ? "text-trend-down"
              : (r.op_margin_2025_pct ?? 0) >= 10
                ? "text-trend-up"
                : "text-fg-secondary";

            return (
              <tr
                key={r.id}
                className={cn(
                  "h-[48px] border-b border-border-hair transition-colors",
                  r.is_own
                    ? "bg-house-soft/[0.06] border-l-2 border-l-house-soft"
                    : "hover:bg-hover",
                )}
              >
                {/* # */}
                <td className="px-2 text-right num text-fg-quaternary text-sm">
                  {idx + 1}
                </td>

                {/* 회사명 */}
                <td className="px-3">
                  <div className="flex flex-col leading-tight">
                    <span
                      className={cn(
                        "font-medium",
                        r.is_own ? "text-house-soft" : "text-fg-primary",
                      )}
                    >
                      {r.name}
                      {r.is_own && (
                        <span className="ml-2 text-2xs font-medium uppercase tracking-wide text-house-soft opacity-70">
                          자사
                        </span>
                      )}
                    </span>
                    {r.name_alt && (
                      <span className="text-xs text-fg-quaternary">{r.name_alt}</span>
                    )}
                  </div>
                </td>

                {/* 상장구분 */}
                <td className="px-2">
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-sm text-2xs font-medium border",
                      r.listing_type === "listed"
                        ? "bg-selected text-fg-secondary border-border"
                        : "bg-sunken text-fg-tertiary border-border-hair",
                    )}
                  >
                    {LISTING_LABEL[r.listing_type]}
                  </span>
                </td>

                {/* 매출 2025 */}
                <td className="px-2 text-right">
                  <span className="num text-fg-primary">
                    {fmtRevenueMkrw(r.revenue_2025_mkrw)}
                  </span>
                  {r.revenue_yoy_pct != null && (
                    <span
                      className={cn(
                        "ml-1.5 text-xs num",
                        r.revenue_yoy_pct > 0
                          ? "text-trend-up"
                          : r.revenue_yoy_pct < 0
                            ? "text-trend-down"
                            : "text-fg-quaternary",
                      )}
                    >
                      {r.revenue_yoy_pct > 0 ? "+" : ""}
                      {r.revenue_yoy_pct.toFixed(1)}%
                    </span>
                  )}
                </td>

                {/* 영업이익률 */}
                <td className="px-2 text-right">
                  <div className="flex flex-col items-end leading-tight">
                    <span className={cn("num font-medium", marginColor)}>
                      {r.op_margin_2025_pct != null
                        ? `${r.op_margin_2025_pct.toFixed(1)}%`
                        : "—"}
                    </span>
                    {r.op_status_note && (
                      <span className="text-2xs text-trend-down">{r.op_status_note}</span>
                    )}
                  </div>
                </td>

                {/* 매핑 브랜드 수 */}
                <td className="px-2 text-right num text-fg-secondary">
                  {r.brand_count > 0 ? (
                    r.brand_count
                  ) : (
                    <span className="text-fg-quaternary">—</span>
                  )}
                </td>

                {/* 오늘 활동 브랜드 */}
                <td className="px-2 text-right">
                  {r.today_active_brands > 0 ? (
                    <span
                      className={cn(
                        "num font-medium",
                        sort === "today_active"
                          ? "text-fg-primary"
                          : "text-fg-secondary",
                      )}
                    >
                      {r.today_active_brands}
                    </span>
                  ) : (
                    <span className="num text-fg-quaternary">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="py-16 text-center text-fg-tertiary text-sm">
          조건에 맞는 회사가 없습니다.
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
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
