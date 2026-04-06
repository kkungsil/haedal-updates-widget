import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🦦 해달집 위젯",
  description: "최근 업데이트된 해달집 페이지 목록",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
