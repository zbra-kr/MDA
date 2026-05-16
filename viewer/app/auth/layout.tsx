// viewer/app/auth/layout.tsx
// 인증 전용 레이아웃 — AppBar 없음, 중앙 정렬 카드.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      {children}
    </div>
  );
}
