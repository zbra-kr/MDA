// viewer/app/(app)/_placeholder.tsx
// Phase 3+ 화면용 공용 플레이스홀더.
import { Construction } from "lucide-react";

export function PhasePlaceholder({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <main className="max-w-[1280px] mx-auto px-10 py-10">
      <div className="bg-surface border border-dashed border-border rounded-md py-20 flex flex-col items-center text-center">
        <div className="w-10 h-10 rounded-md bg-raised border border-border-subtle flex items-center justify-center mb-4">
          <Construction size={18} className="text-fg-tertiary" />
        </div>
        <h2 className="text-lg font-semibold text-fg-primary mb-1.5">{title}</h2>
        <p className="text-sm text-fg-tertiary max-w-sm">{desc}</p>
        <p className="mt-4 text-2xs font-mono uppercase tracking-wide text-fg-quaternary">
          Phase 3+ 로드맵
        </p>
      </div>
    </main>
  );
}
