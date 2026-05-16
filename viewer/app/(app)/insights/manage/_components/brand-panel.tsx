"use client";
// Phase 1.9 — 선택 회사의 브랜드 패널 (목록 + 추가 버튼).

import { useState } from "react";
import { ManageBrandList } from "./manage-brand-list";
import { AddBrandModal } from "./add-brand-modal";
import type { ManageBrandRow } from "@/lib/queries-insights";

interface Props {
  brands: ManageBrandRow[];
  companyId: string;
  companyName: string;
}

export function BrandPanel({ brands, companyId, companyName }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-fg-tertiary font-mono">{brands.length}개 브랜드</p>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs font-mono text-chart-1 hover:text-chart-1/70 transition-colors"
        >
          + 추가
        </button>
      </div>
      <ManageBrandList brands={brands} companyId={companyId} />
      {showModal && (
        <AddBrandModal
          companyId={companyId}
          companyName={companyName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
