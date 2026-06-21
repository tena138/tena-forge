import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";

export default function BookMarketPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[12px] bg-white p-6">
        <h1 className="text-3xl font-bold tracking-normal text-zinc-950">교재 마켓</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">교재, 워크북, 답안지 묶음 상품을 준비 중입니다.</p>
      </section>
      <div className="rounded-[10px] bg-white p-12 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[12px] bg-zinc-100 text-zinc-600">
          <BookOpen className="h-7 w-7" />
        </div>
        <p className="text-sm font-semibold text-zinc-600">교재, 워크북, 답안지 묶음 판매와 구독 구조를 위한 기반이 준비되어 있습니다.</p>
        <Link className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15" href="/marketplace">
          마켓플레이스로 돌아가기
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
