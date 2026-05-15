// viewer/components/radar/companies-controls.tsx
// 회사 목록 정렬·필터 컨트롤 — 클라이언트 컴포넌트
"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Sort = "revenue" | "op_margin" | "today_active";
type Listing = "all" | "listed" | "unlisted";

interface Props {
  currentSort: Sort;
  currentListing: Listing;
}

export function CompaniesControls({ currentSort, currentListing }: Props) {
  const router = useRouter();

  function navigate(sort: Sort, listing: Listing) {
    const params = new URLSearchParams();
    if (sort !== "revenue") params.set("sort", sort);
    if (listing !== "all") params.set("listing", listing);
    const qs = params.toString();
    router.push(`/companies${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* 정렬 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-quaternary mr-1.5 font-medium uppercase tracking-wide">
          정렬
        </span>
        <ToggleBtn
          active={currentSort === "revenue"}
          onClick={() => navigate("revenue", currentListing)}
        >
          매출순
        </ToggleBtn>
        <ToggleBtn
          active={currentSort === "op_margin"}
          onClick={() => navigate("op_margin", currentListing)}
        >
          영업이익률
        </ToggleBtn>
        <ToggleBtn
          active={currentSort === "today_active"}
          onClick={() => navigate("today_active", currentListing)}
        >
          오늘 활동
        </ToggleBtn>
      </div>

      <div className="w-px h-5 bg-border-subtle" />

      {/* 상장구분 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-quaternary mr-1.5 font-medium uppercase tracking-wide">
          상장
        </span>
        <ToggleBtn
          active={currentListing === "all"}
          onClick={() => navigate(currentSort, "all")}
        >
          전체
        </ToggleBtn>
        <ToggleBtn
          active={currentListing === "listed"}
          onClick={() => navigate(currentSort, "listed")}
        >
          상장
        </ToggleBtn>
        <ToggleBtn
          active={currentListing === "unlisted"}
          onClick={() => navigate(currentSort, "unlisted")}
        >
          비상장
        </ToggleBtn>
      </div>
    </div>
  );
}

function ToggleBtn({
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
