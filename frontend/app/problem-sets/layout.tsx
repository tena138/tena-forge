import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "내 자료 세트 | Tena Forge",
  description: "아카이브된 문항을 묶어 자료 세트를 관리합니다.",
};

export default function ProblemSetsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

