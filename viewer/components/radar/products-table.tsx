// viewer/components/radar/products-table.tsx
// 오늘 수집된 상품 랭킹 테이블. anomaly-table 스타일 따름.
"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtKRW } from "@/lib/format";
import type { ProductTodayRow } from "@/lib/queries";

interface Props {
  rows: ProductTodayRow[];
}

export function ProductsTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b border-border-subtle text-left">
            <Th className="w-12 text-right">순위</Th>
            <Th className="w-12"></Th>
            <Th className="w-[34%]">상품 / 브랜드</Th>
            <Th className="w-[14%] text-right">현재가</Th>
            <Th className="w-[9%] text-right">할인율</Th>
            <Th className="w-[10%] text-right">리뷰점수</Th>
            <Th className="w-[8%] text-center">품절</Th>
            <Th className="w-8 text-center">링크</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.product_id}
              onClick={() => window.open(r.product_url, "_blank", "noopener,noreferrer")}
              className={cn(
                "h-[52px] border-b border-border-hair cursor-pointer",
                "hover:bg-hover transition-colors",
                r.is_sold_out && "opacity-50",
              )}
            >
              {/* 순위 */}
              <td className="px-2 text-right num text-fg-primary font-medium">
                {r.rank_main ?? "—"}
              </td>

              {/* 썸네일 */}
              <td className="px-2">
                <div className="w-9 h-9 rounded-sm bg-sunken border border-border-hair overflow-hidden flex items-center justify-center shrink-0">
                  {r.thumbnail_url ? (
                    <Image
                      src={r.thumbnail_url}
                      alt={r.product_name}
                      width={36}
                      height={36}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-fg-quaternary text-2xs font-mono">IMG</span>
                  )}
                </div>
              </td>

              {/* 상품명 / 브랜드 */}
              <td className="px-2">
                <div className="flex flex-col leading-tight">
                  <span className="text-fg-primary font-medium truncate max-w-[380px]">
                    {r.product_name}
                  </span>
                  <span className="text-xs text-fg-tertiary">
                    {r.brand_name}
                    {r.company_name && (
                      <span className="ml-1.5 text-fg-quaternary">{r.company_name}</span>
                    )}
                  </span>
                </div>
              </td>

              {/* 현재가 */}
              <td className="px-2 text-right num text-fg-primary">
                {fmtKRW(r.current_price)}
              </td>

              {/* 할인율 */}
              <td className="px-2 text-right num">
                {r.discount_rate != null && r.discount_rate > 0 ? (
                  <span className="text-trend-up">{r.discount_rate}%</span>
                ) : (
                  <span className="text-fg-quaternary">—</span>
                )}
              </td>

              {/* 리뷰점수 (100점 척도 원본) */}
              <td className="px-2 text-right num text-fg-secondary">
                {r.rating != null ? r.rating.toFixed(1) : "—"}
              </td>

              {/* 품절 배지 */}
              <td className="px-2 text-center">
                {r.is_sold_out && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-2xs font-medium bg-sunken text-fg-tertiary border border-border-hair">
                    품절
                  </span>
                )}
              </td>

              {/* 무신사 링크 */}
              <td
                className="px-2 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <a
                  href={r.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-sm text-fg-quaternary hover:text-fg-primary hover:bg-hover transition-colors"
                >
                  <ExternalLink size={12} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="py-16 text-center text-fg-tertiary text-sm">
          오늘 수집된 상품이 없습니다.
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
