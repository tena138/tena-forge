import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

const plans = [
  ["Free", "3 jobs", "30 pages", "100MB", "watermark"],
  ["Pro", "100 jobs", "1,000 pages", "5GB", "custom templates"],
  ["Team", "500 jobs", "10,000 pages", "50GB", "members"],
  ["Enterprise", "custom", "custom", "custom", "contract"]
];

export default function BillingPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Billing" title="구독 및 사용량" description="플랜, 인보이스, 사용량, 구독 변경을 관리합니다. 개발 환경은 mock billing provider를 사용합니다.">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <Badge tone="violet">현재 플랜</Badge>
            <h2 className="mt-4 text-3xl font-bold text-white">Pro trial</h2>
            <p className="mt-2 text-sm text-neutral-400">이번 달 작업 0 / 100, 페이지 0 / 1,000</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[8%] rounded-full bg-white" /></div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map(([name, jobs, pages, storage, feature]) => (
              <Card key={name}>
                <h3 className="text-xl font-bold text-white">{name}</h3>
                <p className="mt-3 text-sm text-neutral-400">{jobs} / {pages} / {storage}</p>
                <p className="mt-2 text-sm text-neutral-500">{feature}</p>
                <Button className="mt-5 w-full" variant={name === "Pro" ? "primary" : "secondary"}>{name === "Pro" ? "현재 플랜" : "변경"}</Button>
              </Card>
            ))}
          </div>
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
