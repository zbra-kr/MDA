// viewer/app/(app)/insights/manage/page.tsx
// Phase 1.9 — 회사-Brand 매핑 관리 운영 도구.
// 데이터: anon read (getManageCompanies, getManageBrands, getMediumConfidenceBrands)
// 쓰기: actions.ts (service_role, "use server")

import Link from "next/link";
import {
  getManageCompanies,
  getManageBrands,
  getMediumConfidenceBrands,
} from "@/lib/queries-insights";
import { SectionCard } from "@/components/radar/section-card";
import { BrandPanel } from "./_components/brand-panel";
import { ConflictBrandList } from "./_components/conflict-brand-list";

interface PageProps {
  searchParams: Promise<{ company?: string; tab?: string }>;
}

export default async function ManagePage({ searchParams }: PageProps) {
  const { company: selectedId, tab } = await searchParams;
  const activeTab = tab === "conflicts" ? "conflicts" : "brands";

  const [companies, conflicts] = await Promise.all([
    getManageCompanies(),
    activeTab === "conflicts" ? getMediumConfidenceBrands() : Promise.resolve([]),
  ]);

  const selectedCompany = selectedId ? companies.find((c) => c.id === selectedId) : null;
  const brands =
    activeTab === "brands" && selectedId ? await getManageBrands(selectedId) : [];

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-display mb-1">
          매핑 관리
        </h1>
        <p className="text-sm text-fg-tertiary">
          회사별 Brand 매핑 정정 · 추가 · 제거 (actor: 정호철)
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-0 border-b border-border-hair mb-6">
        {[
          { key: "brands", label: "브랜드 매핑" },
          { key: "conflicts", label: `충돌 검토` },
        ].map(({ key, label }) => {
          const href =
            key === "brands"
              ? `/insights/manage${selectedId ? `?company=${selectedId}` : ""}`
              : `/insights/manage?tab=conflicts`;
          const active = activeTab === key;
          return (
            <Link
              key={key}
              href={href}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                active
                  ? "border-fg-primary text-fg-primary"
                  : "border-transparent text-fg-tertiary hover:text-fg-secondary"
              }`}
            >
              {label}
              {key === "conflicts" && conflicts.length > 0 && (
                <span className="ml-1.5 text-2xs font-mono px-1 py-px rounded-full bg-chart-3/20 text-chart-3">
                  {conflicts.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {activeTab === "conflicts" ? (
        /* ── 충돌 검토 탭 ────────────────────────────────── */
        <SectionCard
          title="medium-confidence 브랜드"
          meta={`${conflicts.length}건`}
          bodyClassName="p-4"
        >
          <ConflictBrandList brands={conflicts} />
        </SectionCard>
      ) : (
        /* ── 브랜드 매핑 탭 ──────────────────────────────── */
        <div className="grid grid-cols-[280px_1fr] gap-6">
          {/* 회사 목록 */}
          <div className="border border-border-subtle rounded-md overflow-hidden bg-surface">
            <div className="px-4 py-3 border-b border-border-hair bg-sunken">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-quaternary">회사</p>
            </div>
            <ul className="overflow-y-auto max-h-[calc(100vh-280px)]">
              {companies.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/insights/manage?company=${c.id}`}
                      className={`flex items-center justify-between px-4 py-2.5 border-b border-border-hair last:border-0 transition-colors text-sm ${
                        active
                          ? "bg-chart-1/10 text-fg-primary"
                          : "hover:bg-hover text-fg-secondary"
                      }`}
                    >
                      <span className="truncate">
                        {c.name}
                        {c.is_own && (
                          <span className="ml-1.5 text-2xs font-mono px-1 py-px rounded-sm bg-house/20 text-house-soft border border-house/30">
                            자사
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-mono text-fg-quaternary ml-2">
                        {c.brand_count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 브랜드 패널 */}
          <div>
            {!selectedCompany ? (
              <div className="flex items-center justify-center h-40 border border-border-subtle rounded-md text-sm text-fg-quaternary">
                왼쪽에서 회사를 선택하세요.
              </div>
            ) : (
              <SectionCard
                title={selectedCompany.name}
                meta={`총 ${selectedCompany.brand_count}개`}
                bodyClassName="p-4"
              >
                <BrandPanel
                  brands={brands}
                  companyId={selectedCompany.id}
                  companyName={selectedCompany.name}
                />
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
