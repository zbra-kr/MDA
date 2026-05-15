// viewer/app/(app)/brands/page.tsx
// 브랜드 목록 + is_competitor 토글
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getBrands } from "@/lib/queries";
import { BrandsTable } from "@/components/radar/brands-table";
import { BrandsControls } from "@/components/radar/brands-controls";
import { SectionCard } from "@/components/radar/section-card";

type Filter = "all" | "competitor" | "own" | "unreviewed" | "today_active";
type Sort   = "today_products" | "name" | "created";

function isFilter(v: string | undefined): v is Filter {
  return ["all","competitor","own","unreviewed","today_active"].includes(v ?? "");
}
function isSort(v: string | undefined): v is Sort {
  return ["today_products","name","created"].includes(v ?? "");
}

interface PageProps {
  searchParams: Promise<{ filter?: string; sort?: string; page?: string }>;
}

const PAGE_SIZE = 50;

export default async function BrandsPage({ searchParams }: PageProps) {
  const { filter: fp, sort: sp, page: pp } = await searchParams;
  const filter: Filter = isFilter(fp) ? fp : "all";
  const sort: Sort     = isSort(sp)   ? sp  : "today_products";
  const page           = Math.max(1, Number(pp ?? 1));

  const { rows, total, stats } = await getBrands({ filter, sort, page });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-[-0.02em]">
          브랜드 관리
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">
          총 {stats.total.toLocaleString()}개 브랜드 · 경쟁사 토글로 모니터링 대상 지정
        </p>
      </div>

      {/* 통계 카드 5종 */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        <StatCard label="전체 브랜드"  value={stats.total} />
        <StatCard label="경쟁사"        value={stats.competitors} highlight />
        <StatCard label="자사"          value={stats.own} />
        <StatCard label="미검토 (7일)" value={stats.unreviewed} warn={stats.unreviewed > 0} />
        <StatCard label="오늘 활동"    value={stats.today_active} />
      </div>

      {/* 컨트롤 */}
      <div className="mb-5">
        <BrandsControls currentFilter={filter} currentSort={sort} stats={stats} />
      </div>

      {/* 테이블 */}
      <SectionCard
        title="브랜드 목록"
        meta={total > 0 ? `${rangeStart}–${rangeEnd} / ${total}` : undefined}
        bodyClassName="p-0"
      >
        <BrandsTable rows={rows} />
      </SectionCard>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          {page > 1 ? (
            <PageLink href={buildHref(filter, sort, page - 1)}>
              <ChevronLeft size={14} />
            </PageLink>
          ) : (
            <PageLinkDisabled><ChevronLeft size={14} /></PageLinkDisabled>
          )}
          <span className="text-sm text-fg-secondary num">{page} / {totalPages}</span>
          {page < totalPages ? (
            <PageLink href={buildHref(filter, sort, page + 1)}>
              <ChevronRight size={14} />
            </PageLink>
          ) : (
            <PageLinkDisabled><ChevronRight size={14} /></PageLinkDisabled>
          )}
        </div>
      )}
    </main>
  );
}

function buildHref(filter: Filter, sort: Sort, page: number): string {
  const p = new URLSearchParams();
  if (filter !== "all")          p.set("filter", filter);
  if (sort !== "today_products") p.set("sort", sort);
  if (page > 1)                  p.set("page", String(page));
  const qs = p.toString();
  return `/brands${qs ? `?${qs}` : ""}`;
}

function StatCard({
  label, value, highlight, warn,
}: { label: string; value: number; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-md px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary mb-2">{label}</p>
      <p className={
        warn      ? "text-2xl font-semibold num text-sev-high-fg" :
        highlight ? "text-2xl font-semibold num text-trend-up" :
                    "text-2xl font-semibold num text-fg-primary"
      }>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-border text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors">
      {children}
    </Link>
  );
}
function PageLinkDisabled({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-border-hair text-fg-quaternary cursor-not-allowed">
      {children}
    </span>
  );
}
