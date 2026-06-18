import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Button, Card } from "@/components/ui";

export default function AccountSettingsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Settings" title="계정 설정" description="개인 프로필과 알림 기본값을 관리합니다.">
        <Card className="max-w-2xl">
          <div className="space-y-4">
            <label className="block text-sm text-neutral-300">이름<input className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-white outline-none" /></label>
            <label className="block text-sm text-neutral-300">이메일<input className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-white outline-none" /></label>
            <Button>저장</Button>
          </div>
        </Card>
      </PageScaffold>
    </AppFrame>
  );
}
