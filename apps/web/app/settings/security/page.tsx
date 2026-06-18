import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Button, Card } from "@/components/ui";

export default function SecuritySettingsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Security" title="보안 설정" description="비밀번호, 세션, 접근 로그를 관리합니다.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-bold text-white">비밀번호 변경</h2>
            <div className="mt-4 space-y-3">
              {["현재 비밀번호", "새 비밀번호", "새 비밀번호 확인"].map((label) => <input key={label} className="h-10 w-full rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none" placeholder={label} type="password" />)}
              <Button>변경</Button>
            </div>
          </Card>
          <Card>
            <h2 className="font-bold text-white">활성 세션</h2>
            <p className="mt-3 text-sm text-neutral-400">Supabase Auth 세션과 감사 로그를 기반으로 기기 접근을 추적합니다.</p>
            <Button className="mt-5" variant="danger">다른 기기 로그아웃</Button>
          </Card>
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
