import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

export default function MembersSettingsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Members" title="팀 멤버" description="소유자, 관리자, 멤버, 뷰어 권한을 관리합니다.">
        <Card>
          <div className="mb-4 flex justify-between gap-3">
            <input className="h-10 flex-1 rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none" placeholder="초대할 이메일" />
            <Button>초대</Button>
          </div>
          <div className="rounded-[10px] border border-white/10">
            {["owner@tenaforge.com", "member@tenaforge.com"].map((email, index) => (
              <div key={email} className="flex items-center justify-between border-b border-white/10 p-4 text-sm last:border-b-0">
                <span className="text-slate-200">{email}</span>
                <Badge tone={index === 0 ? "violet" : "neutral"}>{index === 0 ? "owner" : "member"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </PageScaffold>
    </AppFrame>
  );
}
