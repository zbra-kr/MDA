// viewer/components/radar/search-bar.tsx
// 커맨드 팔레트 — 클릭 또는 / 키로 열림
"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "대시보드",     desc: "메인 경쟁현황 요약",      href: "/" },
  { label: "자사운영현황", desc: "자사 KPI · 재고",          href: "/own" },
  { label: "이상 징후",    desc: "이상탐지 목록",            href: "/anomalies" },
  { label: "트렌드",       desc: "탐지 유형별 시계열",       href: "/trends" },
  { label: "랭킹",         desc: "오늘 상품 랭킹",           href: "/products/today" },
  { label: "브랜드",       desc: "브랜드 목록 · 경쟁사 관리", href: "/brands" },
  { label: "회사 목록",    desc: "회사 정보",                href: "/companies" },
  { label: "인사이트",     desc: "비교 분석",                href: "/insights/compare" },
  { label: "매칭",         desc: "자사 · 경쟁 상품 매칭",    href: "/matches" },
  { label: "설정",         desc: "시스템 설정",              href: "/settings" },
];

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // / 단축키로 열기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = NAV_ITEMS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q);
  });

  function select(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIdx]) {
      select(filtered[activeIdx].href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      {/* 트리거 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border text-sm text-fg-tertiary hover:border-border-strong hover:text-fg-secondary transition-colors"
      >
        <Search size={13} />
        <span>브랜드 · 상품 검색</span>
        <kbd className="ml-2 text-2xs font-mono px-1 py-px rounded-sm bg-sunken border border-border-hair text-fg-quaternary">
          /
        </kbd>
      </button>

      {/* 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-canvas shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 입력 영역 */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle">
              <Search size={14} className="text-fg-quaternary shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                onKeyDown={onKeyDown}
                placeholder="페이지 이동..."
                className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-quaternary outline-none"
              />
              <button
                onClick={() => setOpen(false)}
                className="text-fg-quaternary hover:text-fg-secondary transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* 결과 목록 */}
            <div className="py-1 max-h-72 overflow-y-auto">
              {filtered.map((item, i) => (
                <button
                  key={item.href}
                  onClick={() => select(item.href)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    i === activeIdx ? "bg-hover" : ""
                  }`}
                >
                  <span className="text-sm font-medium text-fg-primary">{item.label}</span>
                  <span className="text-xs text-fg-tertiary">{item.desc}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-5 text-sm text-fg-tertiary text-center">
                  일치하는 페이지가 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
