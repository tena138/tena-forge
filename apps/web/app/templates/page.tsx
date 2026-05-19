import { BUILT_IN_TEMPLATES } from "@tena-forge/shared";
import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

export default function TemplatesPage() {
  return (
    <AppFrame>
      <PageScaffold eyebrow="Template System" title="템플릿 라이브러리" description="시험지, 워크북, 교재 출력에 사용할 HTML/CSS 템플릿을 관리합니다.">
        <div className="mb-5 flex flex-wrap gap-2">
          {["전체", "시험지", "교재", "워크북", "오답노트", "해설지"].map((category) => <Badge key={category}>{category}</Badge>)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {BUILT_IN_TEMPLATES.map((template) => (
            <Card key={template.id} className="p-0">
              <div className="h-52 overflow-hidden rounded-t-[12px] border-b border-white/10 bg-white">
                <div className="origin-top-left scale-[0.24]" dangerouslySetInnerHTML={{ __html: `<style>${template.css}</style>${template.html.replaceAll("{{document_title}}", "중간고사 대비").replaceAll("{{workspace_name}}", "Tena Academy").replaceAll("{{created_at}}", "2026.05.08").replaceAll("{{items}}", "<p>다음 이차함수의 최댓값을 구하시오.</p>")}` }} />
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="font-bold text-white">{template.name}</h2>
                  <Badge tone="violet">{template.category}</Badge>
                </div>
                <p className="text-sm leading-6 text-slate-400">{template.description}</p>
                <div className="mt-5 flex gap-2">
                  <Button href={`/templates/${template.id}`}>미리보기</Button>
                  <Button variant="secondary">사용</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
