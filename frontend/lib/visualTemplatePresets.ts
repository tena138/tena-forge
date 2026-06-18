import { nanoid } from "nanoid";

import {
  ContentRegionElement,
  ExamStatsChartElement,
  PAGE_SIZES,
  PageRole,
  TemplateCategory,
  TemplateElement,
  TemplateElementType,
  TemplatePage,
  TemplateSet,
  TemplateVariableKey,
} from "@/lib/visualTemplateTypes";

const now = () => new Date().toISOString();

export const visualTemplateCategories: Array<{ value: TemplateCategory; label: string; description: string }> = [
  { value: "counseling", label: "상담일지", description: "상담 항목과 학습 계획 자동 삽입" },
  { value: "exam", label: "시험지", description: "문항 영역과 답안 공간 중심" },
  { value: "textbook", label: "교재", description: "표지와 좌우 내지 페이지" },
  { value: "solution", label: "답안지", description: "문항별 정답 중심" },
  { value: "worksheet", label: "워크북", description: "연습 문항과 풀이 공간" },
  { value: "answerSheet", label: "답안지", description: "정답 입력 및 채점용 레이아웃" },
  { value: "report", label: "리포트", description: "학생 분석과 학습 결과 보고" },
  { value: "custom", label: "빈 템플릿", description: "완전 자유 구성" },
];

export const variableOptions: Array<{ key: TemplateVariableKey; label: string; group: string }> = [
  { key: "counseling_title", label: "상담 제목", group: "상담" },
  { key: "counseling_date", label: "상담 일자", group: "상담" },
  { key: "counseling_notes", label: "상담 내용", group: "상담" },
  { key: "counseling_weekly_report", label: "주간 리포트", group: "상담" },
  { key: "counseling_next_plan", label: "다음 계획", group: "상담" },
  { key: "test_title", label: "시험명", group: "문서" },
  { key: "book_title", label: "교재명", group: "문서" },
  { key: "subject", label: "과목", group: "문서" },
  { key: "exam_date", label: "시험 일자", group: "문서" },
  { key: "exam_time", label: "시험 시간", group: "문서" },
  { key: "exam_datetime", label: "시험 일시", group: "문서" },
  { key: "exam_start_time", label: "시작 시간", group: "문서" },
  { key: "exam_end_time", label: "종료 시간", group: "문서" },
  { key: "chapter_title", label: "챕터", group: "문서" },
  { key: "unit_title", label: "단원", group: "문서" },
  { key: "academy_name", label: "학원명", group: "브랜드" },
  { key: "teacher_name", label: "교사명", group: "브랜드" },
  { key: "student_name", label: "학생명", group: "학생" },
  { key: "class_name", label: "반", group: "학생" },
  { key: "page_number", label: "페이지", group: "페이지" },
  { key: "total_pages", label: "총 페이지", group: "페이지" },
  { key: "difficulty", label: "난이도", group: "문항" },
  { key: "tags", label: "태그", group: "문항" },
  { key: "exam_stats_respondent_count", label: "응시자 수", group: "시험 통계" },
  { key: "exam_stats_average", label: "응시자 평균", group: "시험 통계" },
  { key: "exam_stats_highest", label: "최고점", group: "시험 통계" },
  { key: "exam_stats_lowest", label: "최저점", group: "시험 통계" },
  { key: "exam_stats_q1", label: "Q1", group: "시험 통계" },
  { key: "exam_stats_q2", label: "Q2 중앙값", group: "시험 통계" },
  { key: "exam_stats_q3", label: "Q3", group: "시험 통계" },
  { key: "exam_stats_standard_deviation", label: "표준편차", group: "시험 통계" },
];

export const pageRoleLabels: Record<PageRole, string> = {
  cover: "표지",
  toc: "목차",
  exam: "시험지",
  textbookInner: "교재 내지",
  textbookLeft: "왼쪽 내지",
  textbookRight: "오른쪽 내지",
  problem: "문항 페이지",
  solution: "답안 페이지",
  answer: "답안 페이지",
  report: "리포트",
  custom: "사용자 정의",
};

function baseElement(type: TemplateElementType, name: string, x: number, y: number, width: number, height: number, extra: Partial<TemplateElement> = {}): TemplateElement {
  return {
    id: nanoid(),
    type,
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    hidden: false,
    style: {
      fill: "#ffffff",
      stroke: "#d8dee9",
      strokeWidth: 1,
      color: "#111827",
      fontFamily: "Pretendard, Noto Sans KR, sans-serif",
      fontSize: 14,
      fontWeight: "normal",
      textAlign: "left",
      lineHeight: 1.5,
      radius: 8,
    },
    ...extra,
  } as TemplateElement;
}

