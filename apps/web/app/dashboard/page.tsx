import { Activity, Archive, FileUp, LayoutTemplate, Sparkles } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { Button, Card, Stat, Badge } from "@/components/ui";

export default function DashboardPage() {
  return (
    <AppFrame>
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Badge tone="violet">Private Studio</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.03em] text-white">권리 있는 교육 자료를 문항 아카이브로, 완성된 교재로.</h1>
          <p className="mt-3 max-w-3xl text-slate-400">직접 제작했거나 이용 권한을 보유한 자료를 정리하고, 시험지·워크북·교재로 재구성하세요.</p>
        </div>
        <div className="flex gap-3">
          <Button href="/upload">내 자료 아카이빙 시작</Button>
          <Button href="/archive" variant="secondary">문항 검토</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Archive} label="전체 아카이브" value="-" detail="워크스페이스 기준" />
        <Stat icon={Sparkles} label="검토 대기" value="-" detail="AI 추출 후 확인 필요" />
        <Stat icon={LayoutTemplate} label="활성 템플릿" value="5" detail="기본 제공 포함" />
        <Stat icon={Activity} label="이번 달 사용량" value="0%" detail="구독 한도 대비" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="text-lg font-bold text-white">다음 작업</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">새 자료를 업로드해 처리 작업을 만들거나, 추출된 문항을 검토해 출력 가능한 세트로 다듬으세요.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button href="/upload"><FileUp className="h-4 w-4" />새 PDF 업로드</Button>
            <Button href="/jobs" variant="secondary">최근 배치 보기</Button>
          </div>
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">최근 처리 작업</h2>
            <Button href="/jobs" variant="ghost">전체 보기</Button>
          </div>
          <div className="overflow-hidden rounded-[10px] border border-white/10">
            {["source upload", "extract pending", "review archive"].map((item, index) => (
              <div key={item} className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-white/10 bg-white/[0.025] p-4 text-sm last:border-b-0">
                <span className="font-medium text-slate-200">{item}</span>
                <Badge tone={index === 0 ? "green" : "violet"}>{index === 0 ? "완료" : "대기"}</Badge>
                <span className="text-slate-500">sample</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}
