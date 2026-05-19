import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

export default function OutputsPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Generated outputs" title="출력물" description="생성된 HTML/PDF 파일을 미리보기하고 다운로드하거나 다시 생성합니다.">
        <Card>
          <div className="grid gap-3">
            {["고1 수학 중간고사 대비.pdf", "워크북 1단원.html", "오답노트 출력.pdf"].map((name, index) => (
              <div key={name} className="grid gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-4 text-sm md:grid-cols-[1fr_100px_110px]">
                <span className="font-semibold text-white">{name}</span>
                <Badge tone={index === 1 ? "violet" : "green"}>{index === 1 ? "HTML" : "PDF"}</Badge>
                <Button href={`/outputs/${index + 1}`} variant="secondary">열기</Button>
              </div>
            ))}
          </div>
        </Card>
      </PageScaffold>
    </AppFrame>
  );
}
