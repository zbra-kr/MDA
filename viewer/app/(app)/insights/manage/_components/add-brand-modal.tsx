"use client";
// Phase 1.9 — Brand 추가 모달 (무신사 검색 + 자체몰 직접 입력).

import { useState, useRef } from "react";
import { searchMusinsaBrand, addCustomBrand } from "../actions";
import type { MusinsaBrandItem } from "../actions";

interface Props {
  companyId: string;
  companyName: string;
  onClose: () => void;
}

export function AddBrandModal({ companyId, companyName, onClose }: Props) {
  const [tab, setTab] = useState<"musinsa" | "custom">("musinsa");

  // 무신사 검색
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<MusinsaBrandItem[]>([]);
  const [searchMsg, setSearchMsg] = useState("");
  const [searching, setSearching] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selectedRef = useRef<MusinsaBrandItem | null>(null);

  // 자체몰 직접 입력
  const [customName, setCustomName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [reasoning, setReasoning] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function handleSearch() {
    const kw = keyword.trim();
    if (!kw || searching) return;
    setSearchMsg("");
    setResults([]);
    setSelectedSlug(null);
    selectedRef.current = null;
    setSearching(true);
    try {
      const res = await searchMusinsaBrand(kw);
      if (res.error) {
        setSearchMsg(res.error);
        return;
      }
      const items = res.items ?? [];
      setResults(items);
      if (items.length === 0) {
        setSearchMsg("검색 결과 없음 — 브랜드 전체명을 정확히 입력해 주세요.");
      }
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(item: MusinsaBrandItem) {
    if (selectedSlug === item.slug) {
      setSelectedSlug(null);
      selectedRef.current = null;
    } else {
      setSelectedSlug(item.slug);
      selectedRef.current = item;
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitError("");

    const currentSelected = selectedRef.current;

    if (tab === "musinsa" && !currentSelected) {
      setSubmitError("브랜드를 선택해 주세요.");
      return;
    }
    if (tab === "custom" && !customName.trim()) {
      setSubmitError("브랜드명을 입력해 주세요.");
      return;
    }
    if (tab === "custom" && !customSlug.trim()) {
      setSubmitError("슬러그를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      let result: { error?: string };
      if (tab === "musinsa" && currentSelected) {
        result = await addCustomBrand(
          companyId,
          currentSelected.name,
          currentSelected.slug,
          reasoning,
          currentSelected.slug,
        );
      } else {
        result = await addCustomBrand(
          companyId,
          customName.trim(),
          customSlug.trim(),
          reasoning,
        );
      }
      if (result.error) {
        setSubmitError(result.error);
      } else {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[480px] max-h-[80vh] flex flex-col bg-surface border border-border-subtle rounded-lg shadow-xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-hair shrink-0">
          <div>
            <p className="text-sm font-semibold text-fg-primary">Brand 추가</p>
            <p className="text-xs text-fg-quaternary mt-0.5">{companyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-fg-quaternary hover:text-fg-primary transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border-hair shrink-0">
          {(["musinsa", "custom"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm transition-colors ${
                tab === t
                  ? "text-fg-primary border-b-2 border-fg-primary"
                  : "text-fg-tertiary hover:text-fg-secondary"
              }`}
            >
              {t === "musinsa" ? "무신사 검색" : "자체몰 직접 입력"}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {tab === "musinsa" ? (
            <>
              <div className="flex gap-2">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                  placeholder="브랜드명 전체명 검색 (예: 내셔널지오그래픽)"
                  className="flex-1 text-sm px-3 py-2 bg-sunken border border-border-hair rounded-md text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:border-fg-tertiary"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="shrink-0 px-4 py-2 text-sm bg-fg-primary text-canvas rounded-md hover:bg-fg-secondary transition-colors disabled:opacity-40"
                >
                  {searching ? "..." : "검색"}
                </button>
              </div>
              <p className="text-xs text-fg-quaternary -mt-2">
                무신사 API 특성상 전체명 또는 영문명으로 검색해야 결과가 나옵니다.
              </p>
              {searchMsg && <p className="text-xs text-trend-down -mt-2">{searchMsg}</p>}
              {results.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {results.map((item) => {
                    const isSelected = selectedSlug === item.slug;
                    return (
                      <li key={item.slug}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                            isSelected
                              ? "bg-chart-1/10 border-chart-1/30 text-fg-primary"
                              : "bg-raised border-border-hair text-fg-secondary hover:bg-hover"
                          }`}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="ml-2 text-xs font-mono text-fg-quaternary">{item.slug}</span>
                          {item.isExclusive && (
                            <span className="ml-1.5 text-2xs font-mono px-1 py-px rounded-sm bg-chart-2/10 text-chart-2 border border-chart-2/20">독점</span>
                          )}
                          {item.isFlagship && (
                            <span className="ml-1 text-2xs font-mono px-1 py-px rounded-sm bg-chart-3/10 text-chart-3 border border-chart-3/20">플래그십</span>
                          )}
                          {isSelected && (
                            <span className="ml-2 text-2xs font-mono text-chart-1">선택됨</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-fg-tertiary mb-1 block">브랜드명</label>
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="예: 비케이브 레이블"
                  className="w-full text-sm px-3 py-2 bg-sunken border border-border-hair rounded-md text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:border-fg-tertiary"
                />
              </div>
              <div>
                <label className="text-xs text-fg-tertiary mb-1 block">슬러그 (영문 소문자·숫자·하이픈)</label>
                <input
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="예: bcave-label"
                  className="w-full text-sm px-3 py-2 bg-sunken border border-border-hair rounded-md text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:border-fg-tertiary font-mono"
                />
              </div>
            </div>
          )}

          {/* 사유 (공통) */}
          <div>
            <label className="text-xs text-fg-tertiary mb-1 block">변경 사유 (선택)</label>
            <input
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="예: 직접 확인, 공시 근거 등"
              className="w-full text-sm px-3 py-2 bg-sunken border border-border-hair rounded-md text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:border-fg-tertiary"
            />
          </div>

          {submitError && <p className="text-xs text-trend-down">{submitError}</p>}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-hair shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-fg-secondary hover:text-fg-primary transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-fg-primary text-canvas rounded-md hover:bg-fg-secondary transition-colors disabled:opacity-40"
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
