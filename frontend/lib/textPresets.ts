import { nanoid } from "nanoid";

import { CanvasElement, DynamicFieldKey } from "@/lib/editorTypes";

export type FontOption = {
  label: string;
  family: string;
  group: "Korean" | "Latin";
};

export type TextStylePreset = {
  id: string;
  label: string;
  preview: string;
  element: Partial<CanvasElement>;
};

export type DynamicFieldPreset = {
  key: DynamicFieldKey;
  label: string;
  group: "exam" | "student" | "page";
};

export const editorFonts: FontOption[] = [
  { label: "나눔고딕", family: "NanumGothic", group: "Korean" },
  { label: "나눔명조", family: "NanumMyeongjo", group: "Korean" },
  { label: "나눔바른고딕", family: "NanumBarunGothic", group: "Korean" },
  { label: "나눔스퀘어", family: "NanumSquare", group: "Korean" },
  { label: "맑은 고딕", family: "Malgun Gothic", group: "Korean" },
  { label: "돋움", family: "Dotum", group: "Korean" },
  { label: "굴림", family: "Gulim", group: "Korean" },
  { label: "바탕", family: "Batang", group: "Korean" },
  { label: "Arial", family: "Arial", group: "Latin" },
  { label: "Georgia", family: "Georgia", group: "Latin" },
  { label: "Times New Roman", family: "Times New Roman", group: "Latin" },
  { label: "Courier New", family: "Courier New", group: "Latin" },
  { label: "Helvetica", family: "Helvetica", group: "Latin" },
];

export const fontSizePresets = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

export const textStylePresets: TextStylePreset[] = [
  {
    id: "exam-title",
    label: "시험지 제목",
    preview: "시험지 제목",
    element: {
      fontFamily: "NanumGothic",
      fontSize: 22,
      fontWeight: "bold",
      textAlign: "center",
      letterSpacing: 2,
      width: 360,
      height: 42,
      text: "시험지 제목",
    },
  },
  {
    id: "section-header",
    label: "섹션 헤더",
    preview: "섹션 헤더",
    element: {
      fontFamily: "NanumGothic",
      fontSize: 14,
      fontWeight: "bold",
      width: 280,
      height: 34,
      text: "섹션 헤더",
      underline: true,
    },
  },
  {
    id: "instruction",
    label: "안내 텍스트",
    preview: "안내 텍스트",
    element: {
      fontFamily: "NanumMyeongjo",
      fontSize: 10,
      fontStyle: "italic",
      color: "#666666",
      width: 300,
      height: 28,
      text: "안내 텍스트",
    },
  },
  {
    id: "question-number",
    label: "문항 번호",
    preview: "문 1.",
    element: {
      fontFamily: "NanumGothic",
      fontSize: 11,
      fontWeight: "bold",
      width: 80,
      height: 24,
      text: "문 1.",
    },
  },
  {
    id: "answer-label",
    label: "정답란 레이블",
    preview: "정답",
    element: {
      fontFamily: "NanumGothic",
      fontSize: 9,
      color: "#444444",
      width: 90,
      height: 22,
      text: "정답",
    },
  },
  {
    id: "caption",
    label: "캡션",
    preview: "캡션",
    element: {
      fontFamily: "NanumGothic",
      fontSize: 9,
      color: "#666666",
      textAlign: "center",
      width: 180,
      height: 22,
      text: "캡션",
    },
  },
];

export const dynamicFieldPresets: DynamicFieldPreset[] = [
  { key: "exam_title", label: "{{시험명}}", group: "exam" },
  { key: "academy_name", label: "{{학원명}}", group: "exam" },
  { key: "class_name", label: "{{반}}", group: "student" },
  { key: "student_name", label: "{{이름}}", group: "student" },
  { key: "exam_date", label: "{{시험일자}}", group: "exam" },
  { key: "exam_time", label: "{{시험시간}}", group: "exam" },
  { key: "exam_datetime", label: "{{시험일시}}", group: "exam" },
  { key: "exam_start_time", label: "{{시작시간}}", group: "exam" },
  { key: "exam_end_time", label: "{{종료시간}}", group: "exam" },
  { key: "page_number", label: "{{페이지번호}}", group: "page" },
  { key: "total_pages", label: "{{총페이지}}", group: "page" },
  { key: "subject", label: "{{과목}}", group: "exam" },
  { key: "grade", label: "{{학년}}", group: "student" },
];

export const dynamicFieldColors: Record<DynamicFieldPreset["group"], { bg: string; text: string; border: string }> = {
  exam: { bg: "transparent", text: "#111827", border: "transparent" },
  student: { bg: "transparent", text: "#111827", border: "transparent" },
  page: { bg: "transparent", text: "#111827", border: "transparent" },
};

export function createBaseTextElement(x: number, y: number, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: nanoid(),
    type: "text",
    name: "텍스트",
    x,
    y,
    width: 260,
    height: 42,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fill: "transparent",
    stroke: "#111827",
    strokeWidth: 0,
    color: "#111827",
    fontFamily: "NanumGothic",
    fontSize: 14,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "left",
    lineHeight: 1.25,
    letterSpacing: 0,
    text: "텍스트",
    ...extra,
  };
}

export function createDynamicFieldElement(field: DynamicFieldPreset, x: number, y: number): CanvasElement {
  return createBaseTextElement(x, y, {
    type: "dynamic_field",
    name: field.label,
    text: field.label,
    fieldKey: field.key,
    width: Math.max(118, field.label.length * 12),
    height: 30,
    fontSize: 14,
    fontWeight: "normal",
    color: "#111827",
    fill: "transparent",
    backgroundColor: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    borderRadius: 0,
    textAlign: "left",
  });
}
