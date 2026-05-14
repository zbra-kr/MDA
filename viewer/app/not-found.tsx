import Link from "next/link";
export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4">
      <p className="text-2xs font-mono uppercase tracking-wide text-fg-quaternary">
        404
      </p>
      <h1 className="text-2xl font-semibold text-fg-primary">
        페이지를 찾을 수 없습니다
      </h1>
      <Link
        href="/reports/today"
        className="text-sm text-fg-tertiary hover:text-fg-primary transition-colors"
      >
        오늘의 리포트로 →
      </Link>
    </div>
  );
}
