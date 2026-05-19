import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function BookMarketPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[12px] border border-white/10 bg-black/45 p-6">
        <h1 className="text-3xl font-bold text-white">교재 마켓</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          공식 교재 마켓은 준비 중입니다. 향후 강사·학원·출판사가 직접 등록한 교재를 라이선스로 이용할 수 있습니다.
        </p>
      </section>
      <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-12 text-center">
        <p className="text-sm text-slate-400">교재, 워크북, 해설지 묶음 판매와 구독 구조를 위한 기반이 준비되어 있습니다.</p>
        <Link className="mt-5 inline-block" href="/marketplace">
          <Button variant="outline">마켓플레이스로 돌아가기</Button>
        </Link>
      </div>
    </div>
  );
}
