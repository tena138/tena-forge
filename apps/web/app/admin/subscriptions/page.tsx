import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Card } from "@/components/ui";

export default function AdminSubscriptionsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Admin" title="구독 관리" description="워크스페이스별 결제 상태와 플랜을 확인합니다.">
        <Card><div className="grid grid-cols-3 rounded-[10px] border border-white/10 p-4 text-sm"><span className="text-white">Sample Workspace</span><Badge tone="violet">pro</Badge><Badge tone="green">active</Badge></div></Card>
      </PageScaffold>
    </AppFrame>
  );
}
