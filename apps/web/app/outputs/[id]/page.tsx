import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Button, Card } from "@/components/ui";

export default function OutputDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Output preview" title={`출력물 ${params.id}`} description="생성된 파일을 확인하고 다운로드합니다.">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="min-h-[640px] bg-slate-200 text-slate-900">
            <div className="mx-auto min-h-[560px] max-w-[420px] rounded bg-white p-10 shadow-xl">
              <h2 className="border-b pb-4 text-xl font-bold">고1 수학 중간고사 대비</h2>
              <p className="mt-8 text-sm leading-7">다음 이차함수의 최댓값을 구하시오.</p>
            </div>
          </Card>
          <Card>
            <h2 className="font-bold text-white">파일 작업</h2>
            <div className="mt-5 space-y-3">
              <Button className="w-full">다운로드</Button>
              <Button className="w-full" variant="secondary">다시 생성</Button>
            </div>
          </Card>
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
