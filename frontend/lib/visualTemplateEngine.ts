import { nanoid } from "nanoid";

import {
  ContentRegionElement,
  PAGE_SIZES,
  PageRole,
  PreflightIssue,
  SampleProblem,
  TemplateElement,
  TemplatePage,
  TemplateSet,
  sampleProblems,
} from "@/lib/visualTemplateTypes";

export const visualTemplateSampleData: Record<string, string | number> = {
  subject: "수학",
  test_title: "고1 수학 중간고사 대비",
  book_title: "Tena 수학 워크북",
  exam_date: "2026.05.18",
  exam_start_time: "14:00",
  exam_end_time: "15:40",
  exam_time: "14:00 ~ 15:40",
  exam_datetime: "2026.05.18 14:00 ~ 15:40",
  chapter_title: "Chapter 02",
  unit_title: "이차함수",
  academy_name: "Tena Academy",
  teacher_name: "김선생",
  student_name: "김지헌",
  class_name: "고1 내신반",
  date: "2026.05.18",
  year: "2026",
  month: "05",
  day: "18",
  page_number: 1,
  total_pages: 1,
  problem_number: 1,
  problem_text: sampleProblems[0]?.text || "",
  problem_choices: "1, 2, 3, 4, 5",
  problem_answer: "3",
  solution_text: sampleProblems[0]?.solution || "",
  difficulty: "중",
  tags: "고1, 중간고사, 이차함수",
  exam_stats_respondent_count: 24,
  exam_stats_average: 78,
  exam_stats_highest: 96,
  exam_stats_lowest: 42,
  exam_stats_q1: 68,
  exam_stats_q2: 80,
  exam_stats_q3: 88,
  exam_stats_standard_deviation: 12.4,
  exam_stats_series_json: JSON.stringify([
    { title: "시험 1", date: "2026-03-18", average: 70, highest: 90, lowest: 48, q1: 62, q2: 72, q3: 82, stddev: 12, respondents: 24 },
    { title: "시험 2", date: "2026-04-15", average: 74, highest: 92, lowest: 50, q1: 66, q2: 76, q3: 84, stddev: 11, respondents: 24 },
    { title: "시험 3", date: "2026-05-18", average: 78, highest: 94, lowest: 52, q1: 68, q2: 80, q3: 88, stddev: 10, respondents: 24 },
  ]),
  qr_code: "https://tenaforge.com",
};

export const visualTemplateVariableTokens: Array<{ token: string; label: string; group: string }> = [
  { token: "{시험일}", label: "시험일", group: "날짜" },
  { token: "{년}", label: "년", group: "날짜" },
  { token: "{달}", label: "달", group: "날짜" },
  { token: "{일}", label: "일", group: "날짜" },
  { token: "{시험시간}", label: "시험 시간", group: "시간" },
  { token: "{시작시간}", label: "시작 시간", group: "시간" },
  { token: "{종료시간}", label: "종료 시간", group: "시간" },
  { token: "{페이지}", label: "페이지", group: "페이지" },
  { token: "{전체페이지}", label: "전체 페이지", group: "페이지" },
  { token: "{응시자수}", label: "응시자 수", group: "시험 통계" },
  { token: "{응시자평균}", label: "응시자 평균", group: "시험 통계" },
  { token: "{최고점}", label: "최고점", group: "시험 통계" },
  { token: "{최저점}", label: "최저점", group: "시험 통계" },
  { token: "{Q1}", label: "Q1", group: "시험 통계" },
  { token: "{Q2}", label: "Q2 중앙값", group: "시험 통계" },
  { token: "{Q3}", label: "Q3", group: "시험 통계" },
  { token: "{표준편차}", label: "표준편차", group: "시험 통계" },
];