export function createText(text: string, x: number, y: number, width = 240, height = 48, fontSize = 18): TemplateElement {
  return baseElement("text", "텍스트", x, y, width, height, {
    text,
    style: {
      color: "#111827",
      fontSize,
      fontWeight: "bold",
      fontFamily: "Pretendard, Noto Sans KR, sans-serif",
      lineHeight: 1.35,
      textAlign: "left",
    },
  } as Partial<TemplateElement>);
}

export function createVariable(variableKey: TemplateVariableKey, label: string, x: number, y: number): TemplateElement {
  return baseElement("variable", label, x, y, 180, 34, {
    variableKey,
    fallback: label,
    style: {
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      borderStyle: "none",
      color: "#111827",
      fontFamily: "Pretendard, Noto Sans KR, sans-serif",
      fontSize: 14,
      fontWeight: "normal",
      radius: 0,
      textAlign: "left",
      lineHeight: 1.35,
      letterSpacing: 0,
    },
  } as Partial<TemplateElement>);
}

export function createProblemRegion(x = 64, y = 190, width = 666, height = 760, columns = 2, rows = 2): ContentRegionElement {
  return baseElement("problemRegion", "문항 자동 배치 영역", x, y, width, height, {
    binding: "problems",
    layoutMode: "grid",
    columns,
    rows,
    columnGap: 24,
    rowGap: 18,
    padding: 16,
    fillDirection: "column-first",
    keepTogether: true,
    allowSplit: false,
    overflowStrategy: "create-next-page",
    nextPageRolePreference: "problem",
    minItemHeight: 128,
    maxItemHeight: 360,
    showContinuationMarker: true,
    numberFormat: "문 {n}.",
    columnDividerStyle: { stroke: "#d8dee9", strokeWidth: 0, borderStyle: "none" },
    style: { fill: "#ffffff", stroke: "#e8e8e8", strokeWidth: 1, borderStyle: "dashed", radius: 10 },
    cardStyle: { fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1, borderStyle: "solid", radius: 10 },
    numberStyle: { color: "#6d28d9", fontWeight: "bold", fontSize: 12 },
    bodyStyle: { color: "#111827", fontSize: 12, lineHeight: 1.65 },
    answerSpaceStyle: { fill: "#ffffff", stroke: "#cbd5e1", strokeWidth: 1, borderStyle: "dashed", radius: 8 },
  } as Partial<TemplateElement>) as ContentRegionElement;
}

export function createSolutionRegion(x = 64, y = 170, width = 666, height = 820): ContentRegionElement {
  return {
    ...createProblemRegion(x, y, width, height, 1, 4),
    id: nanoid(),
    type: "solutionRegion",
    name: "답안 자동 배치 영역",
    binding: "answers",
    nextPageRolePreference: "answer",
  };
}

export function createAnswerRegion(x = 64, y = 200, width = 666, height = 360): ContentRegionElement {
  return {
    ...createProblemRegion(x, y, width, height, 1, 8),
    id: nanoid(),
    type: "answerRegion",
    name: "답안 자동 배치 영역",
    binding: "answers",
    nextPageRolePreference: "answer",
    minItemHeight: 40,
  };
}

export function createCounselingRegion(x = 64, y = 170, width = 666, height = 760): ContentRegionElement {
  return {
    ...createProblemRegion(x, y, width, height, 1, 6),
    id: nanoid(),
    type: "counselingRegion",
    name: "상담 항목 영역",
    binding: "counseling",
    nextPageRolePreference: "report",
    minItemHeight: 96,
    maxItemHeight: 240,
    numberFormat: "{n}",
    style: { fill: "#ffffff", stroke: "#a78bfa", strokeWidth: 1, borderStyle: "dashed", radius: 10 },
    cardStyle: { fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1, borderStyle: "solid", radius: 10 },
    numberStyle: { color: "#5b21b6", fontWeight: "bold", fontSize: 12 },
    bodyStyle: { color: "#111827", fontSize: 12, lineHeight: 1.7 },
  };
}

