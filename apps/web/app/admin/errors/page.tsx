import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Card } from "@/components/ui";

export default function AdminErrorsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Admin" title="오류 로그" description="API, 워커, 렌더링 오류를 추적합니다.">
        <Card><div className="flex items-center justify-between rounded-[10px] border border-white/10 p-4 text-sm"><span className="text-white">최근 오류 없음</span><Badge tone="green">clean</Badge></div></Card>
      </PageScaffold>
    </AppFrame>
  );
}
