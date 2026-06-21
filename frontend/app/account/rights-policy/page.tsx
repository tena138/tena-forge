import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ShieldAlert, Store } from "lucide-react";

import { Button } from "@/components/ui/button";

const policyItems = [
  {
    title: "업로드 가능",
    icon: CheckCircle2,
    text: "직접 제작한 자료, 우리 학원 내부 자료, 이용 허락을 받은 자료, 공개 이용 가능한 자료를 아카이빙할 수 있습니다.",
  },
  {
    title: "업로드 제한",
    icon: ShieldAlert,
    text: "시중 교재, 인강 교재, 타 학원 자료, 유료 문제집, 해설, 이미지, 도표 등을 권한 없이 문항화하는 것은 제한됩니다.",
  },
  {
    title: "판매 등록",
    icon: Store,
    text: "마켓플레이스 자료는 직접 제작했거나 판매·배포할 권리를 보유한 자료여야 합니다.",
  },
];

export default function RightsPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-[14px] bg-white p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Rights Policy</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-zinc-950">권리 및 업로드 정책</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-zinc-600">
              직접 제작했거나 이용 권한을 보유한 교육 자료만 문항 아카이브로 정리하고, 시험지·교재·워크북으로 재구성할 수 있습니다.
            </p>
          </div>
          <Link href="/archive/new" className="shrink-0">
            <Button className="w-full sm:w-auto">
              내 자료 아카이빙 시작
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {policyItems.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="rounded-[14px] bg-white p-5">
              <Icon className="h-5 w-5 text-zinc-950" />
              <h2 className="mt-4 text-lg font-bold text-zinc-950">{item.title}</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-600">{item.text}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-[14px] bg-white p-7 text-sm font-medium leading-7 text-zinc-700">
        <h2 className="text-lg font-bold text-zinc-950">확인 및 제한</h2>
        <p className="mt-2">
          Tena Forge는 문항 아이디어나 유형의 소유권을 판정하지 않습니다. 다만 신고 또는 확인 절차에 따라 자료의 노출, 판매, 이용을 제한할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
