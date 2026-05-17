// viewer/components/radar/search-bar.tsx
// 브랜드·상품 실시간 검색 — 클릭 또는 / 키로 열림
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Search, X, ExternalLink } from "lucide-react";

interface BrandResult {
  id: string;
  name: string;
  slug: string | null;
  is_competitor: boolean;
  is_own: boolean;
}

interface ProductResult {
  id: string;
  name: string;
  musinsa_no: string | null;
  thumbnail_url: string | null;
  url: string | null;
  brands: { name: string; slug: string } | null;
}

interface SearchResults {
  brands: BrandResult[];
  products: ProductResult[];
}

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ brands: [], products: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // / 단축키
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
      setResults({ brands: [], products: [] });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // 디바운스 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ brands: [], products: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data: SearchResults = await res.json();
        setResults(data);
      } catch {
        setResults({ brands: [], products: [] });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const hasResults = results.brands.length > 0 || results.products.length > 0;

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

      {/* 검색 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-canvas shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 입력 */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle">
              <Search size={14} className="text-fg-quaternary shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                placeholder="브랜드 또는 상품명 입력..."
                className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-quaternary outline-none"
              />
              {loading && (
                <span className="text-2xs text-fg-quaternary">검색 중...</span>
              )}
              <button onClick={() => setOpen(false)} className="text-fg-quaternary hover:text-fg-secondary transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* 결과 */}
            <div className="max-h-[420px] overflow-y-auto">
              {/* 브랜드 결과 */}
              {results.brands.length > 0 && (
                <section>
                  <p className="px-4 pt-3 pb-1.5 text-2xs font-medium uppercase tracking-wide text-fg-quaternary">
                    브랜드
                  </p>
                  {results.brands.map((b) => (
                    <a
                      key={b.id}
                      href={`/brands`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover transition-colors"
                    >
                      <div className="w-7 h-7 rounded-sm bg-sunken border border-border-hair flex items-center justify-center shrink-0">
                        <span className="text-2xs font-mono font-semibold text-fg-tertiary">
                          {b.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="flex-1 text-sm font-medium text-fg-primary truncate">
                        {b.name}
                      </span>
                      {b.is_own && (
                        <span className="text-2xs font-mono px-1.5 py-0.5 rounded-sm bg-selected text-fg-secondary border border-border-hair shrink-0">
                          자사
                        </span>
                      )}
                      {b.is_competitor && !b.is_own && (
                        <span className="text-2xs font-mono px-1.5 py-0.5 rounded-sm bg-sunken text-fg-tertiary border border-border-hair shrink-0">
                          경쟁사
                        </span>
                      )}
                    </a>
                  ))}
                </section>
              )}

              {/* 상품 결과 */}
              {results.products.length > 0 && (
                <section>
                  <p className="px-4 pt-3 pb-1.5 text-2xs font-medium uppercase tracking-wide text-fg-quaternary">
                    상품
                  </p>
                  {results.products.map((p) => {
                    const href = p.url ?? (p.musinsa_no ? `https://www.musinsa.com/products/${p.musinsa_no}` : "#");
                    const isExternal = href.startsWith("http");
                    return (
                      <a
                        key={p.id}
                        href={href}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noopener noreferrer" : undefined}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover transition-colors"
                      >
                        <div className="w-7 h-7 rounded-sm bg-sunken border border-border-hair overflow-hidden flex items-center justify-center shrink-0">
                          {p.thumbnail_url ? (
                            <Image
                              src={p.thumbnail_url}
                              alt={p.name}
                              width={28}
                              height={28}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <span className="text-2xs font-mono text-fg-quaternary">IMG</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-fg-primary truncate">{p.name}</p>
                          <p className="text-xs text-fg-tertiary">{p.brands?.name ?? "—"}</p>
                        </div>
                        {isExternal && (
                          <ExternalLink size={12} className="text-fg-quaternary shrink-0" />
                        )}
                      </a>
                    );
                  })}
                </section>
              )}

              {/* 빈 상태 */}
              {query && !loading && !hasResults && (
                <p className="px-4 py-7 text-sm text-fg-tertiary text-center">
                  &ldquo;{query}&rdquo;에 해당하는 브랜드·상품이 없습니다.
                </p>
              )}

              {/* 초기 상태 */}
              {!query && (
                <p className="px-4 py-7 text-sm text-fg-tertiary text-center">
                  브랜드 또는 상품명을 입력하세요.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
