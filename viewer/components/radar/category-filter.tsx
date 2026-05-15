// viewer/components/radar/category-filter.tsx
// 카테고리 필터 버튼 그룹 — 클라이언트 컴포넌트 (router.push 사용)
"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CategoryRow } from "@/lib/queries";

interface Props {
  categories: CategoryRow[];
  current?: string;
}

export function CategoryFilter({ categories, current }: Props) {
  const router = useRouter();

  function navigate(code: string | undefined) {
    if (code) {
      router.push(`/products/today?category=${code}`);
    } else {
      router.push("/products/today");
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <FilterBtn
        active={!current}
        onClick={() => navigate(undefined)}
      >
        전체
      </FilterBtn>
      {categories.map((c) => (
        <FilterBtn
          key={c.musinsa_code}
          active={current === c.musinsa_code}
          onClick={() => navigate(c.musinsa_code)}
        >
          {c.name_kr}
        </FilterBtn>
      ))}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-3 text-sm rounded-md border transition-colors",
        active
          ? "border-fg-primary bg-fg-primary text-fg-inverse"
          : "border-border text-fg-secondary hover:bg-hover hover:text-fg-primary",
      )}
    >
      {children}
    </button>
  );
}
