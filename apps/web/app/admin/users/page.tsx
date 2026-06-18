import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Card } from "@/components/ui";

export default function AdminUsersPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Admin" title="사용자 관리" description="역할, 가입일, 정지 상태를 확인합니다.">
        <Card><div className="rounded-[10px] border border-white/10"><div className="grid grid-cols-3 p-4 text-sm text-neutral-400"><span>Email</span><span>Role</span><span>Status</span></div><div className="grid grid-cols-3 border-t border-white/10 p-4 text-sm"><span className="text-white">admin@tenaforge.com</span><Badge tone="violet">admin</Badge><Badge tone="green">active</Badge></div></div></Card>
      </PageScaffold>
    </AppFrame>
  );
}
