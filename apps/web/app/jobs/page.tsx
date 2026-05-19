import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

export default function JobsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Queue" title="처리 작업" description="문서 처리, AI 추출, 출력 생성 작업의 상태를 추적합니다.">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {["전체", "대기", "처리 중", "완료", "실패"].map((filter) => <Badge key={filter}>{filter}</Badge>)}
            </div>
            <Button href="/upload">새 작업 만들기</Button>
          </div>
          <div className="overflow-hidden rounded-[10px] border border-white/10">
            {["샘플 중간고사.pdf", "워크북 이미지 묶음", "개념노트 출력"].map((name, index) => (
              <div key={name} className="grid gap-3 border-b border-white/10 p-4 text-sm last:border-b-0 md:grid-cols-[1fr_120px_100px_100px]">
                <span className="font-semibold text-white">{name}</span>
                <Badge tone={index === 0 ? "violet" : index === 1 ? "green" : "amber"}>{index === 0 ? "processing" : index === 1 ? "completed" : "queued"}</Badge>
                <span className="text-slate-400">{index === 0 ? "43%" : index === 1 ? "100%" : "0%"}</span>
                <Button href={`/jobs/${index + 1}`} variant="ghost">열기</Button>
              </div>
            ))}
          </div>
        </Card>
      </PageScaffold>
    </AppFrame>
  );
}
