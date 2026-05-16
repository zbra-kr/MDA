// viewer/app/(app)/insights/categories/page.tsx
// 카테고리 트렌드 페이지 (서버 fetch → 클라이언트 UI)
import { getCategoryData } from "@/lib/queries-insights";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesPage() {
  const brands = await getCategoryData();
  const withCat = brands.filter((b) => b.brand_category != null);

  const catCounts = new Map<string, number>();
  for (const b of withCat) {
    if (b.brand_category) catCounts.set(b.brand_category, (catCounts.get(b.brand_category) ?? 0) + 1);
  }

  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-fg-primary tracking-display">
          카테고리 트렌드
        </h1>
        <p className="text-sm text-fg-tertiary mt-1">
          LLM 분류 brand {withCat.length}개 · {catCounts.size}개 카테고리
        </p>
      </div>

      <CategoriesClient brands={withCat} />
    </main>
  );
}
