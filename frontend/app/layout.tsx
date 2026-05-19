import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tena Forge",
  icons: {
    icon: [{ url: "/tenaforge-favicon.png?v=3", type: "image/png", sizes: "512x512" }],
    shortcut: "/tenaforge-favicon.png?v=3",
    apple: "/tenaforge-favicon.png?v=3",
  },
  description: "PDF 추출, 문제 DB, 수업 자료 제작을 한 흐름으로 묶는 교육 콘텐츠 제작 환경입니다.",
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
