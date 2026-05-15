// viewer/components/radar/brands-table.tsx
// 브랜드 목록 테이블. CompetitorToggle 을 포함하는 Server Component.
import { cn } from "@/lib/utils";
import type { BrandRow } from "@/lib/queries";
import { CompetitorToggle } from "@/components/radar/competitor-toggle";

const CONFIDENCE_CLASS: Record<string, string> = {
  high:    "text-trend-up bg-trend-up/5 border-trend-up/30",
  medium:  "text-fg-secondary bg-selected border-border",
  low:     "text-fg-tertiary bg-sunken border-border-hair",
  unknown: "text-fg-quaternary bg-sunken border-border-hair",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "확정", medium: "확인필요", low: "추정", unknown: "조사필요",
};

interface Props {
  rows: BrandRow[];
}

export function BrandsTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <Th className="w-[22%]">브랜드</Th>
            <Th className="w-[16%]">소속 회사</Th>
            <Th className="w-[9%]">매핑</Th>
            <Th className="w-[10%] text-right">오늘 상품</Th>
            <Th className="w-[20%]">카테고리</Th>
            <Th className="w-[18%]">경쟁사</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={cn(
                "h-[48px] border-b border-border-hair transition-colors",
                r.is_own
                  ? "bg-house-soft/[0.06] border-l-2 border-l-house-soft"
                  : "hover:bg-hover",
              )}
            >
              {/* 브랜드명 */}
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
                  <span className="text-xs text-fg-quaternary font-mono">{r.slug}</span>
                </div>
              </td>

              {/* 소속 회사 */}
              <td className="px-2 text-sm text-fg-secondary">
                {r.company_name ?? <span className="text-fg-quaternary">—</span>}
              </td>

              {/* 매핑 confidence */}
              <td className="px-2">
                {r.company_mapping_confidence ? (
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-sm text-2xs font-medium border",
                      CONFIDENCE_CLASS[r.company_mapping_confidence] ?? CONFIDENCE_CLASS.unknown,
                    )}
                  >
                    {CONFIDENCE_LABEL[r.company_mapping_confidence] ?? r.company_mapping_confidence}
                  </span>
                ) : (
                  <span className="text-fg-quaternary text-xs">—</span>
                )}
              </td>

              {/* 오늘 상품 수 */}
              <td className="px-2 text-right">
                {r.today_products > 0 ? (
                  <span className="num font-medium text-fg-primary">{r.today_products}</span>
                ) : (
                  <span className="num text-fg-quaternary">—</span>
                )}
              </td>

              {/* 카테고리 (최대 2개 + 나머지 수) */}
              <td className="px-2">
                {r.today_categories.length > 0 ? (
                  <span className="text-xs text-fg-secondary">
                    {r.today_categories.slice(0, 2).join(" · ")}
                    {r.today_categories.length > 2 && (
                      <span className="text-fg-quaternary">
                        {" "}외 {r.today_categories.length - 2}개
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-fg-quaternary">—</span>
                )}
              </td>

              {/* 경쟁사 토글 */}
              <td className="px-3">
                <CompetitorToggle
                  brandId={r.id}
                  brandName={r.name}
                  isCompetitor={r.is_competitor}
                  disabled={r.is_own}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="py-16 text-center text-fg-tertiary text-sm">
          조건에 맞는 브랜드가 없습니다.
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-2 py-2 text-xs font-medium uppercase tracking-wide text-fg-quaternary", className)}>
      {children}
    </th>
  );
}