const visualTemplateVariableAliases: Record<string, string> = {
  시험일: "exam_date",
  년: "year",
  연도: "year",
  월: "month",
  달: "month",
  일: "day",
  시험시간: "exam_time",
  시험일시: "exam_datetime",
  시작시간: "exam_start_time",
  종료시간: "exam_end_time",
  페이지: "page_number",
  전체페이지: "total_pages",
  난이도: "difficulty",
  태그: "tags",
  응시자수: "exam_stats_respondent_count",
  응시자평균: "exam_stats_average",
  평균점수: "exam_stats_average",
  최고점: "exam_stats_highest",
  최저점: "exam_stats_lowest",
  Q1: "exam_stats_q1",
  q1: "exam_stats_q1",
  Q2: "exam_stats_q2",
  q2: "exam_stats_q2",
  중앙값: "exam_stats_q2",
  Q3: "exam_stats_q3",
  q3: "exam_stats_q3",
  표준편차: "exam_stats_standard_deviation",
};

const visualTemplateSystemKeys = new Set([
  ...Object.keys(visualTemplateSampleData),
  ...Object.keys(visualTemplateVariableAliases),
  ...Object.values(visualTemplateVariableAliases),
  "n",
]);

const doubleVariablePattern = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
const singleVariablePattern = /(^|[^{])\{\s*([^{}\n]+?)\s*\}(?!\})/g;

function isSystemVariableName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = visualTemplateVariableAliases[trimmed] || trimmed;
  return visualTemplateSystemKeys.has(trimmed) || visualTemplateSystemKeys.has(normalized);
}

function collectManualVariablesFromText(value: string | null | undefined, target: Set<string>) {
  const text = value || "";
  for (const match of text.matchAll(doubleVariablePattern)) {
    const key = match[1].trim();
    if (!isSystemVariableName(key)) target.add(key);
  }
  for (const match of text.matchAll(singleVariablePattern)) {
    const key = match[2].trim();
    if (!isSystemVariableName(key)) target.add(key);
  }
}

export function collectVisualTemplateManualVariables(templateSet: TemplateSet | null | undefined) {
  const variables = new Set<string>();
  for (const page of templateSet?.pages || []) {
    for (const element of page.elements || []) {
      if (element.type === "text") collectManualVariablesFromText(element.text, variables);
      if (element.type === "richText") collectManualVariablesFromText(element.html, variables);
      if (element.type === "pageNumber") collectManualVariablesFromText(element.format, variables);
      if (element.type === "watermark") collectManualVariablesFromText(element.text, variables);
      if (element.type === "headerBlock") {
        collectManualVariablesFromText(element.title, variables);
        collectManualVariablesFromText(element.subtitle, variables);
      }
      if (element.type === "footerBlock") collectManualVariablesFromText(element.text, variables);
      if (element.type === "examStatsChart") collectManualVariablesFromText(element.title, variables);
      if (element.type === "variable" && !isSystemVariableName(element.variableKey)) variables.add(element.variableKey);
      if (element.type === "qr") collectManualVariablesFromText(element.value, variables);
    }
  }
  return Array.from(variables).sort((a, b) => a.localeCompare(b, "ko"));
}

export type RenderedProblemPlacement = {
  problem: SampleProblem;
  regionId: string;
  pageId: string;
};

export type RenderedTemplatePage = TemplatePage & {
  generated?: boolean;
  sourcePageId?: string;
  dynamicPlacements?: Record<string, SampleProblem[]>;
};

function dateParts(data: Record<string, string | number>) {
  const source = String(data.date || data.exam_date || "");
  const match = source.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if (match) {
    return {
      year: match[1],
      month: match[2].padStart(2, "0"),
      day: match[3].padStart(2, "0"),
    };
  }
  const today = new Date();
  return {
    year: String(today.getFullYear()),
    month: String(today.getMonth() + 1).padStart(2, "0"),
    day: String(today.getDate()).padStart(2, "0"),
  };
}

function templateValue(key: string, data: Record<string, string | number>) {
  const prepared: Record<string, string | number> = { ...dateParts(data), ...data };
  const trimmed = key.trim();
  const normalized = visualTemplateVariableAliases[trimmed] || trimmed;
  return prepared[normalized] ?? prepared[trimmed];
}

export function resolveTemplateText(value: string, data = visualTemplateSampleData) {
  const withDoubleBraceVariables = value.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (match, key: string) => {
    const resolved = templateValue(key, data);
    return resolved === undefined || resolved === null ? match : String(resolved);
  });

  return withDoubleBraceVariables.replace(/(^|[^{])\{\s*([^{}\n]+?)\s*\}(?!\})/g, (match, prefix: string, key: string) => {
    const resolved = templateValue(key, data);
    return resolved === undefined || resolved === null ? match : `${prefix}${resolved}`;
  });
}

