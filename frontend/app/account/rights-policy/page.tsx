import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function RightsPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[12px] border border-white/10 bg-black/45 p-6">
        <h1 className="text-3xl font-bold text-white">권리 및 업로드 정책</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Tena Forge는 사용자가 직접 제작했거나 이용 권한을 보유한 교육 자료를 문항 아카이브로 정리하고, 시험지·교재·워크북으로 재구성하는 AI 제작 공간입니다.
        </p>
      </section>
      <section className="space-y-4 rounded-[10px] border border-white/10 bg-white/[0.045] p-6 text-sm leading-7 text-slate-300">
        <h2 className="text-lg font-bold text-white">업로드 가능한 자료</h2>
        <p>직접 제작한 자료, 우리 학원 내부 자료, 이용 허락을 받은 자료, 공개 이용 가능한 자료를 아카이빙할 수 있습니다.</p>
        <h2 className="text-lg font-bold text-white">제한되는 자료</h2>
        <p>시중 교재, 인강 교재, 타 학원 자료, 유료 문제집, 해설, 이미지, 도표 등을 권한 없이 업로드하거나 문항화하여 사용하는 것은 제한됩니다.</p>
        <h2 className="text-lg font-bold text-white">마켓플레이스 등록</h2>
        <p>마켓플레이스에 등록하는 자료는 직접 제작했거나 판매·배포할 권리를 보유한 자료여야 합니다. Tena Forge는 문항 아이디어나 유형의 소유권을 판정하지 않으며, 신고 또는 확인 절차에 따라 자료의 노출·판매·이용을 제한할 수 있습니다.</p>
        <Link href="/archive/new"><Button>내 자료 아카이빙 시작</Button></Link>
      </section>
    </div>
  );
}
