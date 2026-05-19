import { BUILT_IN_TEMPLATES } from "@tena-forge/shared";
import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { Badge, Button, Card } from "@/components/ui";

export default function TemplateDetailPage({ params }: { params: { id: string } }) {
  const template = BUILT_IN_TEMPLATES.find((item) => item.id === params.id) || BUILT_IN_TEMPLATES[0];
  const items = `<article class="item"><div class="content">다음 이차함수의 최댓값을 구하시오.</div></article>`;
  const preview = template.html
    .replaceAll("{{workspace_name}}", "Tena Academy")
    .replaceAll("{{document_title}}", "고1 수학 중간고사 대비")
    .replaceAll("{{created_at}}", "2026.05.08")
    .replaceAll("{{items}}", items);

  return (
    <AppFrame>
      <PageScaffold eyebrow="Template preview" title={template.name} description="템플릿 메타데이터와 A4 렌더링 결과를 확인합니다.">
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <Badge tone="violet">{template.category}</Badge>
            <p className="mt-4 text-sm leading-6 text-slate-400">템플릿은 HTML/CSS와 반복 문항 블록, A4 출력 규칙을 포함합니다. 공개 템플릿은 서버에서 스크립트가 제거된 뒤 렌더링됩니다.</p>
            <div className="mt-5 flex gap-2">
              <Button>이 템플릿 사용</Button>
              <Button variant="secondary">복제</Button>
            </div>
          </Card>
          <Card className="overflow-hidden p-0">
            <div className="max-h-[720px] overflow-auto bg-slate-200 p-6">
              <div className="mx-auto w-[794px] shadow-2xl" dangerouslySetInnerHTML={{ __html: `<style>${template.css}</style>${preview}` }} />
            </div>
          </Card>
        </div>
      </PageScaffold>
    </AppFrame>
  );
}