export function isRegionElement(element: TemplateElement): element is ContentRegionElement {
  return element.type === "problemRegion" || element.type === "solutionRegion" || element.type === "answerRegion" || element.type === "contentRegion" || element.type === "counselingRegion";
}

export function estimateProblemHeight(problem: SampleProblem, region: ContentRegionElement) {
  const bodyFontSize = region.bodyStyle.fontSize || 12;
  const lineHeight = region.bodyStyle.lineHeight || 1.6;
  const textLines = Math.max(2, Math.ceil(problem.text.length / 38));
  const choicesLines = problem.choices?.length ? Math.ceil(problem.choices.join("   ").length / 44) : 0;
  const answerSpace = region.type === "answerRegion" || region.type === "solutionRegion" ? 0 : 42;
  const solutionSpace = region.type === "solutionRegion" ? Math.max(36, Math.ceil((problem.solution || "").length / 46) * bodyFontSize * lineHeight) : 0;
  const visualSpace = problem.visualUrl || problem.visual_url ? 210 : 0;
  const height = 44 + textLines * bodyFontSize * lineHeight + choicesLines * (bodyFontSize + 8) + visualSpace + answerSpace + solutionSpace + region.padding;
  return Math.max(region.minItemHeight, Math.min(region.maxItemHeight || 420, Math.ceil(height)));
}

export function estimateRegionCapacity(region: ContentRegionElement, problems: SampleProblem[]) {
  const columnCount = Math.max(1, region.columns || 1);
  const rowCount = region.rows ? Math.max(1, region.rows) : 0;
  const koreanFlow = region.layoutMode === "korean-passage-flow";
  if (rowCount && !koreanFlow) return Math.min(problems.length, columnCount * rowCount);

  const usableHeight = Math.max(1, region.height - region.padding * 2);
  const heights = problems.map((problem) => estimateProblemHeight(problem, region) + region.rowGap);
  let placed = 0;
  if (koreanFlow) {
    let columnIndex = 0;
    let currentHeight = 0;
    for (const itemHeight of heights) {
      if (currentHeight > 0 && currentHeight + itemHeight > usableHeight) {
        columnIndex += 1;
        currentHeight = 0;
      }
      if (columnIndex >= columnCount) break;
      currentHeight += itemHeight;
      placed += 1;
    }
    return Math.max(1, placed);
  }

  const columnHeights = Array.from({ length: columnCount }, () => 0);
  for (const itemHeight of heights) {
    const targetIndex = region.fillDirection === "row-first" ? placed % columnCount : columnHeights.indexOf(Math.min(...columnHeights));
    if (columnHeights[targetIndex] + itemHeight > usableHeight) break;
    columnHeights[targetIndex] += itemHeight;
    placed += 1;
  }

  return Math.max(1, placed);
}

function clonePageFromTemplate(page: TemplatePage, generatedIndex: number): RenderedTemplatePage {
  return {
    ...page,
    id: `${page.id}-generated-${generatedIndex}-${nanoid(4)}`,
    name: `${page.name} ${generatedIndex + 1}`,
    generated: true,
    sourcePageId: page.id,
    elements: page.elements.map((element) => ({ ...element, id: `${element.id}-generated-${generatedIndex}` })),
    dynamicPlacements: {},
  };
}

function pageMatchesRole(page: TemplatePage, role?: PageRole) {
  if (!role) return true;
  if (page.role === role) return true;
  if (role === "problem" && (page.role === "exam" || page.role === "textbookInner" || page.role === "textbookLeft" || page.role === "textbookRight")) return true;
  return false;
}

function chooseNextPageTemplate(templateSet: TemplateSet, preferredRole?: PageRole, generatedCount = 0) {
  if (preferredRole === "problem") {
    const left = templateSet.pages.find((page) => page.role === "textbookLeft");
    const right = templateSet.pages.find((page) => page.role === "textbookRight");
    if (left && right) return generatedCount % 2 === 0 ? left : right;
  }
  return templateSet.pages.find((page) => pageMatchesRole(page, preferredRole)) || templateSet.pages.find((page) => page.role === "problem" || page.role === "exam") || templateSet.pages[0];
}

