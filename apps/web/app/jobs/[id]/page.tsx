import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Card } from "@/components/ui";

export default function JobDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Job detail" title={`작업 ${params.id}`} description="처리 타임라인, 원본 파일, 추출 결과, 출력 파일을 확인합니다.">
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <Card>
            <h2 className="font-bold text-white">처리 타임라인</h2>
            <div className="mt-5 space-y-4">
              {["업로드 완료", "큐 등록", "AI 추출", "검토 대기", "출력 생성"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  <span className="text-neutral-200">{step}</span>
                  <Badge tone={index < 2 ? "green" : "violet"}>{index < 2 ? "done" : "pending"}</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="font-bold text-white">추출 콘텐츠</h2>
            <div className="mt-5 rounded-[10px] border border-white/10 bg-white/[0.035] p-5 text-sm leading-7 text-neutral-300">
              작업이 완료되면 문항, 지문, 해설, 이미지 조각이 이 영역에 표시됩니다. 부분 실패가 있으면 낮은 신뢰도 배지와 함께 검토 항목으로 남깁니다.
            </div>
          </Card>
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
