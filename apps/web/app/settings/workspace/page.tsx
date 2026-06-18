import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Button, Card } from "@/components/ui";

export default function WorkspaceSettingsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Workspace" title="워크스페이스 설정" description="팀 이름, 기본 저장소, 감사 로그 정책을 관리합니다.">
        <Card className="max-w-2xl">
          <label className="block text-sm text-neutral-300">워크스페이스 이름<input className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-white outline-none" /></label>
          <Button className="mt-5">저장</Button>
        </Card>
      </PageScaffold>
    </AppFrame>
  );
}