export function createDynamicPreviewPages(templateSet: TemplateSet, problems = sampleProblems): RenderedTemplatePage[] {
  const renderedPages: RenderedTemplatePage[] = [];
  let remainingProblems = [...problems];
  let generatedCount = 0;

  for (const page of templateSet.pages) {
    const renderedPage: RenderedTemplatePage = { ...page, dynamicPlacements: {} };
    const regions = page.elements.filter(isRegionElement);

    for (const region of regions) {
      if (!remainingProblems.length) break;
      if (region.binding !== "problems" && region.binding !== "solutions" && region.binding !== "answers") continue;
      const capacity = estimateRegionCapacity(region, remainingProblems);
      renderedPage.dynamicPlacements![region.id] = remainingProblems.slice(0, capacity);
      remainingProblems = remainingProblems.slice(capacity);
    }

    renderedPages.push(renderedPage);
  }

  let safety = 0;
  while (remainingProblems.length && safety < 20) {
    const nextTemplate = chooseNextPageTemplate(templateSet, "problem", generatedCount);
    if (!nextTemplate) break;
    const generatedPage = clonePageFromTemplate(nextTemplate, generatedCount);
    const regions = generatedPage.elements.filter(isRegionElement);
    for (const region of regions) {
      if (!remainingProblems.length) break;
      if (region.binding !== "problems" && region.binding !== "solutions" && region.binding !== "answers") continue;
      const capacity = estimateRegionCapacity(region, remainingProblems);
      generatedPage.dynamicPlacements![region.id] = remainingProblems.slice(0, capacity);
      remainingProblems = remainingProblems.slice(capacity);
    }
    renderedPages.push(generatedPage);
    generatedCount += 1;
    safety += 1;
  }

  return renderedPages;
}

export function validateTemplateSet(templateSet: TemplateSet): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  if (!templateSet.pages.length) {
    issues.push({ id: "no-pages", level: "error", message: "템플릿 세트에 페이지가 없습니다." });
  }

  for (const page of templateSet.pages) {
    const size = page.pageSize || templateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
    const regions = page.elements.filter(isRegionElement);

    if ((page.role === "problem" || page.role === "exam") && !regions.some((region) => region.binding === "problems")) {
      issues.push({ id: `missing-problem-region-${page.id}`, level: "warning", message: `${page.name}에 문항 영역이 없습니다.`, pageId: page.id });
    }
    if (page.role === "solution" && !regions.some((region) => region.binding === "solutions")) {
      issues.push({ id: `missing-solution-region-${page.id}`, level: "warning", message: `${page.name}에 답안 영역이 없습니다.`, pageId: page.id });
    }
    if (page.role === "answer" && !regions.some((region) => region.binding === "answers")) {
      issues.push({ id: `missing-answer-region-${page.id}`, level: "warning", message: `${page.name}에 답안 영역이 없습니다.`, pageId: page.id });
    }

    for (const element of page.elements) {
      if (element.hidden) continue;
      if (element.x < -1 || element.y < -1 || element.x + element.width > size.width + 1 || element.y + element.height > size.height + 1) {
        issues.push({ id: `out-of-bounds-${element.id}`, level: "warning", message: `${page.name}의 "${element.name}" 요소가 페이지 밖으로 나갑니다.`, pageId: page.id, elementId: element.id });
      }
      if (isRegionElement(element) && element.columns < 1) {
        issues.push({ id: `bad-columns-${element.id}`, level: "error", message: `${element.name}의 컬럼 수가 올바르지 않습니다.`, pageId: page.id, elementId: element.id });
      }
      if (isRegionElement(element) && element.rows !== undefined && element.rows < 1) {
        issues.push({ id: `bad-rows-${element.id}`, level: "error", message: `${element.name}의 행 수가 올바르지 않습니다.`, pageId: page.id, elementId: element.id });
      }
      if ((element.type === "image" && !element.src) || (element.type === "qr" && !element.value)) {
        issues.push({ id: `missing-asset-${element.id}`, level: "warning", message: `${element.name}에 연결된 소스가 없습니다.`, pageId: page.id, elementId: element.id });
      }
    }
  }

  return issues;
}
