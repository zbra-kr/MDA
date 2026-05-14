// viewer/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";

// 폰트(Pretendard Variable + JetBrains Mono)는 app/globals.css 상단의
// CDN @import로 로드된다. next/font 대신 CDN을 쓰는 이유:
//  - tokens.css가 --font-sans/--font-mono CSS 변수를 이미 정의
//  - 사내망/제한 네트워크에서 빌드 시 next/font의 빌드타임 패치 실패 회피
// 프로덕션에서 자체 호스팅을 원하면 woff2를 public/fonts에 두고
// globals.css의 @import를 @font-face로 교체.

export const metadata: Metadata = {
  title: "B.CAVE Competitor Radar",
  description: "무신사 경쟁브랜드 모니터링 · 일일 전략 리포트",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="radar-theme-v3"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
