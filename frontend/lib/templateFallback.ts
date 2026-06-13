import { nanoid } from "nanoid";

import type { ExamTemplate } from "@/lib/api";
import { CanvasDocument, CanvasElement, DEFAULT_PAGE } from "@/lib/editorTypes";

function element(partial: Partial<CanvasElement> & Pick<CanvasElement, "type" | "name">): CanvasElement {
  return {
    id: nanoid(),
    x: 0,
    y: 0,
    width: 160,
    height: 48,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fill: "#ffffff",
    stroke: "#111827",
    strokeWidth: 0,
    color: "#111827",
    fontFamily: "NanumGothic",
    fontSize: 12,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "left",
    lineHeight: 1.25,
    letterSpacing: 0,
    borderRadius: 0,
    ...partial,
  };
}

export function legacyTemplateDocument(template: ExamTemplate): CanvasDocument {
  const columns = Math.max(1, Math.min(3, template.problems_per_page || 2));
  const hasSolution = Boolean(template.include_solution);
  const hasLogo = Boolean(template.logo_url);
  const today = new Date().toISOString().slice(0, 10);

  const elements: CanvasElement[] = [
    element({ type: "box", name: "상단 정보", x: 48, y: 32, width: 698, height: 94, fill: "#ffffff", stroke: "#111827", strokeWidth: 1 }),
    element({ type: "dynamic_field", name: "학원명", fieldKey: "academy_name", previewValue: template.academy_name || "Tena Academy", text: "{{academy_name}}", x: 64, y: 48, width: 144, height: 28, fontSize: 10 }),
    element({ type: "dynamic_field", name: "시험지 제목", fieldKey: "exam_title", previewValue: template.name || "시험지", text: "{{exam_title}}", x: 220, y: 47, width: 354, height: 36, fontSize: 21, fontWeight: "bold", textAlign: "center" }),
    element({ type: "dynamic_field", name: "반", fieldKey: "class_name", previewValue: "A반", text: "반 {{class}}", x: 592, y: 48, width: 130, height: 22, fontSize: 10, textAlign: "right" }),
    element({ type: "dynamic_field", name: "이름", fieldKey: "student_name", previewValue: "홍길동", text: "이름 {{name}}", x: 592, y: 72, width: 130, height: 22, fontSize: 10, textAlign: "right" }),
    element({ type: "dynamic_field", name: "날짜", fieldKey: "date", previewValue: today, text: "{{date}}", x: 592, y: 96, width: 130, height: 20, fontSize: 9, textAlign: "right", color: "#4b5563" }),
    element({ type: "divider", name: "상단 구분선", x: 48, y: 142, width: 698, height: 4, stroke: "#111827", strokeWidth: 2 }),
    element({ type: "question_area", name: "문항 영역", x: 56, y: 168, width: 682, height: hasSolution ? 650 : 820, fill: "transparent", stroke: "#d1d5db", strokeWidth: 1, columns, questionNumberFormat: "{n}.", questionFontSize: template.font_size || 11 }),
    ...(hasSolution
      ? [element({ type: "solution_area", name: "답안 영역", x: 56, y: 840, width: 682, height: 136, fill: "#f8fafc", stroke: "#cbd5e1", strokeWidth: 1, answerFormat: "정답: {a}" })]
      : []),
    element({ type: "answer_table", name: "답안표", x: 56, y: hasSolution ? 994 : 1010, width: 682, height: 72, fill: "#ffffff", stroke: "#111827", strokeWidth: 1, rows: 2, answersPerRow: 5 }),
    element({ type: "dynamic_field", name: "페이지", fieldKey: "page_number", previewValue: "1 / 1", text: "{{page}} / {{total}}", x: 320, y: 1080, width: 154, height: 22, fontSize: 9, textAlign: "center", color: "#6b7280" }),
  ];

  if (hasLogo) {
    elements.splice(1, 0, element({ type: "image", name: "로고", src: template.logo_url || undefined, x: 62, y: 54, width: 92, height: 44, fill: "transparent", strokeWidth: 0, objectFit: "contain" }));
  }

  return {
    version: 1,
    page: { ...DEFAULT_PAGE },
    elements: elements.map((item, zIndex) => ({ ...item, zIndex })),
    updatedAt: new Date().toISOString(),
  };
}
