"use client";
// viewer/app/(app)/matches/matches-client.tsx
// 자사 매칭 클라이언트: 필터·테이블·상세 모달

import { useState, useMemo } from "react";
import { X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchRow, DiffSummary } from "@/lib/queries-anomaly";

// ─── 상수 ───────────────────────────────────────────────────────────────────

const OWN_BRANDS = [
  { slug: "covernat", label: "커버낫" },
  { slug: "lee",      label: "리" },
  { slug: "wakywilly", label: "와키윌리" },
];

const STOCK_META: Record<string, { label: string; cls: string }> = {
  out:       { label: "품절",    cls: "bg-sev-high-subtle text-sev-high-fg" },
  critical:  { label: "긴급",    cls: "bg-sev-high-subtle text-sev-high-fg" },
  low:       { label: "부족",    cls: "bg-sev-med-subtle  text-sev-med-fg"  },
  normal:    { label: "정상",    cls: "bg-sev-low-subtle  text-sev-low-fg"  },
  overstock: { label: "과잉",    cls: "bg-raised text-fg-tertiary border border-border" },
};

const METHOD_META: Record<string, string> = {
  vector:     "벡터",
  name_exact: "명칭",
  category:   "카테고리",
};

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

function fmtKRW(v: number | null | undefined): string {
  return v != null ? `${v.toLocaleString()}원` : "—";
}

function StockChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-fg-quaternary">—</span>;
  const meta = STOCK_META[status] ?? { label: status, cls: "bg-raised text-fg-tertiary" };
  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-2xs font-medium", meta.cls)}>
      {meta.label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 90
      ? "text-trend-up"
      : pct >= 80
        ? "text-fg-primary"
        : "text-fg-tertiary";
  return <span className={cn("num font-mono text-xs", cls)}>{pct}%</span>;
}

// ─── 상세 모달 ───────────────────────────────────────────────────────────────

