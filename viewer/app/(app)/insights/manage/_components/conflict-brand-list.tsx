"use client";
// Phase 1.9 — medium-confidence brand 충돌 검토 목록.

import { useState, useTransition } from "react";
import { removeBrandFromCompany } from "../actions";
import type { ConflictBrandRow } from "@/lib/queries-insights";

interface Props {
  brands: ConflictBrandRow[];
}

export function ConflictBrandList({ brands }: Props) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function handleRemove(brand: ConflictBrandRow) {
    if (brand.is_own) return;
    const confirmed = window.confirm(`'${brand.name}' 의 회사 매핑을 제거하시겠습니까?`);
    if (!confirmed) return;
    setRemoving(brand.id);
    startTransition(async () => {
      const result = await removeBrandFromCompany(brand.id, "충돌 검토 후 수동 제거");
      if (result.error) {
        setErrors((prev) => ({ ...prev, [brand.id]: result.error! }));
      } else {
        setDismissed((prev) => new Set(prev).add(brand.id));
        setErrors((prev) => { const n = { ...prev }; delete n[brand.id]; return n; });
      }
      setRemoving(null);
    });
  }

  const visible = brands.filter((b) => !dismissed.has(b.id));

  if (visible.length === 0) {
    return (
      <p className="text-sm text-fg-quaternary px-2 py-4">검토 대상 브랜드가 없습니다.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {visible.map((b) => (
        <li
          key={b.id}
          className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-raised border border-border-hair"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {b.musinsa_brand_id ? (
                <a
                  href={`https://www.musinsa.com/brand/${b.musinsa_brand_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-fg-primary hover:text-chart-1 transition-colors"
                >
                  {b.name}
                </a>
              ) : (
                <span className="text-sm font-medium text-fg-primary">{b.name}</span>
              )}
              <span className="shrink-0 text-2xs font-mono px-1 py-px rounded-sm bg-chart-3/10 text-chart-3 border border-chart-3/20">
                M
              </span>
              {b.brand_category && (
                <span className="shrink-0 text-2xs font-mono px-1 rounded-sm bg-sunken text-fg-tertiary border border-border-hair">
                  {b.brand_category}
                </span>
              )}
            </div>
            <p className="text-xs text-fg-tertiary mt-0.5">
              <span className="font-mono">{b.slug}</span>
              {b.company_name && <> · <span>{b.company_name}</span></>}
            </p>
            {errors[b.id] && (
              <p className="text-xs text-trend-down mt-0.5">{errors[b.id]}</p>
            )}
          </div>
          {!b.is_own && (
            <button
              onClick={() => handleRemove(b)}
              disabled={pending && removing === b.id}
              className="shrink-0 text-xs font-mono text-fg-quaternary hover:text-trend-down transition-colors disabled:opacity-40 mt-0.5"
            >
              {pending && removing === b.id ? "..." : "매핑 제거"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
