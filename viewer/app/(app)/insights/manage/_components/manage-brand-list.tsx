"use client";
// Phase 1.9 — 선택 회사의 brand 목록 + 제거 액션.

import { useTransition, useState } from "react";
import { removeBrandFromCompany } from "../actions";
import type { ManageBrandRow } from "@/lib/queries-insights";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "H",
  medium: "M",
  low: "L",
  unknown: "?",
};
const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-trend-up/10 text-trend-up border-trend-up/20",
  medium: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  low: "bg-sunken text-fg-quaternary border-border-hair",
  unknown: "bg-sunken text-fg-quaternary border-border-hair",
};

interface Props {
  brands: ManageBrandRow[];
  companyId: string;
}

export function ManageBrandList({ brands, companyId }: Props) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);

  function handleRemove(brand: ManageBrandRow) {
    if (brand.is_own) return;
    const confirmed = window.confirm(`'${brand.name}' 을 이 회사에서 제거하시겠습니까?`);
    if (!confirmed) return;
    setRemoving(brand.id);
    startTransition(async () => {
      const result = await removeBrandFromCompany(brand.id, "운영 도구 수동 제거");
      if (result.error) {
        setErrors((prev) => ({ ...prev, [brand.id]: result.error! }));
      } else {
        setErrors((prev) => { const n = { ...prev }; delete n[brand.id]; return n; });
      }
      setRemoving(null);
    });
  }

  if (brands.length === 0) {
    return (
      <p className="text-sm text-fg-quaternary px-2 py-4">이 회사에 매핑된 브랜드가 없습니다.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {brands.map((b) => (
        <li
          key={b.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-raised border border-border-hair"
        >
          {/* 이름 + 배지 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {b.musinsa_brand_id ? (
                <a
                  href={`https://www.musinsa.com/brand/${b.musinsa_brand_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-fg-primary hover:text-chart-1 transition-colors truncate"
                >
                  {b.name}
                </a>
              ) : (
                <span className="text-sm font-medium text-fg-primary truncate">{b.name}</span>
              )}
              {b.musinsa_brand_id ? (
                <span className="shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-chart-1/10 text-chart-1 border border-chart-1/20">
                  무신사
                </span>
              ) : (
                <span className="shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-sunken text-fg-quaternary border border-border-hair">
                  자체몰
                </span>
              )}
              {b.is_own && (
                <span className="shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-house/20 text-house-soft border border-house/30">
                  자사
                </span>
              )}
              {b.company_mapping_confidence && (
                <span
                  className={`shrink-0 text-2xs font-mono px-1 py-px rounded-sm border ${CONFIDENCE_STYLE[b.company_mapping_confidence] ?? CONFIDENCE_STYLE.unknown}`}
                  title={`신뢰도: ${b.company_mapping_confidence}`}
                >
                  {CONFIDENCE_LABEL[b.company_mapping_confidence] ?? "?"}
                </span>
              )}
              {b.brand_category && (
                <span className="shrink-0 text-2xs font-mono px-1 rounded-sm bg-sunken text-fg-tertiary border border-border-hair">
                  {b.brand_category}
                </span>
              )}
            </div>
            {errors[b.id] && (
              <p className="text-xs text-trend-down mt-0.5">{errors[b.id]}</p>
            )}
          </div>

          {/* 제거 버튼 */}
          {!b.is_own && (
            <button
              onClick={() => handleRemove(b)}
              disabled={pending && removing === b.id}
              className="shrink-0 text-xs font-mono text-fg-quaternary hover:text-trend-down transition-colors disabled:opacity-40"
            >
              {pending && removing === b.id ? "..." : "제거"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
