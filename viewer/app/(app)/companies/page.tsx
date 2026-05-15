// viewer/app/(app)/companies/page.tsx
// 98개 패션 회사 모니터링 화면
import { getCompanies } from "@/lib/queries";
import { CompaniesTable } from "@/components/radar/companies-table";
import { CompaniesControls } from "@/components/radar/companies-controls";
import { SectionCard } from "@/components/radar/section-card";

type Sort = "revenue" | "op_margin" | "today_active";
type Listing = "all" | "listed" | "unlisted";

interface PageProps {
  searchParams: Promise<{ sort?: string; listing?: string }>;
}

function isSort(v: string | undefined): v is Sort {
  return v === "revenue" || v === "op_margin" || v === "today_active";
}
function isListing(v: string | undefined): v is Listing {
  return v === "all" || v === "listed" || v === "unlisted";
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const { sort: sortParam, listing: listingParam } = await searchParams;
  const sort: Sort = isSort(sortParam) ? sortParam : "revenue";
  const listing: Listing = isListing(listingParam) ? listingParam : "all";

  const rows = await getCompanies({ sort, listing_type: listing });

  const totalCount = rows.length;
  const listedCount = rows.filter((r) => r.listing_type === "listed").length;
  const unlistedCount = rows.filter((r) => r.listing_type === "unlisted").length;
  const ownCount = rows.filter((r) => r.is_own).length;
  const todayActiveCount = rows.filter((r) => r.today_active_brands > 0).length;

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-[-0.02em]">
          회사 모니터링
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">
          패션 회사 {totalCount}개 · DART 2026.04 기준
        </p>
      </div>

      {/* 통계 카드 4종 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="총 회사" value={totalCount} />
        <StatCard label="상장사" value={listedCount} sub="코스피·코스닥" />
        <StatCard label="비상장" value={unlistedCount} />
        <StatCard
          label="오늘 활동"
          value={todayActiveCount}
          sub="브랜드 보유 기준"
          highlight={todayActiveCount > 0}
        />
      </div>

      {/* 컨트롤 */}
      <div className="mb-5">
        <CompaniesControls currentSort={sort} currentListing={listing} />
      </div>

      {/* 테이블 */}
      <SectionCard
        title="회사 목록"
        meta={`${totalCount}개`}
        bodyClassName="p-0"
      >
        <CompaniesTable rows={rows} sort={sort} />
      </SectionCard>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface border border-border-subtle rounded-md px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-2">
        {label}
      </p>
      <p
        className={
          highlight
            ? "text-2xl font-semibold num text-trend-up"
            : "text-2xl font-semibold num text-fg-primary"
        }
      >
        {value.toLocaleString()}
      </p>
      {sub && <p className="text-xs text-fg-quaternary mt-1">{sub}</p>}
    </div>
  );
}
