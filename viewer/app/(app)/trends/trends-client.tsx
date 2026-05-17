"use client";
// viewer/app/(app)/trends/trends-client.tsx
// 이상탐지 목록 클라이언트 인터랙션: 필터·시계열 차트·카드 그리드·상세 모달

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X, ExternalLink, TrendingUp, DollarSign, Star, Zap, Tag, Heart, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AnomalyRow,
  AnomalyType,
  AnomalyTimeSeriesRow,
  AnomalyDetailRow,
} from "@/lib/queries-anomaly";

// ─── 상수 ───────────────────────────────────────────────────────────────────

const DETECTOR_META: Record<AnomalyType, { label: string; color: string; icon: React.ElementType }> = {
  rank_surge:      { label: "랭킹 급상승",       color: "bg-sev-high-subtle text-sev-high-fg",    icon: TrendingUp },
  price_change:    { label: "가격 변동",          color: "bg-sev-med-subtle  text-sev-med-fg",     icon: DollarSign },
  review_velocity: { label: "리뷰 폭증",          color: "bg-sev-high-subtle text-sev-high-fg",    icon: Star },
  new_entrant:     { label: "신규 진입",          color: "bg-raised border border-border text-fg-secondary", icon: Zap },
  promo_start:     { label: "프로모션 시작",      color: "bg-sev-med-subtle  text-sev-med-fg",     icon: Tag },
  wishlist_surge:  { label: "위시리스트 급증",    color: "bg-sev-low-subtle  text-sev-low-fg",     icon: Heart },
};

const ALL_TYPES: AnomalyType[] = [
  "rank_surge", "price_change", "review_velocity", "new_entrant", "promo_start", "wishlist_surge",
];

// ─── 서브 컴포넌트 ───────────────────────────────────────────────────────────

