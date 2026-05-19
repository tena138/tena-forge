import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

export default function ArchivePage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Problem Archive" title="문항 아카이브" description="추출된 문항과 학습 콘텐츠를 검색하고, 태그와 메타데이터를 편집합니다.">
        <Card>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input className="h-10 rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none" placeholder="문항, 단원, 태그 검색" />
            <div className="flex gap-2">
              {["출처", "공개 범위", "과목", "난이도"].map((filter) => <Badge key={filter}>{filter}</Badge>)}
            </div>
          </div>
          <div className="grid gap-3">
            {["이차함수의 최댓값을 구하시오.", "다음 지문을 읽고 물음에 답하시오.", "도형의 넓이를 구하시오."].map((title, index) => (
              <div key={title} className="rounded-[10px] border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="violet">수학</Badge>
                      <Badge>{index === 0 ? "직접 제작" : "이용 허락"}</Badge>
                      <Badge tone={index === 2 ? "amber" : "green"}>{index === 2 ? "검토 필요" : "태그 완료"}</Badge>
                    </div>
                  </div>
                  <Button href={`/archive/${index + 1}`} variant="secondary">편집</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageScaffold>
    </AppFrame>
  );
}
