import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Card, Stat } from "@/components/ui";
import { Activity, Database, FileText, Sparkles } from "lucide-react";

export default function AdminUsagePage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Admin" title="사용량 분석" description="월간 작업량, 페이지, AI 토큰, 스토리지 비용을 확인합니다.">
        <div className="grid gap-4 md:grid-cols-4">
          <Stat icon={Activity} label="Jobs" value="-" detail="이번 달" />
          <Stat icon={FileText} label="Pages" value="-" detail="이번 달" />
          <Stat icon={Sparkles} label="AI tokens" value="-" detail="추정" />
          <Stat icon={Database} label="Storage" value="-" detail="전체" />
        </div>
        <Card className="mt-4"><p className="text-sm text-slate-400">CSV 내보내기와 비용 상세 분석은 billing provider 연결 후 활성화됩니다.</p></Card>
      </PageScaffold>
    </AppFrame>
  );
}
