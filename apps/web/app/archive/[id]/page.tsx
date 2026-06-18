import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Button, Card } from "@/components/ui";

export default function ArchiveDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Editable item" title={`아카이브 항목 ${params.id}`} description="문항 본문, HTML, LaTeX, 태그, 단원, 난이도를 검토합니다.">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <label className="block text-sm text-neutral-300">문항 HTML<textarea className="mt-2 min-h-[320px] w-full rounded-[10px] border border-white/10 bg-black/30 p-4 font-mono text-sm text-neutral-200 outline-none" defaultValue={"<p>다음 이차함수의 최댓값을 구하시오.</p>"} /></label>
          </Card>
          <Card>
            <div className="space-y-4">
              {["과목", "단원", "난이도", "태그"].map((field) => <label key={field} className="block text-sm text-neutral-300">{field}<input className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-white/[0.05] px-3 text-white outline-none" /></label>)}
              <Button>변경사항 저장</Button>
            </div>
          </Card>
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
