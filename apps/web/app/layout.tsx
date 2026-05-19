import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tena Forge",
  description: "Authorized teaching materials to structured archives and polished learning outputs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>{children}</body>
    </html>
  );
}
