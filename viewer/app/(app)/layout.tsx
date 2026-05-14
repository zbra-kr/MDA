// viewer/app/(app)/layout.tsx
import { AppBar } from "@/components/radar/app-bar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <AppBar />
      {children}
      <footer className="max-w-[1280px] mx-auto px-10 py-7 mt-26 border-t border-border-subtle flex justify-between text-2xs font-mono uppercase tracking-wide text-fg-quaternary">
        <span>B.CAVE Competitor Radar</span>
        <span>radar.tokens v0.3 · AI 생성 분석 포함</span>
      </footer>
    </div>
  );
}
