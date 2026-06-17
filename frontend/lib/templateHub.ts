import { authHttp, ensureAccessToken } from "@/lib/auth-client";
import type { TemplateSet } from "@/lib/visualTemplateTypes";

export type TemplateVisibility = "private" | "unlisted" | "public" | "marketplace";
export type TemplateCategory =
  | "exam"
  | "workbook"
  | "worksheet"
  | "wrong_answer_note"
  | "solution_book"
  | "concept_note"
  | "counseling_log"
  | "unit_test"
  | "cover";

export type HubTemplate = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  html: string;
  css: string | null;
  schema_json: Record<string, unknown> | null;
  thumbnail_url: string | null;
  academy_id?: string | null;
  source_type?: string;
  rights_confirmed?: boolean;
  rights_confirmed_at?: string | null;
  forked_from_template_id: string | null;
  like_count: number;
  use_count: number;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
};

export type HubTemplatePayload = {
  title: string;
  description?: string | null;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  html: string;
  css?: string | null;
  schema_json?: Record<string, unknown> | null;
  thumbnail_url?: string | null;
  source_type?: string;
  rights_confirmed?: boolean;
};

export type PdfTemplateImportResponse = {
  templateSet: TemplateSet;
  warnings: string[];
  page_count: number;
  imported_page_count: number;
  source_file: string;
};

export const templateCategories: Array<{ value: TemplateCategory; label: string }> = [
  { value: "exam", label: "시험지" },
  { value: "workbook", label: "교재" },
  { value: "worksheet", label: "워크북" },
  { value: "wrong_answer_note", label: "오답노트" },
  { value: "solution_book", label: "답안지" },
  { value: "concept_note", label: "개념노트" },
  { value: "unit_test", label: "단원평가지" },
  { value: "cover", label: "표지" },
];

export const visibilityLabels: Record<TemplateVisibility, string> = {
  private: "비공개",
  unlisted: "링크 공유",
  public: "공개",
  marketplace: "마켓 등록",
};

export const sampleTemplateData: Record<string, string | number> = {
  test_title: "고1 수학 중간고사 대비",
  student_name: "김지헌",
  problem_text: "다음 이차함수의 최댓값을 구하시오.",
  solution: "꼭짓점의 좌표를 이용하여 최댓값을 구한다.",
  answer: "3",
  page_number: 1,
  total_pages: 5,
  subject: "수학",
  unit: "이차함수",
  difficulty: "중",
  tags: "고1, 중간고사, 이차함수",
};

export const defaultTemplateHtml = `<div class="page">
  <header class="header">
    <div>
      <p class="eyebrow">{{ subject }}</p>
      <h1>{{ test_title }}</h1>
    </div>
    <div class="meta">
      <span>이름: {{ student_name }}</span>
      <span>Page {{ page_number }} / {{ total_pages }}</span>
    </div>
  </header>

  <main class="problem-card">
    <div class="problem-number">문제</div>
    <div class="problem-text">{{ problem_text }}</div>
    <div class="answer-space"></div>
  </main>
</div>`;

export const defaultTemplateCss = `.page {
  width: 794px;
  min-height: 1123px;
  padding: 56px;
  background: #ffffff;
  color: #111827;
  font-family: "Pretendard", "Noto Sans KR", sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #111827;
  padding-bottom: 20px;
  margin-bottom: 36px;
}

.eyebrow {
  font-size: 13px;
  color: #6d28d9;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 8px;
}

h1 {
  font-size: 28px;
  margin: 0;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #4b5563;
}

.problem-card {
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 28px;
  background: #fafafa;
}

.problem-number {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-weight: 700;
  margin-bottom: 16px;
}

.problem-text {
  font-size: 18px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.answer-space {
  margin-top: 32px;
  height: 180px;
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  background: #ffffff;
}`;

export function categoryLabel(value: string) {
  return templateCategories.find((category) => category.value === value)?.label || value;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlWithUnderline(value: string | number) {
  const text = String(value);
  const pattern = /<\/?u>/gi;
  let cursor = 0;
  let rendered = "";
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) rendered += escapeHtml(text.slice(cursor, index));
    rendered += token.startsWith("</") ? "</u>" : "<u>";
    cursor = index + token.length;
  }
  if (cursor < text.length) rendered += escapeHtml(text.slice(cursor));
  return rendered;
}

export function renderTemplatePreview(html: string, css?: string | null, data = sampleTemplateData) {
  const rendered = html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => escapeHtmlWithUnderline(data[key] ?? ""));
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #111318; }
    body { display: flex; justify-content: center; padding: 24px; }
    ${css || ""}
  </style>
</head>
<body>${rendered}</body>
</html>`;
}

export async function ensureTemplateHubSession() {
  try {
    return Boolean(await ensureAccessToken());
  } catch {
    return false;
  }
}

export async function listPublicTemplates(params?: { category?: string; keyword?: string; sort?: string }) {
  await ensureTemplateHubSession();
  const response = await authHttp.get<HubTemplate[]>("/templates/public", { params });
  return response.data;
}

export async function listMyTemplates() {
  await ensureTemplateHubSession();
  const response = await authHttp.get<HubTemplate[]>("/templates/mine");
  return response.data;
}

export async function getHubTemplate(id: string) {
  await ensureTemplateHubSession();
  const response = await authHttp.get<HubTemplate>(`/templates/${id}`);
  return response.data;
}

export async function createHubTemplate(payload: HubTemplatePayload) {
  await ensureTemplateHubSession();
  const response = await authHttp.post<HubTemplate>("/templates", payload);
  return response.data;
}

export async function importPdfTemplate(file: File) {
  await ensureTemplateHubSession();
  const form = new FormData();
  form.append("file", file);
  const response = await authHttp.post<PdfTemplateImportResponse>("/templates/import/pdf", form);
  return response.data;
}

export async function updateHubTemplate(id: string, payload: Partial<HubTemplatePayload>) {
  await ensureTemplateHubSession();
  const response = await authHttp.patch<HubTemplate>(`/templates/${id}`, payload);
  return response.data;
}

export async function deleteHubTemplate(id: string) {
  await ensureTemplateHubSession();
  await authHttp.delete(`/templates/${id}`);
}

export async function forkHubTemplate(id: string) {
  await ensureTemplateHubSession();
  const response = await authHttp.post<{ template: HubTemplate; source_use_count: number }>(`/templates/${id}/fork`);
  return response.data.template;
}

export async function publishHubTemplate(id: string) {
  await ensureTemplateHubSession();
  const response = await authHttp.post<HubTemplate>(`/templates/${id}/publish`);
  return response.data;
}

export async function unpublishHubTemplate(id: string) {
  await ensureTemplateHubSession();
  const response = await authHttp.post<HubTemplate>(`/templates/${id}/unpublish`);
  return response.data;
}
