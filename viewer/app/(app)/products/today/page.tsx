// viewer/app/(app)/products/today/page.tsx
// 오늘 수집된 상품 랭킹 — 카테고리별 필터 + 페이지네이션
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getProductsToday, getActiveCategories } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { ProductsTable } from "@/components/radar/products-table";
import { CategoryFilter } from "@/components/radar/category-filter";
import { SectionCard } from "@/components/radar/section-card";

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ category?: string; page?: string }>;
}

export default async function ProductsTodayPage({ searchParams }: PageProps) {
  const { category, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));
  const offset = (pageNum - 1) * PAGE_SIZE;

  const [categories, { rows, total }] = await Promise.all([
    getActiveCategories(),
    getProductsToday({ category_code: category, limit: PAGE_SIZE, offset }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-6 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-fg-primary tracking-[-0.02em]">
            오늘의 상품 랭킹
          </h1>
          <p className="text-sm text-fg-tertiary mt-1">
            {fmtDate(today)}
            {total > 0 && (
              <>
                {" · "}
                <span className="num">{total.toLocaleString()}</span>건 수집
              </>
            )}
          </p>
        </div>
        <CategoryFilter categories={categories} current={category} />
      </div>

      {/* 테이블 */}
      <SectionCard
        title="랭킹 목록"
        meta={
          total > 0
            ? `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} / ${total.toLocaleString()}`
            : undefined
        }
        bodyClassName="p-0"
      >
        <ProductsTable rows={rows} />
      </SectionCard>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          {pageNum > 1 ? (
            <PageLink href={buildHref(category, pageNum - 1)}>
              <ChevronLeft size={14} />
            </PageLink>
          ) : (
            <PageLinkDisabled>
              <ChevronLeft size={14} />
            </PageLinkDisabled>
          )}

          <span className="text-sm text-fg-secondary num">
            {pageNum} / {totalPages}
          </span>

          {pageNum < totalPages ? (
            <PageLink href={buildHref(category, pageNum + 1)}>
              <ChevronRight size={14} />
            </PageLink>
          ) : (
            <PageLinkDisabled>
              <ChevronRight size={14} />
            </PageLinkDisabled>
          )}
        </div>
      )}
    </main>
  );
}

function buildHref(category: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/products/today${qs ? `?${qs}` : ""}`;
}

function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-border text-fg-secondary hover:bg-hover hover:text-fg-primary transition-colors"
    >
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
