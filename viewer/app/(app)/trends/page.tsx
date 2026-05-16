// viewer/app/(app)/trends/page.tsx
// 이상탐지 목록 (Phase 2.1 단계 F-2)
import { Suspense } from "react";
import { getAnomalies, getAnomalyTimeSeries } from "@/lib/queries-anomaly";
import type { AnomalyType } from "@/lib/queries-anomaly";
import { TrendsClient } from "./trends-client";

interface PageProps {
  searchParams: Promise<{
    types?: string;
    from?: string;
    to?: string;
    brand?: string;
  }>;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);

  const dateFrom = params.from ?? fourteenDaysAgo;
  const dateTo   = params.to   ?? today;

  const selectedTypes = params.types
    ? (params.types.split(",").filter(Boolean) as AnomalyType[])
    : [];

  const [anomalies, timeSeries] = await Promise.all([
    getAnomalies({
      detector_types: selectedTypes.length ? selectedTypes : undefined,
      date_from:      dateFrom,
      date_to:        dateTo,
      limit:          300,
    }),
    getAnomalyTimeSeries(dateFrom, dateTo),
  ]);

  // 마지막 업데이트 날짜
  const lastUpdated = anomalies.length > 0
    ? anomalies.reduce((max, a) => (a.detected_on > max ? a.detected_on : max), "")
    : null;

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg-primary tracking-display">
            이상상품 탐지
          </h1>
          <p className="text-sm text-fg-tertiary mt-1">
            {dateFrom} ~ {dateTo} · {anomalies.length}건
            {lastUpdated && (
              <span className="ml-2 text-fg-quaternary">
                마지막 업데이트 {lastUpdated}
              </span>
            )}
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-fg-tertiary">로딩 중...</div>}>
        <TrendsClient
          anomalies={anomalies}
          timeSeries={timeSeries}
          dateFrom={dateFrom}
          dateTo={dateTo}
          selectedTypes={selectedTypes}
        />
      </Suspense>
    </main>
  );
}
