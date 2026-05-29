import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tena-forge.com"),
  title: "Tena Forge",
  icons: {
    icon: [
      { url: "/favicon.ico?v=5", sizes: "any" },
      { url: "/icon-192.png?v=5", type: "image/png", sizes: "192x192" },
      { url: "/tenaforge-favicon.png?v=5", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico?v=5",
    apple: "/apple-touch-icon.png?v=5",
  },
  description: "PDF 추출, 문제 DB, 수업 자료 제작을 한 흐름으로 묶는 교육 콘텐츠 제작 환경입니다.",
  openGraph: {
    title: "Tena Forge",
    description: "PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.",
    url: "https://www.tena-forge.com",
    siteName: "Tena Forge",
    images: [{ url: "/og-image.png?v=1", width: 1200, height: 630, alt: "Tena Forge" }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tena Forge",
    description: "PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.",
    images: ["/og-image.png?v=1"],
  },
};

const themeInitScript = `
(() => {
  try {
    const theme = localStorage.getItem("tena-forge-theme") === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.classList.add("dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
