// viewer/components/radar/auth-logo.tsx
// auth 페이지 공통 로고 헤더 — 다크/라이트 워드마크 자동 전환.
export function AuthLogo() {
  return (
    <div className="text-center mb-8">
      {/* globals.css .wordmark 패턴: dark/light 클래스로 테마별 전환 */}
      <div className="wordmark mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bcave-wordmark-w.png"
          alt="B.CAVE"
          className="dark h-8 mx-auto"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bcave-wordmark.png"
          alt="B.CAVE"
          className="light h-8 mx-auto"
        />
      </div>
      <p className="text-sm text-fg-tertiary tracking-wide">
        Competitor Radar
      </p>
    </div>
  );
}
