// viewer/app/(app)/matches/page.tsx
// 자사 매칭 결과 페이지 (Phase 2.1 단계 F-3)
import { Suspense } from "react";
import { getMatches } from "@/lib/queries-anomaly";
import { MatchesClient } from "./matches-client";

interface PageProps {
  searchParams: Promise<{
    brand?: string;
    score?: string;
  }>;
}

export default async function MatchesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const brandSlugs = params.brand
    ? params.brand.split(",").filter(Boolean)
    : [];
  const scoreMin = params.score ? parseFloat(params.score) : 0.7;

  const matches = await getMatches({
    brand_slugs: brandSlugs.length ? brandSlugs : undefined,
    score_min:   scoreMin,
    limit:       500,
  });

  const lastUpdated = matches.length > 0
    ? matches.reduce((max, m) => (m.detected_at > max ? m.detected_at : max), "")
    : null;

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-display">
          자사 매칭
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">
          경쟁상품 ↔ 자사 SKU 벡터 유사도 매칭 결과 · {matches.length}건
          {lastUpdated && (
            <span className="ml-2 text-fg-quaternary">
              마지막 업데이트 {lastUpdated.slice(0, 10)}
            </span>
          )}
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-fg-tertiary">로딩 중...</div>}>
        <MatchesClient
          matches={matches}
          initialBrands={brandSlugs}
          initialScoreMin={scoreMin}
        />
      </Suspense>
    </main>
  );
}
