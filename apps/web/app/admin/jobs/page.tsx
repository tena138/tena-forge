import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Card } from "@/components/ui";

export default function AdminJobsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Admin" title="작업 모니터링" description="실패 작업 재시도와 큐 상태 점검을 위한 화면입니다.">
        <Card><div className="flex items-center justify-between rounded-[10px] border border-white/10 p-4 text-sm"><span className="text-white">No failed jobs</span><Badge tone="green">healthy</Badge></div></Card>
      </PageScaffold>
    </AppFrame>
  );
}