export function createExamStatsChart(x = 64, y = 180, width = 666, height = 320): ExamStatsChartElement {
  return baseElement("examStatsChart", "시험 통계 차트", x, y, width, height, {
    title: "시험 통계",
    chartMode: "line",
    metrics: ["average", "q2"],
    dataSource: "templateVariable",
    dataVariableKey: "exam_stats_series_json",
    xAxisDateStart: "",
    xAxisDateEnd: "",
    showLegend: true,
    showGrid: true,
    showPointLabels: false,
    showRespondents: false,
    yAxisMin: 0,
    yAxisMax: 100,
    style: {
      fill: "#ffffff",
      stroke: "#d8dee9",
      strokeWidth: 1,
      borderStyle: "solid",
      radius: 12,
      color: "#111827",
      fontFamily: "Pretendard, Noto Sans KR, sans-serif",
      fontSize: 12,
      fontWeight: "normal",
      lineHeight: 1.35,
      textAlign: "left",
    },
  } as Partial<TemplateElement>) as ExamStatsChartElement;
}

export function createElement(type: TemplateElementType, x = 120, y = 140): TemplateElement {
  if (type === "text") return createText("텍스트를 입력하세요", x, y);
  if (type === "richText") {
    return baseElement("richText", "리치 텍스트", x, y, 280, 120, {
      html: "<strong>강조 텍스트</strong><br />여러 줄 내용을 입력하세요.",
      style: { color: "#111827", fontSize: 14, lineHeight: 1.7, fill: "transparent", stroke: "transparent" },
    } as Partial<TemplateElement>);
  }
  if (type === "variable") return createVariable("test_title", "시험명", x, y);
  if (type === "shape") {
    return baseElement("shape", "도형", x, y, 140, 90, {
      shape: "rect",
      style: { fill: "#f8fafc", stroke: "#94a3b8", strokeWidth: 1, radius: 10 },
    } as Partial<TemplateElement>);
  }
  if (type === "line") return baseElement("line", "선", x, y, 220, 2, { lineKind: "solid", style: { stroke: "#111827", strokeWidth: 2 } } as Partial<TemplateElement>);
  if (type === "table") return baseElement("table", "표", x, y, 260, 150, { rows: 4, columns: 4, headerRow: true } as Partial<TemplateElement>);
  if (type === "image") {
    return baseElement("image", "이미지", x, y, 180, 120, {
      src: null,
      objectFit: "contain",
      style: { fill: "#f8fafc", stroke: "#cbd5e1", strokeWidth: 1, radius: 8 },
    } as Partial<TemplateElement>);
  }
  if (type === "pageNumber") {
    return baseElement("pageNumber", "페이지 번호", x, y, 120, 28, {
      format: "{{page_number}} / {{total_pages}}",
      style: { color: "#6b7280", fontSize: 11, textAlign: "center", fill: "transparent", stroke: "transparent" },
    } as Partial<TemplateElement>);
  }
  if (type === "problemRegion") return createProblemRegion(x, y);
  if (type === "solutionRegion") return createSolutionRegion(x, y);
  if (type === "answerRegion") return createAnswerRegion(x, y);
  if (type === "counselingRegion") return createCounselingRegion(x, y);
  if (type === "examStatsChart") return createExamStatsChart(x, y);
  if (type === "contentRegion") {
    return {
      ...createProblemRegion(x, y, 520, 280, 1),
      id: nanoid(),
      type: "contentRegion",
      name: "콘텐츠 영역",
      binding: "generic",
      minItemHeight: 80,
    };
  }
  if (type === "qr") return baseElement("qr", "QR 코드", x, y, 96, 96, { value: "{{qr_code}}" } as Partial<TemplateElement>);
  if (type === "watermark") {
    return baseElement("watermark", "워터마크", x, y, 360, 80, {
      text: "Tena Forge",
      opacity: 0.12,
      rotation: -24,
      style: { color: "#111827", fontSize: 44, fontWeight: "bold", textAlign: "center", fill: "transparent", stroke: "transparent" },
    } as Partial<TemplateElement>);
  }
  if (type === "headerBlock") return baseElement("headerBlock", "헤더 블록", x, y, 640, 72, { title: "{{test_title}}", subtitle: "{{academy_name}}" } as Partial<TemplateElement>);
  if (type === "footerBlock") return baseElement("footerBlock", "푸터 블록", x, y, 640, 42, { text: "{{academy_name}} · {{page_number}}" } as Partial<TemplateElement>);
  return createText("텍스트", x, y);
}

function createPage(name: string, role: PageRole, elements: TemplateElement[] = []): TemplatePage {
  return {
    id: nanoid(),
    name,
    role,
    pageSize: PAGE_SIZES.A4_PORTRAIT,
    background: { color: "#ffffff" },
    safeArea: { x: 48, y: 48, width: 698, height: 1027 },
    guides: [],
    elements,
  };
}

