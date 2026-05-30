import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tena-forge.com"),
  title: "Tena Forge",
  applicationName: "Tena Forge",
  description: "PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=5", sizes: "any" },
      { url: "/icon-192.png?v=5", type: "image/png", sizes: "192x192" },
      { url: "/tenaforge-favicon.png?v=4", type: "image/png", sizes: "512x512" },
      { url: "/tenaforge-mark-dark.png?v=4", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico?v=5",
    apple: "/apple-touch-icon.png?v=5",
  },
  openGraph: {
    title: "Tena Forge",
    description: "PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.",
    url: "https://www.tena-forge.com",
    siteName: "Tena Forge",
    images: [
      {
        url: "/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "Tena Forge",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tena Forge",
    description: "PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.",
    images: ["/og-image.png?v=2"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>{children}</body>
    </html>
  );
}