function MatchModal({ match, onClose }: { match: MatchRow; onClose: () => void }) {
  const ds: DiffSummary = match.diff_summary ?? {};
  const priceDiff = ds.price_diff_krw;
  const pricePct  = ds.price_diff_pct;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-canvas border border-border-subtle rounded-lg w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-border-hair">
          <h2 className="text-base font-semibold text-fg-primary">매칭 상세</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-fg-tertiary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 양쪽 비교 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 경쟁 상품 */}
            <div className="bg-surface rounded-md p-3 border border-border-subtle">
              <p className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1.5">경쟁 상품</p>
              <p className="text-sm font-medium text-fg-primary line-clamp-2 mb-1">
                {match.own_sku_name ?? "상품명 없음"}
              </p>
              <p className="text-xs text-fg-tertiary num">
                {fmtKRW(ds.competitor_price)}
              </p>
            </div>

            {/* 자사 SKU */}
            <div className="bg-surface rounded-md p-3 border border-border-subtle">
              <p className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1.5">
                자사 SKU ({match.own_brand_slug ?? "—"})
              </p>
              <p className="text-sm font-medium text-fg-primary mb-1">
                {match.own_sku_code ?? "—"}
              </p>
              <p className="text-xs text-fg-tertiary">
                {match.own_sku_name ?? "—"}
              </p>
              <p className="text-xs text-fg-tertiary num mt-0.5">
                정상가 {fmtKRW(ds.own_price_msrp)} / POS {fmtKRW(ds.own_price_pos)}
              </p>
            </div>
          </div>

          {/* 가격 차이 */}
          {priceDiff != null && (
            <div className="flex items-center justify-between text-sm bg-surface rounded-md p-3 border border-border-subtle">
              <span className="text-fg-tertiary">가격 차이</span>
              <span
                className={cn(
                  "num font-medium",
                  priceDiff < 0 ? "text-trend-down" : "text-trend-up",
                )}
              >
                {priceDiff > 0 ? "+" : ""}
                {priceDiff.toLocaleString()}원
                {pricePct != null && (
                  <span className="ml-1 text-xs text-fg-tertiary">
                    ({pricePct > 0 ? "+" : ""}
                    {pricePct}%)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* 재고·매출 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-surface rounded-md p-3 border border-border-subtle">
              <p className="text-2xs text-fg-quaternary mb-1">재고 상태</p>
              <StockChip status={ds.stock_status} />
              {ds.stock_qty != null && (
                <p className="num text-xs text-fg-tertiary mt-1">{ds.stock_qty.toLocaleString()}개</p>
              )}
            </div>
            <div className="bg-surface rounded-md p-3 border border-border-subtle">
              <p className="text-2xs text-fg-quaternary mb-1">7일 매출 평균</p>
              <p className="num text-sm text-fg-primary">
                {ds.sales_avg_7d != null ? `${ds.sales_avg_7d}개/일` : "—"}
              </p>
              {ds.sales_yesterday != null && (
                <p className="num text-xs text-fg-tertiary mt-0.5">전일: {ds.sales_yesterday}개</p>
              )}
            </div>
          </div>

          {/* 메타 */}
          <div className="flex items-center justify-between text-xs text-fg-tertiary">
            <span>매칭 방법: {METHOD_META[match.match_method] ?? match.match_method}</span>
            <span className="font-mono">{match.detected_at.slice(0, 10)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 클라이언트 ─────────────────────────────────────────────────────────

interface Props {
  matches: MatchRow[];
  initialBrands: string[];
  initialScoreMin: number;
}

export function MatchesClient({ matches, initialBrands, initialScoreMin }: Props) {
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(
    new Set(initialBrands),
  );
  const [scoreMin, setScoreMin] = useState(initialScoreMin);
  const [modalMatch, setModalMatch] = useState<MatchRow | null>(null);

  function toggleBrand(slug: string) {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (selectedBrands.size && m.own_brand_slug && !selectedBrands.has(m.own_brand_slug)) {
        return false;
      }
      if (m.similarity_score < scoreMin) return false;
      return true;
    });
  }, [matches, selectedBrands, scoreMin]);

  // 데이터 없음
  if (!matches.length) {
    return (
      <div className="bg-surface border border-dashed border-border rounded-md py-20 flex flex-col items-center text-center">
        <p className="text-sm text-fg-tertiary mb-1">매칭 데이터 없음</p>
        <p className="text-xs text-fg-quaternary">
          단계 C 완료 후 worker.matchers.main --mode all 실행 시 결과가 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 필터 */}
      <div className="flex items-center gap-4 flex-wrap mb-5">
        {/* 브랜드 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-tertiary">자사 브랜드:</span>
          {OWN_BRANDS.map((b) => (
            <button
              key={b.slug}
              onClick={() => toggleBrand(b.slug)}
              className={cn(
                "px-2 py-1 rounded text-xs font-medium transition-colors",
                selectedBrands.size === 0 || selectedBrands.has(b.slug)
                  ? "bg-selected text-fg-primary"
                  : "bg-raised text-fg-quaternary hover:text-fg-secondary border border-border",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* 유사도 슬라이더 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-tertiary">유사도 임계:</span>
          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.05}
            value={scoreMin}
            onChange={(e) => setScoreMin(parseFloat(e.target.value))}
            className="w-24 accent-fg-primary"
          />
          <span className="text-xs font-mono text-fg-primary w-8">
            {Math.round(scoreMin * 100)}%
          </span>
        </div>

        <span className="text-xs text-fg-quaternary ml-auto">{filtered.length}건 표시</span>
      </div>

      {/* 테이블 */}
      <div className="bg-surface border border-border-subtle rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-hair">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-tertiary">자사 SKU</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-tertiary">브랜드</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-tertiary">경쟁 상품</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-fg-tertiary">유사도</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-tertiary">재고</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-fg-tertiary">가격 차</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-fg-tertiary">방법</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const ds = m.diff_summary ?? {};
              const priceDiff = ds.price_diff_krw;
              return (
                <tr
                  key={m.id}
                  onClick={() => setModalMatch(m)}
                  className="border-b border-border-hair last:border-0 hover:bg-hover cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-fg-primary">{m.own_sku_code ?? "—"}</p>
                    <p className="text-xs text-fg-tertiary truncate max-w-[140px]">
                      {m.own_sku_name ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-tertiary">
                    {m.own_brand_slug ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-fg-secondary truncate max-w-[180px]">
                      {m.own_sku_name ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={m.similarity_score} />
                  </td>
                  <td className="px-4 py-3">
                    <StockChip status={ds.stock_status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {priceDiff != null ? (
                      <span
                        className={cn(
                          "num text-xs",
                          priceDiff < 0 ? "text-trend-down" : "text-fg-tertiary",
                        )}
                      >
                        {priceDiff > 0 ? "+" : ""}
                        {priceDiff.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-fg-quaternary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-quaternary">
                    {METHOD_META[m.match_method] ?? m.match_method}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-fg-tertiary">
            필터 조건에 맞는 매칭 없음
          </div>
        )}
      </div>

      {/* 모달 */}
      {modalMatch && (
        <MatchModal match={modalMatch} onClose={() => setModalMatch(null)} />
      )}
    </>
  );
}