export function createBlankTemplateSet(): TemplateSet {
  const createdAt = now();
  const theme = { primary: "#6d28d9", graphite: "#111827", muted: "#6b7280", fontFamily: "Pretendard, Noto Sans KR, sans-serif" };
  return {
    id: nanoid(),
    schemaVersion: 1,
    title: "A4 Template Set",
    description: "Blank A4 template created in Visual Template Studio.",
    category: "custom",
    visibility: "private",
    defaultPageSize: PAGE_SIZES.A4_PORTRAIT,
    theme,
    pages: [createPage("A4", "custom")],
    assets: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function createTemplateSet(category: TemplateCategory): TemplateSet {
  const theme = { primary: "#6d28d9", graphite: "#111827", muted: "#6b7280", fontFamily: "Pretendard, Noto Sans KR, sans-serif" };
  const title = visualTemplateCategories.find((item) => item.value === category)?.label || "템플릿";
  const baseSet: TemplateSet = {
    id: nanoid(),
    schemaVersion: 1,
    title: `${title} 템플릿 세트`,
    description: "Visual Template Studio에서 만든 JSON 기반 템플릿 세트입니다.",
    category,
    visibility: "private",
    defaultPageSize: PAGE_SIZES.A4_PORTRAIT,
    theme,
    pages: [],
    assets: [],
    createdAt: now(),
    updatedAt: now(),
  };

  if (category === "textbook") {
    baseSet.pages = [
      createPage("표지", "cover", [
        createText("{{book_title}}", 92, 180, 560, 82, 38),
        createText("권리 있는 교육 자료를 완성된 교재로", 96, 278, 520, 44, 18),
        createVariable("academy_name", "학원명", 96, 880),
      ]),
      createPage("왼쪽 내지", "textbookLeft", [createVariable("chapter_title", "챕터", 64, 54), createProblemRegion(64, 140, 660, 820, 1), createElement("pageNumber", 337, 1054)]),
      createPage("오른쪽 내지", "textbookRight", [createVariable("chapter_title", "챕터", 64, 54), createProblemRegion(64, 140, 660, 820, 1), createElement("pageNumber", 337, 1054)]),
    ];
  } else if (category === "solution") {
    baseSet.pages = [
      createPage("답안 표지", "cover", [createText("{{test_title}} 답안지", 76, 190, 600, 72, 34), createVariable("academy_name", "학원명", 76, 880)]),
      createPage("답안 페이지", "solution", [createText("답안", 64, 64, 220, 42, 24), createSolutionRegion(), createElement("pageNumber", 337, 1054)]),
    ];
  } else if (category === "answerSheet") {
    baseSet.pages = [createPage("답안지", "answer", [createText("답안지", 64, 64, 220, 48, 28), createVariable("student_name", "이름", 560, 70), createAnswerRegion(), createElement("pageNumber", 337, 1054)])];
  } else if (category === "report") {
    baseSet.pages = [
      createPage("리포트", "report", [
        createText("학습 리포트", 64, 64, 260, 50, 28),
        createVariable("student_name", "학생명", 64, 130),
        createExamStatsChart(64, 205, 666, 310),
        createElement("contentRegion", 64, 565),
      ]),
    ];
  } else if (category === "counseling") {
    baseSet.pages = [
      createPage("상담일지", "report", [
        createText("{{counseling_title}}", 64, 62, 420, 48, 28),
        createVariable("student_name", "학생명", 510, 64),
        createVariable("counseling_date", "상담일", 510, 104),
        createElement("line", 64, 136),
        createCounselingRegion(64, 170, 666, 820),
        createElement("pageNumber", 337, 1054),
      ]),
    ];
  } else if (category === "custom") {
    baseSet.pages = [createPage("빈 페이지", "custom", [createElement("pageNumber", 337, 1054)])];
  } else {
    baseSet.pages = [
      createPage(category === "exam" ? "시험지" : "워크북 페이지", category === "exam" ? "exam" : "problem", [
        createVariable("academy_name", "학원명", 64, 54),
        createText("{{test_title}}", 250, 50, 320, 44, 24),
        createVariable("student_name", "이름", 600, 58),
        createElement("line", 64, 122),
        createProblemRegion(64, 155, 666, 820, category === "worksheet" ? 1 : 2),
        createElement("pageNumber", 337, 1054),
      ]),
    ];
  }

  return baseSet;
}
