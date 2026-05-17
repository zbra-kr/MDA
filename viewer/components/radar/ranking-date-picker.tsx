// viewer/components/radar/ranking-date-picker.tsx
"use client";

import { useRouter } from "next/navigation";

interface Props {
  currentDate: string;
  maxDate: string;
  category?: string;
}

export function RankingDatePicker({ currentDate, maxDate, category }: Props) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = e.target.value;
    if (!d) return;
    const p = new URLSearchParams();
    if (category) p.set("category", category);
    if (d !== maxDate) p.set("date", d);
    const qs = p.toString();
    router.push(`/products/today${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-tertiary shrink-0">날짜</span>
      <input
        type="date"
        value={currentDate}
        max={maxDate}
        onChange={onChange}
        className="h-7 px-2 text-sm num rounded-md border border-border bg-canvas text-fg-primary focus:outline-none focus:ring-1 focus:ring-border-strong"
      />
    </div>
  );
}
