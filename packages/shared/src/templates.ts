export type BuiltInTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  html: string;
  css: string;
};

const baseCss = `
@page { size: A4; margin: 0; }
body { margin: 0; font-family: Pretendard, "Noto Sans KR", sans-serif; color: #111827; }
.page { width: 794px; min-height: 1123px; box-sizing: border-box; padding: 56px; background: white; }
.item { break-inside: avoid; margin-bottom: 28px; }
.meta { color: #6b7280; font-size: 12px; }
.content { font-size: 15px; line-height: 1.75; white-space: pre-wrap; }
`;

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "minimal-a4-problem-sheet",
    name: "Minimal A4 Problem Sheet",
    description: "깔끔한 단일 A4 문제지 레이아웃입니다.",
    category: "worksheet",
    html: `<main class="page"><header><p class="meta">{{workspace_name}}</p><h1>{{document_title}}</h1></header>{{items}}</main>`,
    css: `${baseCss} h1{font-size:28px;border-bottom:2px solid #111827;padding-bottom:18px;margin-bottom:32px;}`
  },
  {
    id: "premium-academy-worksheet",
    name: "Premium Academy Worksheet",
    description: "학원 브랜드 출력물에 어울리는 프리미엄 워크시트입니다.",
    category: "worksheet",
    html: `<main class="page premium"><header><span>{{workspace_name}}</span><h1>{{document_title}}</h1></header><section>{{items}}</section></main>`,
    css: `${baseCss} .premium{background:#fbfbfd}.premium header{border:1px solid #e5e7eb;border-radius:18px;padding:22px;margin-bottom:30px}`
  },
  {
    id: "two-problems-per-page",
    name: "Two Problems Per Page",
    description: "한 페이지에 두 문항을 안정적으로 배치하는 시험지 템플릿입니다.",
    category: "exam",
    html: `<main class="page two-col"><h1>{{document_title}}</h1><div class="grid">{{items}}</div></main>`,
    css: `${baseCss} .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.item{border-top:1px solid #e5e7eb;padding-top:14px}`
  },
  {
    id: "exam-archive-layout",
    name: "Exam Archive Layout",
    description: "문항 아카이브 검토와 보관용 출력에 맞춘 레이아웃입니다.",
    category: "archive",
    html: `<main class="page"><header class="archive-head"><h1>{{document_title}}</h1><p>{{created_at}}</p></header>{{items}}</main>`,
    css: `${baseCss} .archive-head{display:flex;justify-content:space-between;border-bottom:3px solid #111827;margin-bottom:32px}`
  },
  {
    id: "concept-note-layout",
    name: "Concept Note Layout",
    description: "개념 정리와 해설 노트에 적합한 카드형 템플릿입니다.",
    category: "concept_note",
    html: `<main class="page concept"><h1>{{document_title}}</h1>{{items}}</main>`,
    css: `${baseCss} .concept h1{color:#5b21b6}.item{padding:20px;border-radius:14px;background:#f8fafc}`
  }
];

export function renderTemplate(html: string, vars: Record<string, string>) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