function SeverityBar({ value }: { value: number }) {
  const tier = value >= 0.7 ? "high" : value >= 0.4 ? "med" : "low";
  return (
    <div className="h-1 rounded-full bg-sunken overflow-hidden w-full">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.round(value * 100)}%`,
          background:
            tier === "high"
              ? "var(--sev-high-solid)"
              : tier === "med"
                ? "var(--sev-med-solid)"
                : "var(--sev-low-solid)",
        }}
      />
    </div>
  );
}

function AnomalyBadge({ type }: { type: AnomalyType }) {
  const meta = DETECTOR_META[type];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium",
        meta.color,
      )}
    >
      <Icon size={10} />
      {meta.label}
    </span>
  );
}

// ─── 시계열 미니 차트 ────────────────────────────────────────────────────────

function MiniTimeSeries({ data }: { data: AnomalyTimeSeriesRow[] }) {
  if (!data.length) return null;

  const dates = [...new Set(data.map((d) => d.detected_on))].sort();
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const byDate = new Map<string, Map<AnomalyType, number>>();
  for (const d of dates) byDate.set(d, new Map());
  for (const r of data) byDate.get(r.detected_on)?.set(r.anomaly_type, r.count);

  return (
    <div className="bg-surface border border-border-subtle rounded-md p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-fg-primary">탐지 추이</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {ALL_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-1 text-2xs text-fg-tertiary">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: typeColor(t) }}
              />
              {DETECTOR_META[t].label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-1 h-16">
        {dates.map((d) => {
          const typeMap = byDate.get(d)!;
          const total   = Array.from(typeMap.values()).reduce((s, v) => s + v, 0);
          const barH    = Math.round((total / maxCount) * 52);
          return (
            <div key={d} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm bg-sev-med-subtle"
                style={{ height: `${Math.max(barH, 2)}px` }}
                title={`${d}: ${total}건`}
              />
              <span className="text-2xs text-fg-quaternary font-mono" style={{ fontSize: 9 }}>
                {d.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function typeColor(t: AnomalyType): string {
  const map: Record<AnomalyType, string> = {
    rank_surge:      "oklch(65% 0.2 25)",
    price_change:    "oklch(70% 0.18 55)",
    review_velocity: "oklch(60% 0.22 25)",
    new_entrant:     "oklch(65% 0.06 70)",
    promo_start:     "oklch(70% 0.18 55)",
    wishlist_surge:  "oklch(65% 0.14 140)",
  };
  return map[t] ?? "oklch(60% 0.06 70)";
}

// ─── 상세 모달 ───────────────────────────────────────────────────────────────

function AnomalyModal({
  anomaly,
  onClose,
}: {
  anomaly: AnomalyRow;
  onClose: () => void;
}) {
  const ev = anomaly.evidence;
  const msNo = (ev as Record<string, unknown>)["musinsa_no"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-canvas border border-border-subtle rounded-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between p-5 border-b border-border-hair">
          <div>
            <AnomalyBadge type={anomaly.anomaly_type} />
            <h2 className="text-base font-semibold text-fg-primary mt-1.5">
              {anomaly.product_name ?? "—"}
            </h2>
            <p className="text-xs text-fg-tertiary mt-0.5">
              {anomaly.brand_name ?? "—"} · {anomaly.detected_on}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-hover text-fg-tertiary hover:text-fg-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {/* 심각도 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-fg-tertiary">심각도</span>
              <span className="text-xs font-mono text-fg-primary">
                {anomaly.severity.toFixed(2)}
              </span>
            </div>
            <SeverityBar value={anomaly.severity} />
          </div>

          {/* 가격 */}
          {anomaly.product_current_price && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-tertiary">현재가</span>
              <span className="num font-medium text-fg-primary">
                {anomaly.product_current_price.toLocaleString()}원
              </span>
            </div>
          )}

          {/* evidence */}
          <div className="bg-surface rounded-md p-3 text-xs font-mono text-fg-tertiary">
            <p className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1.5">탐지 근거</p>
            {Object.entries(ev).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-fg-quaternary">{k}:</span>
                <span>{String(v)}</span>
              </div>
            ))}
          </div>

          {/* 분석 여부 */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-tertiary">LLM 분석</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-2xs font-medium",
                anomaly.analyzed
                  ? "bg-trend-up/10 text-trend-up"
                  : "bg-sunken text-fg-quaternary",
              )}
            >
              {anomaly.analyzed ? "완료" : "대기 중"}
            </span>
          </div>

          {/* 연관 페이지 링크 */}
          <div className="flex flex-col gap-2 pt-1 border-t border-border-hair">
            <a
              href={`/anomalies/${anomaly.id}`}
              className="flex items-center gap-1.5 text-sm text-fg-tertiary hover:text-fg-primary transition-colors"
            >
              <ExternalLink size={13} />
              상세 분석 보기
            </a>
            {anomaly.brand_slug && (
              <>
                <Link
                  href={`/products/today?brand=${encodeURIComponent(anomaly.brand_slug)}`}
                  onClick={() => {}}
                  className="flex items-center gap-1.5 text-sm text-fg-tertiary hover:text-fg-primary transition-colors"
                >
                  <LayoutList size={13} />
                  랭킹에서 {anomaly.brand_name} 보기
                </Link>
                <Link
                  href={`/brands?slug=${encodeURIComponent(anomaly.brand_slug)}`}
                  className="flex items-center gap-1.5 text-sm text-fg-tertiary hover:text-fg-primary transition-colors"
                >
                  <TrendingUp size={13} />
                  브랜드 정보
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 클라이언트 컴포넌트 ────────────────────────────────────────────────

interface Props {
  anomalies: AnomalyRow[];
  timeSeries: AnomalyTimeSeriesRow[];
  dateFrom: string;
  dateTo: string;
  selectedTypes: AnomalyType[];
}

export function TrendsClient({ anomalies, timeSeries, dateFrom, dateTo, selectedTypes }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const [activeTypes, setActiveTypes] = useState<Set<AnomalyType>>(
    new Set(selectedTypes.length ? selectedTypes : []),
  );
  const [modalAnomaly, setModalAnomaly] = useState<AnomalyRow | null>(null);
  const [localFrom, setLocalFrom] = useState(dateFrom);
  const [localTo,   setLocalTo]   = useState(dateTo);

  const todayKST = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  function navigate(from: string, to: string, types: Set<AnomalyType>) {
    const p = new URLSearchParams();
    p.set("from", from);
    p.set("to", to);
    if (types.size) p.set("types", [...types].join(","));
    router.push(`${pathname}?${p.toString()}`);
  }

  // 필터 적용
  const filtered = useMemo(() => {
    if (!activeTypes.size) return anomalies;
    return anomalies.filter((a) => activeTypes.has(a.anomaly_type));
  }, [anomalies, activeTypes]);

  function toggleType(t: AnomalyType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const controls = (
    <>
      {/* 날짜 범위 선택 */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs text-fg-tertiary">기간:</span>
        <input
          type="date"
          value={localFrom}
          max={localTo}
          onChange={(e) => setLocalFrom(e.target.value)}
          className="bg-raised border border-border rounded px-2 py-1 text-xs font-mono text-fg-primary focus:outline-none focus:ring-1 focus:ring-border"
        />
        <span className="text-xs text-fg-quaternary">~</span>
        <input
          type="date"
          value={localTo}
          min={localFrom}
          max={todayKST}
          onChange={(e) => setLocalTo(e.target.value)}
          className="bg-raised border border-border rounded px-2 py-1 text-xs font-mono text-fg-primary focus:outline-none focus:ring-1 focus:ring-border"
        />
        <button
          onClick={() => navigate(localFrom, localTo, activeTypes)}
          className="px-3 py-1 rounded text-xs font-medium bg-fg-primary text-canvas hover:opacity-80 transition-opacity"
        >
          조회
        </button>
      </div>

      {/* 탐지자 필터 행 */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span className="text-xs text-fg-tertiary">탐지자:</span>
        {ALL_TYPES.map((t) => {
          const active = !activeTypes.size || activeTypes.has(t);
          const meta   = DETECTOR_META[t];
          const Icon   = meta.icon;
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                active
                  ? meta.color
                  : "bg-raised text-fg-quaternary border border-border hover:text-fg-secondary",
              )}
            >
              <Icon size={11} />
              {meta.label}
            </button>
          );
        })}
        {activeTypes.size > 0 && (
          <button
            onClick={() => setActiveTypes(new Set())}
            className="text-xs text-fg-quaternary hover:text-fg-primary ml-1"
          >
            초기화
          </button>
        )}
      </div>
    </>
  );

  // 데이터 없음 카드 (날짜 선택은 유지)
  if (!anomalies.length) {
    return (
      <>
        {controls}
        <div className="bg-surface border border-dashed border-border rounded-md py-16 flex flex-col items-center text-center">
          <p className="text-sm text-fg-tertiary mb-1">탐지 데이터 없음</p>
          <p className="text-xs text-fg-quaternary">
            해당 기간({localFrom} ~ {localTo})에 탐지된 이상 신호가 없습니다.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {controls}

      {/* 시계열 */}
      <MiniTimeSeries data={timeSeries} />

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((a) => (
          <AnomalyCard key={a.id} anomaly={a} onClick={() => setModalAnomaly(a)} />
        ))}
      </div>

      {/* 모달 */}
      {modalAnomaly && (
        <AnomalyModal anomaly={modalAnomaly} onClose={() => setModalAnomaly(null)} />
      )}
    </>
  );
}

// ─── 이상상품 카드 ───────────────────────────────────────────────────────────

function AnomalyCard({ anomaly, onClick }: { anomaly: AnomalyRow; onClick: () => void }) {
  const tier =
    anomaly.severity >= 0.7 ? "high" : anomaly.severity >= 0.4 ? "med" : "low";

  return (
    <button
      onClick={onClick}
      className="text-left bg-surface border border-border-subtle rounded-md p-4 hover:border-border hover:bg-hover transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <AnomalyBadge type={anomaly.anomaly_type} />
        <span
          className={cn(
            "text-xs font-mono px-1.5 py-0.5 rounded",
            tier === "high"
              ? "bg-sev-high-subtle text-sev-high-fg"
              : tier === "med"
                ? "bg-sev-med-subtle text-sev-med-fg"
                : "bg-sev-low-subtle text-sev-low-fg",
          )}
        >
          {anomaly.severity.toFixed(2)}
        </span>
      </div>

      <p className="text-xs text-fg-quaternary mb-1 truncate">{anomaly.brand_name ?? "—"}</p>
      <p className="text-sm font-medium text-fg-primary mb-2 line-clamp-2">
        {anomaly.product_name ?? "—"}
      </p>

      {/* 가격 */}
      {anomaly.product_current_price && (
        <p className="text-xs text-fg-tertiary mb-3">
          <span className="num text-fg-primary">
            {anomaly.product_current_price.toLocaleString()}
          </span>
          원
        </p>
      )}

      <SeverityBar value={anomaly.severity} />

      <p className="text-2xs text-fg-quaternary font-mono mt-2">{anomaly.detected_on}</p>
    </button>
  );
}
