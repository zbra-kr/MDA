// viewer/components/radar/products-table.tsx
// 상품 랭킹 테이블 + 행 클릭 시 상세 모달.
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, X, TrendingUp, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtKRW } from "@/lib/format";
import type { ProductTodayRow } from "@/lib/queries";

// ─── 테이블 ────────────────────────────────────────────────────

interface Props {
  rows: ProductTodayRow[];
}

export function ProductsTable({ rows }: Props) {
  const [selected, setSelected] = useState<ProductTodayRow | null>(null);

  return (
    <>
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
                onClick={() => setSelected(r)}
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

                {/* 리뷰점수 */}
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
                <td className="px-2 text-center" onClick={(e) => e.stopPropagation()}>
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
            해당 날짜에 수집된 상품이 없습니다.
          </div>
        )}
      </div>

      {selected && (
        <ProductDetailModal product={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

// ─── 상세 모달 ─────────────────────────────────────────────────

function ProductDetailModal({
  product: p,
  onClose,
}: {
  product: ProductTodayRow;
  onClose: () => void;
}) {
  // brand_slug가 있으면 이상탐지·브랜드 링크 표시
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-canvas shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start gap-4 p-5 border-b border-border-subtle">
          {/* 이미지 */}
          <div className="w-20 h-20 rounded-md bg-sunken border border-border-hair overflow-hidden shrink-0 flex items-center justify-center">
            {p.thumbnail_url ? (
              <Image
                src={p.thumbnail_url}
                alt={p.product_name}
                width={80}
                height={80}
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-fg-quaternary text-2xs font-mono">IMG</span>
            )}
          </div>

          {/* 제목 */}
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-fg-primary leading-snug">
              {p.product_name}
            </p>
            <p className="text-sm text-fg-tertiary mt-0.5">
              {p.brand_name}
              {p.company_name && (
                <span className="ml-1.5 text-fg-quaternary">· {p.company_name}</span>
              )}
            </p>
            {p.category_name && (
              <span className="inline-block mt-1.5 px-1.5 py-px text-2xs font-medium rounded-sm bg-sunken text-fg-secondary border border-border-hair">
                {p.category_name}
              </span>
            )}
          </div>

          {/* 닫기 */}
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-quaternary hover:text-fg-primary hover:bg-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* 지표 그리드 */}
        <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
          <StatItem label="순위" value={p.rank_main != null ? `#${p.rank_main}` : "—"} mono />
          <StatItem
            label="현재가"
            value={p.current_price != null ? fmtKRW(p.current_price) : "—"}
            mono
          />
          <StatItem
            label="할인율"
            value={
              p.discount_rate != null && p.discount_rate > 0 ? `${p.discount_rate}%` : "—"
            }
            highlight={p.discount_rate != null && p.discount_rate > 0}
            mono
          />
          <StatItem
            label="리뷰점수"
            value={p.rating != null ? p.rating.toFixed(1) : "—"}
            mono
          />
          <StatItem label="재고" value={p.is_sold_out ? "품절" : "판매 중"} />
        </div>

        {/* 액션 버튼 */}
        <div className="px-5 pb-5 flex flex-col gap-2">
          {/* 연관 링크 */}
          {p.brand_slug && (
            <div className="flex gap-2">
              <Link
                href={`/trends?brand=${encodeURIComponent(p.brand_slug)}`}
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-border text-xs text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors"
              >
                <TrendingUp size={11} />
                이상탐지 내역
              </Link>
              <Link
                href={`/brands?slug=${encodeURIComponent(p.brand_slug)}`}
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-border text-xs text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors"
              >
                <LayoutList size={11} />
                브랜드 정보
              </Link>
            </div>
          )}
          {/* 무신사 링크 */}
          <a
            href={p.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-md border border-border text-sm text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors"
          >
            무신사에서 보기
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── 공통 UI ───────────────────────────────────────────────────

function StatItem({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-fg-quaternary">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-medium",
          mono && "num",
          highlight ? "text-trend-up" : "text-fg-primary",
        )}
      >
        {value}
      </span>
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
