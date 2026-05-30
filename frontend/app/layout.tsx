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
  description: "가장 강력한 교육 컨텐츠 툴",
  openGraph: {
    title: "Tena Forge",
    description: "가장 강력한 교육 컨텐츠 툴",
    url: "https://www.tena-forge.com",
    siteName: "Tena Forge",
    images: [{ url: "/og-image.png?v=4", width: 1200, height: 630, alt: "Tena Forge" }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tena Forge",
    description: "가장 강력한 교육 컨텐츠 툴",
    images: ["/og-image.png?v=4"],
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
