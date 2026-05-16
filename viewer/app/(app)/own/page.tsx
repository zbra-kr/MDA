// viewer/app/(app)/own/page.tsx
// 자사 운영 현황 — 자사 Brand 11개 카드 + placeholder 3개
import { AlertTriangle } from "lucide-react";
import { getOwnBrandsData } from "@/lib/queries-dashboard";
import { SectionCard } from "@/components/radar/section-card";

function initials(name: string): string {
  // 한글 brand 명: 앞 2자, 영문: 앞 2자 대문자
  return name.slice(0, 2).toUpperCase();
}

const TIER_LABEL: Record<string, string> = {
  저가: "저가",
  중가: "중가",
  프리미엄: "Premium",
  럭셔리: "Luxury",
};

const TIER_COLOR: Record<string, string> = {
  저가: "text-fg-quaternary",
  중가: "text-fg-tertiary",
  프리미엄: "text-sev-med-fg",
  럭셔리: "text-sev-high-fg",
};

export default async function OwnPage() {
  const brands = await getOwnBrandsData();

  // 주간 평균 랭킹 오름차순 (null 뒤로), 그 다음 이름순
  const sorted = [...brands].sort((a, b) => {
    if (a.avg_rank_week == null && b.avg_rank_week == null)
      return a.name.localeCompare(b.name, "ko");
    if (a.avg_rank_week == null) return 1;
    if (b.avg_rank_week == null) return -1;
    return a.avg_rank_week - b.avg_rank_week;
  });

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="pb-8 mb-8 border-b border-border-subtle">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-tertiary mb-2">
          자사 운영
        </p>
        <h1 className="text-4xl font-semibold text-fg-primary tracking-display">
          자사 운영 현황
        </h1>
        <p className="text-sm text-fg-tertiary mt-2">
          is_own Brand · {brands.length}개 · 무신사 최근 7일 평균 순위
        </p>
      </div>

      {/* Brand 카드 그리드 */}
      <section className="mb-10">
        <h2 className="text-md font-semibold text-fg-primary mb-5">Brand 현황</h2>
        {brands.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-md p-8 text-center">
            <p className="text-sm text-fg-quaternary">
              자사 Brand 데이터가 없습니다 — 브랜드 설정 후 자동으로 표시됩니다
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {sorted.map((b) => (
              <div
                key={b.id}
                className="bg-surface border border-border-subtle rounded-md p-5 flex flex-col gap-4 hover:border-border transition-colors"
              >
                {/* Brand 헤더 */}
                <div className="flex items-center gap-3">
                  {/* 이니셜 아바타 (로고 없음) */}
                  <div className="w-10 h-10 rounded bg-raised flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold font-mono text-fg-tertiary">
                      {initials(b.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-fg-primary truncate">{b.name}</div>
                    {b.brand_category && (
                      <div className="text-xs text-fg-tertiary truncate">{b.brand_category}</div>
                    )}
                  </div>
                  {b.price_tier && (
                    <span
                      className={`text-2xs font-mono shrink-0 ${TIER_COLOR[b.price_tier] ?? "text-fg-quaternary"}`}
                    >
                      {TIER_LABEL[b.price_tier] ?? b.price_tier}
                    </span>
                  )}
                </div>

                {/* 지표 2개 */}
                <div className="grid grid-cols-2 gap-px bg-border-hair border border-border-hair rounded overflow-hidden">
                  <div className="bg-sunken px-4 py-3">
                    <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                      주간 평균 순위
                    </div>
                    <div className="text-2xl font-semibold num text-fg-primary">
                      {b.avg_rank_week != null
                        ? b.avg_rank_week.toLocaleString()
                        : "—"}
                    </div>
                    {b.avg_rank_week != null && (
                      <div className="text-2xs text-fg-quaternary mt-0.5">위</div>
                    )}
                  </div>
                  <div className="bg-sunken px-4 py-3">
                    <div className="text-2xs uppercase tracking-wide text-fg-quaternary mb-1">
                      무신사 SKU
                    </div>
                    <div className="text-2xl font-semibold num text-fg-primary">
                      {b.sku_count.toLocaleString()}
                    </div>
                    <div className="text-2xs text-fg-quaternary mt-0.5">개</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 랭킹 추이 placeholder */}
      <SectionCard
        title="자사 Brand 평균 랭킹 추이"
        meta="최근 30일 라인 차트"
        className="mb-6"
      >
        <PlaceholderBanner message="5/22 이후 자동 채워집니다 — 이상탐지 알고리즘 데이터 누적 중" />
      </SectionCard>

      {/* 가격 변동 placeholder */}
      <SectionCard
        title="자사 Brand 가격 변동"
        meta="SKU별 가격 추이 테이블"
        className="mb-6"
      >
        <PlaceholderBanner message="5/22 이후 자동 채워집니다 — 스냅샷 7일분 확보 후 활성화" />
      </SectionCard>

      {/* 매출 채널 placeholder */}
      <SectionCard title="매출 채널별 분해" meta="Snowflake ERP 연동">
        <PlaceholderBanner message="Snowflake 연결 후 가용 — AX 위원회 결정 이후 단계" />
      </SectionCard>
    </main>
  );
}

function PlaceholderBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <AlertTriangle size={14} className="text-sev-med-fg shrink-0 mt-0.5" />
      <p className="text-sm text-fg-tertiary">{message}</p>
    </div>
  );
}
