"use client";

import { CSSProperties, MouseEvent, PointerEvent, ReactNode, useLayoutEffect, useRef, useState } from "react";

import { MathText } from "@/components/math-text";
import { ProblemVisualRenderer, shouldPreferProblemVisualSchema } from "@/components/problem-visual-renderer";
import { assetUrl } from "@/lib/api";
import { isRegionElement, resolveTemplateText, visualTemplateSampleData } from "@/lib/visualTemplateEngine";
import { ContentRegionElement, ExamStatsChartElement, ExamStatsMetricKey, PAGE_SIZES, SampleProblem, TemplateElement, TemplatePage, TemplateSet, VariableElement, sampleProblems } from "@/lib/visualTemplateTypes";

export type ResizeHandleDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type AlignmentGuide = {
  id: string;
  axis: "x" | "y";
  position: number;
};

export type TemplateSelectionBox = { x: number; y: number; width: number; height: number };

function px(value?: number) {
  return typeof value === "number" ? `${value}px` : undefined;
}

function fontWeight(value?: string) {
  if (value === "medium") return 600;
  if (value === "bold") return 700;
  return 400;
}

function borderCss(style: TemplateElement["style"] | undefined, defaults: { width?: number; style?: string; color?: string } = {}) {
  const width = style?.strokeWidth ?? defaults.width ?? 0;
  const borderStyle = style?.borderStyle ?? defaults.style ?? (width ? "solid" : "none");
  if (borderStyle === "none" || width <= 0) return "none";
  return `${width}px ${borderStyle} ${style?.stroke || defaults.color || "#d8dee9"}`;
}

function boxStyle(style: TemplateElement["style"] | undefined, defaults: { fill?: string; stroke?: string; strokeWidth?: number; borderStyle?: string; radius?: number } = {}): CSSProperties {
  return {
    background: style?.fill ?? defaults.fill,
    border: borderCss(style, { width: defaults.strokeWidth, style: defaults.borderStyle, color: defaults.stroke }),
    borderRadius: style?.radius ?? defaults.radius,
  };
}

function columnDividerLineStyle(region: ContentRegionElement): CSSProperties | null {
  const style = region.columnDividerStyle;
  const width = style?.strokeWidth ?? 0;
  const borderStyle = style?.borderStyle ?? (width > 0 ? "solid" : "none");
  if (region.columns <= 1 || borderStyle === "none" || width <= 0) return null;
  return {
    position: "absolute",
    top: region.padding,
    bottom: region.padding,
    width: 0,
    borderLeft: `${width}px ${borderStyle} ${style?.stroke || "#d8dee9"}`,
    pointerEvents: "none",
    zIndex: 2,
  };
}

function columnDividerLeft(index: number, columns: number, padding: number, gap: number) {
  const fraction = index / columns;
  const offset = padding * (1 - 2 * fraction) + gap * (fraction - 0.5);
  return `calc(${fraction * 100}% + ${offset}px)`;
}

function formatProblemNumber(problem: SampleProblem, region: ContentRegionElement) {
  return formatRegionNumber(problem.number, region);
}

function formatRegionNumber(number: number, region: ContentRegionElement) {
  const format = region.numberFormat || "문 {n}.";
  return format.replace(/\{n\}/g, String(number));
}

export function elementStyle(element: TemplateElement, selected = false): CSSProperties {
  const style = element.style || {};
  const isVariable = element.type === "variable";
  const visibleVariableColor = !style.color || style.color === "transparent" ? "#111827" : style.color;
  return {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: isVariable ? Math.max(32, element.width || 0) : element.width,
    height: isVariable ? Math.max(20, element.height || 0) : element.height,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    transformOrigin: "center center",
    zIndex: selected ? 999 : element.zIndex,
    display: element.hidden ? "none" : "block",
    background: isVariable ? "transparent" : style.fill,
    color: isVariable ? visibleVariableColor : style.color,
    borderColor: isVariable ? "transparent" : style.stroke,
    borderWidth: isVariable ? 0 : style.strokeWidth,
    borderStyle: isVariable ? "none" : style.borderStyle || (style.strokeWidth ? "solid" : "none"),
    borderRadius: px(style.radius),
    boxShadow: style.shadow ? `${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur}px ${style.shadow.color}` : undefined,
    fontFamily: style.fontFamily,
    fontSize: px(style.fontSize),
    fontWeight: fontWeight(style.fontWeight),
    fontStyle: style.fontStyle,
    textAlign: style.textAlign,
    lineHeight: style.lineHeight,
    letterSpacing: px(style.letterSpacing),
    overflow: "hidden",
    userSelect: "none",
  };
}

function renderShape(element: Extract<TemplateElement, { type: "shape" }>) {
  if (element.shape === "circle") {
    return <div className="h-full w-full rounded-full" style={{ background: element.style.fill, border: `${element.style.strokeWidth || 0}px solid ${element.style.stroke || "transparent"}` }} />;
  }
  if (element.shape === "triangle") {
    return (
      <div
        className="mx-auto h-0 w-0"
        style={{
          borderLeft: `${element.width / 2}px solid transparent`,
          borderRight: `${element.width / 2}px solid transparent`,
          borderBottom: `${element.height}px solid ${element.style.fill || "#f8fafc"}`,
        }}
      />
    );
  }
  if (element.shape === "star") {
    return <div className="flex h-full w-full items-center justify-center text-[64px]" style={{ color: element.style.fill || "#f8fafc" }}>★</div>;
  }
  const radius = element.style.radius ?? (element.shape === "roundRect" ? 18 : 0);
  return <div className="h-full w-full" style={{ borderRadius: radius, background: element.style.fill }} />;
}

function renderLine(element: Extract<TemplateElement, { type: "line" }>) {
  const borderStyle = element.lineKind === "dotted" ? "dotted" : element.lineKind === "dashed" ? "dashed" : "solid";
  if (element.lineKind === "double") {
    return (
      <div className="flex h-full w-full flex-col justify-between">
        <div style={{ borderTop: `${element.style.strokeWidth || 1}px solid ${element.style.stroke || "#111827"}` }} />
        <div style={{ borderTop: `${element.style.strokeWidth || 1}px solid ${element.style.stroke || "#111827"}` }} />
      </div>
    );
  }
  return <div className="absolute left-0 right-0 top-1/2" style={{ borderTop: `${element.style.strokeWidth || 1}px ${borderStyle} ${element.style.stroke || "#111827"}` }} />;
}

function renderTable(element: Extract<TemplateElement, { type: "table" }>) {
  const rows = Array.from({ length: element.rows });
  const columns = Array.from({ length: element.columns });
  return (
    <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${element.columns}, 1fr)` }}>
      {rows.flatMap((_, rowIndex) =>
        columns.map((_, columnIndex) => (
          <div
            key={`${rowIndex}-${columnIndex}`}
            className={rowIndex === 0 && element.headerRow ? "bg-slate-100" : "bg-white"}
            style={{ borderRight: "1px solid #d8dee9", borderBottom: "1px solid #d8dee9" }}
          />
        ))
      )}
    </div>
  );
}

type ExamStatsChartPoint = {
  title: string;
  date?: string;
  average?: number;
  highest?: number;
  lowest?: number;
  q1?: number;
  q2?: number;
  q3?: number;
  stddev?: number;
  respondents?: number;
};

const examStatsMetricConfig: Record<ExamStatsMetricKey, { label: string; shortLabel: string; color: string }> = {
  average: { label: "응시자 평균", shortLabel: "평균", color: "#8b5cf6" },
  highest: { label: "최고점", shortLabel: "최고", color: "#10b981" },
  lowest: { label: "최저점", shortLabel: "최저", color: "#f43f5e" },
  q1: { label: "Q1", shortLabel: "Q1", color: "#0ea5e9" },
  q2: { label: "Q2 중앙값", shortLabel: "Q2", color: "#eab308" },
  q3: { label: "Q3", shortLabel: "Q3", color: "#f97316" },
  stddev: { label: "표준편차", shortLabel: "σ", color: "#64748b" },
};
const defaultExamStatsMetrics: ExamStatsMetricKey[] = ["average", "q2"];

function scoreValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointDateKey(value?: string) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function filterExamStatsPoints(points: ExamStatsChartPoint[], element: ExamStatsChartElement) {
  const start = element.xAxisDateStart || "";
  const end = element.xAxisDateEnd || "";
  if (!start && !end) return points;
  return points.filter((point) => {
    const key = pointDateKey(point.date);
    if (!key) return false;
    return (!start || key >= start) && (!end || key <= end);
  });
}

function clampChartValue(value: number, min: number, max: number) {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

function sampleExamStatsPoints(): ExamStatsChartPoint[] {
  try {
    const parsed = JSON.parse(String(visualTemplateSampleData.exam_stats_series_json || "[]"));
    if (Array.isArray(parsed)) {
      return parsed.map((point, index) => ({
        title: String(point.title || `시험 ${index + 1}`),
        date: point.date ? String(point.date) : undefined,
        average: scoreValue(point.average) ?? undefined,
        highest: scoreValue(point.highest) ?? undefined,
        lowest: scoreValue(point.lowest) ?? undefined,
        q1: scoreValue(point.q1) ?? undefined,
        q2: scoreValue(point.q2) ?? undefined,
        q3: scoreValue(point.q3) ?? undefined,
        stddev: scoreValue(point.stddev) ?? undefined,
        respondents: scoreValue(point.respondents) ?? undefined,
      }));
    }
  } catch {
    return [];
  }
  return [];
}

function renderExamStatsChart(element: ExamStatsChartElement) {
  const points = filterExamStatsPoints(sampleExamStatsPoints(), element);
  const metrics = (element.metrics?.length ? element.metrics : defaultExamStatsMetrics).filter((metric) => examStatsMetricConfig[metric]);
  const mode = element.chartMode || "line";
  const yMin = Number.isFinite(element.yAxisMin) ? element.yAxisMin : 0;
  const yMax = Number.isFinite(element.yAxisMax) && element.yAxisMax > yMin ? element.yAxisMax : 100;
  const viewWidth = Math.max(320, element.width);
  const viewHeight = Math.max(180, element.height);
  const titleHeight = element.title ? 30 : 10;
  const legendHeight = element.showLegend ? 28 : 6;
  const showPointLabels = element.showPointLabels === true;
  const showRespondents = element.showRespondents === true;
  const xLabelHeight = showPointLabels ? 32 : 8;
  const padding = { top: titleHeight + 10, right: 20, bottom: xLabelHeight + legendHeight + 8, left: 38 };
  const plotWidth = Math.max(1, viewWidth - padding.left - padding.right);
  const plotHeight = Math.max(1, viewHeight - padding.top - padding.bottom);
  const baseline = padding.top + plotHeight;
  const xFor = (index: number) => padding.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) => padding.top + ((yMax - clampChartValue(value, yMin, yMax)) / (yMax - yMin)) * plotHeight;
  const ticks = [yMax, yMin + (yMax - yMin) * 0.75, yMin + (yMax - yMin) * 0.5, yMin + (yMax - yMin) * 0.25, yMin];
  const fill = element.style?.fill || "#ffffff";
  const textColor = element.style?.color || "#111827";
  const mutedColor = "#64748b";

  return (
    <div className="h-full w-full overflow-hidden" style={{ background: fill }}>
      {!points.length ? (
        <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-slate-500">시험 통계 데이터가 연결되면 차트가 표시됩니다.</div>
      ) : (
        <svg width="100%" height="100%" viewBox={`0 0 ${viewWidth} ${viewHeight}`} preserveAspectRatio="none" role="img" aria-label={element.title || "시험 통계 차트"}>
          {element.title ? <text x={16} y={24} fontSize={15} fontWeight={700} fill={textColor}>{resolveTemplateText(element.title)}</text> : null}
          {(element.showGrid ?? true) ? ticks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={padding.left} x2={viewWidth - padding.right} y1={y} y2={y} stroke="rgba(148, 163, 184, 0.26)" strokeWidth="1" />
                <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill={mutedColor}>{Math.round(tick)}</text>
              </g>
            );
          }) : null}
          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={baseline} stroke="rgba(100, 116, 139, 0.35)" />
          <line x1={padding.left} x2={viewWidth - padding.right} y1={baseline} y2={baseline} stroke="rgba(100, 116, 139, 0.35)" />

          {mode === "line" ? metrics.map((metric) => {
            const config = examStatsMetricConfig[metric];
            const linePoints = points
              .map((point, index) => {
                const value = scoreValue(point[metric]);
                return value == null ? null : { x: xFor(index), y: yFor(value) };
              })
              .filter((point): point is { x: number; y: number } => !!point);
            return (
              <g key={metric}>
                {linePoints.length > 1 ? <polyline points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={config.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
                {linePoints.map((point, index) => <circle key={`${metric}-${index}`} cx={point.x} cy={point.y} r="3.6" fill={config.color} stroke={fill} strokeWidth="1.5" />)}
              </g>
            );
          }) : null}

          {mode === "bar" ? points.map((point, pointIndex) => {
            const groupWidth = Math.min(72, Math.max(22, metrics.length * 10));
            const barWidth = Math.max(4, Math.min(9, (groupWidth - metrics.length * 2) / Math.max(1, metrics.length)));
            return (
              <g key={point.title}>
                {metrics.map((metric, metricIndex) => {
                  const value = scoreValue(point[metric]);
                  if (value == null) return null;
                  const y = yFor(value);
                  const x = xFor(pointIndex) - groupWidth / 2 + metricIndex * (barWidth + 2);
                  return <rect key={metric} x={x} y={y} width={barWidth} height={Math.max(2, baseline - y)} rx="2" fill={examStatsMetricConfig[metric].color} opacity="0.9" />;
                })}
              </g>
            );
          }) : null}

          {showPointLabels ? points.map((point, index) => (
            <g key={`${point.title}-${index}`}>
              <text x={xFor(index)} y={viewHeight - legendHeight - 18} textAnchor="middle" fontSize="10" fontWeight={700} fill={textColor}>
                {point.title.length > 7 ? `${point.title.slice(0, 7)}…` : point.title}
              </text>
              <text x={xFor(index)} y={viewHeight - legendHeight - 4} textAnchor="middle" fontSize="9" fill={mutedColor}>
                {showRespondents && point.respondents ? `n=${Math.round(point.respondents)}` : point.date || ""}
              </text>
            </g>
          )) : null}

          {element.showLegend ? metrics.map((metric, index) => {
            const config = examStatsMetricConfig[metric];
            const x = padding.left + index * 72;
            return (
              <g key={`legend-${metric}`} transform={`translate(${x}, ${viewHeight - 18})`}>
                <circle cx="0" cy="-3" r="3.4" fill={config.color} />
                <text x="8" y="1" fontSize="10" fill={mutedColor}>{config.shortLabel}</text>
              </g>
            );
          }) : null}
        </svg>
      )}
    </div>
  );
}

function ProblemCard({ problem, region }: { problem: SampleProblem; region: ContentRegionElement }) {
  const fixedSlot = Boolean(region.rows && region.rows > 0);
  const visualUrl = problem.visualUrl || problem.visual_url;
  const hasStructuredVisual = shouldPreferProblemVisualSchema(problem.visual_schema, Boolean(visualUrl));
  return (
    <div
      className="overflow-hidden"
      style={{
        height: fixedSlot ? "100%" : undefined,
        minHeight: fixedSlot ? 0 : region.minItemHeight,
        display: fixedSlot ? "flex" : undefined,
        flexDirection: fixedSlot ? "column" : undefined,
        ...boxStyle(region.cardStyle, { fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1, borderStyle: "solid", radius: 10 }),
        padding: Math.max(10, region.padding * 0.75),
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          style={{
            color: region.numberStyle.color,
            fontSize: region.numberStyle.fontSize,
            fontWeight: fontWeight(region.numberStyle.fontWeight || "bold"),
            fontStyle: region.numberStyle.fontStyle,
            letterSpacing: px(region.numberStyle.letterSpacing),
          }}
        >
          {formatProblemNumber(problem, region)}
        </span>
      </div>
      <div
        className="whitespace-pre-wrap"
        style={{
          color: region.bodyStyle.color,
          fontSize: region.bodyStyle.fontSize,
          lineHeight: region.bodyStyle.lineHeight,
          flex: fixedSlot ? "0 0 auto" : undefined,
          minHeight: fixedSlot ? 0 : undefined,
          overflow: fixedSlot ? "visible" : undefined,
        }}
      >
        <MathText value={problem.text} />
      </div>
      {problem.choices?.length ? <div className="mt-2 grid grid-cols-5 gap-1 text-[11px] text-slate-700">{problem.choices.map((choice, index) => <MathText key={`${index}-${choice}`} value={`${index + 1}) ${choice}`} />)}</div> : null}
      {visualUrl && !hasStructuredVisual ? (
        <img src={assetUrl(visualUrl)} alt="" className="mx-auto mt-3 block h-auto max-w-full object-contain" style={{ width: "min(100%, 420px)", maxHeight: 320 }} />
      ) : hasStructuredVisual ? (
        <ProblemVisualRenderer schema={problem.visual_schema} mathModel={problem.math_model} className="mx-auto mt-3 block h-auto max-w-full object-contain" style={{ width: "min(100%, 420px)", maxHeight: 320 }} />
      ) : null}
      {region.type === "solutionRegion" ? <div className="mt-3 rounded bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700"><MathText value={problem.solution} /></div> : null}
      {region.type === "answerRegion" ? <div className="mt-2 text-[12px] font-bold text-slate-900">{formatProblemNumber(problem, region)} <MathText value={problem.answer || ""} /></div> : null}
      {region.type === "problemRegion" ? (
        <div
          className="mt-3 h-10"
          style={{
            marginTop: fixedSlot ? "auto" : undefined,
            ...boxStyle(region.answerSpaceStyle, { fill: "#ffffff", stroke: "#cbd5e1", strokeWidth: 1, borderStyle: "dashed", radius: 8 }),
          }}
        />
      ) : null}
    </div>
  );
}

function previewProblemSlots(region: ContentRegionElement, problems: SampleProblem[]) {
  if (problems.length) return problems.map((problem) => problem.number);
  const rowCount = region.rows ? Math.max(1, region.rows) : 0;
  const columnCount = Math.max(1, region.columns || 1);
  const count = rowCount ? rowCount * columnCount : Math.max(1, Math.min(6, columnCount * 2));
  return Array.from({ length: count }, (_, index) => index + 1);
}

function ProblemSlotCard({ number, region }: { number: number; region: ContentRegionElement }) {
  const fixedSlot = Boolean(region.rows && region.rows > 0);
  return (
    <div
      className="grid place-items-center overflow-hidden"
      style={{
        height: fixedSlot ? "100%" : undefined,
        minHeight: fixedSlot ? 0 : region.minItemHeight,
        ...boxStyle(region.cardStyle, { fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1, borderStyle: "solid", radius: 10 }),
        padding: Math.max(10, region.padding * 0.75),
      }}
    >
      <span
        style={{
          color: region.numberStyle.color,
          fontSize: Math.max(12, region.numberStyle.fontSize || 12),
          fontWeight: fontWeight(region.numberStyle.fontWeight || "bold"),
          fontStyle: region.numberStyle.fontStyle,
          letterSpacing: px(region.numberStyle.letterSpacing),
        }}
      >
        {formatRegionNumber(number, region)}
      </span>
    </div>
  );
}

function estimatePreviewProblemHeight(problem: SampleProblem, region: ContentRegionElement) {
  const fontSize = region.bodyStyle.fontSize || 12;
  const lineHeight = region.bodyStyle.lineHeight || 1.6;
  const textLines = Math.max(3, Math.ceil((problem.text || "").length / 32));
  const choicesLines = problem.choices?.length ? Math.ceil(problem.choices.join("   ").length / 40) : 0;
  const visualUrl = problem.visualUrl || problem.visual_url;
  const visualSpace = visualUrl || shouldPreferProblemVisualSchema(problem.visual_schema, false) ? 210 : 0;
  return Math.max(region.minItemHeight, 52 + textLines * fontSize * lineHeight + choicesLines * (fontSize + 8) + visualSpace + region.padding);
}

function packKoreanFlowColumns(problems: SampleProblem[], region: ContentRegionElement) {
  const columnCount = Math.max(1, region.columns || 1);
  const usableHeight = Math.max(1, region.height - region.padding * 2);
  const columns: SampleProblem[][] = Array.from({ length: columnCount }, () => []);
  let columnIndex = 0;
  let currentHeight = 0;
  for (const problem of problems) {
    const itemHeight = estimatePreviewProblemHeight(problem, region) + region.rowGap;
    if (currentHeight > 0 && currentHeight + itemHeight > usableHeight) {
      columnIndex += 1;
      currentHeight = 0;
    }
    if (columnIndex >= columnCount) break;
    columns[columnIndex].push(problem);
    currentHeight += itemHeight;
  }
  return columns;
}

function KoreanPassageFlowCard({ problem, region, firstInColumn }: { problem: SampleProblem; region: ContentRegionElement; firstInColumn: boolean }) {
  const flowRegion = { ...region, rows: undefined };
  return (
    <div
      className="overflow-hidden"
      style={{
        minHeight: region.minItemHeight,
        ...boxStyle(region.cardStyle, { fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1, borderStyle: "solid", radius: 10 }),
        padding: Math.max(10, region.padding * 0.75),
      }}
    >
      {firstInColumn ? (
        <div className="mb-3 rounded-[8px] border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700">
          <div className="mb-1 font-bold text-slate-900">[1~3] 다음 글을 읽고 물음에 답하시오.</div>
          <div className="line-clamp-5">국어 지문은 하나의 묶음으로 배치되고, 연결된 문항들이 같은 흐름 안에서 이어집니다. 첫 번째 열을 위에서 아래로 채운 뒤 두 번째 열 상단부터 계속 배치됩니다.</div>
        </div>
      ) : null}
      <ProblemCard problem={problem} region={flowRegion} />
    </div>
  );
}

function renderKoreanPassageFlowRegion(region: ContentRegionElement, problems: SampleProblem[], showChrome: boolean, label: string, dividers: ReactNode) {
  const items = problems.length ? problems : sampleProblems;
  const columns = packKoreanFlowColumns(items, region);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="flex h-full w-full overflow-hidden" style={{ gap: region.columnGap, padding: region.padding }}>
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="min-w-0 flex-1 space-y-3 overflow-hidden">
            {column.map((problem, index) => (
              <KoreanPassageFlowCard key={problem.id} problem={problem} region={region} firstInColumn={index === 0} />
            ))}
          </div>
        ))}
      </div>
      {dividers}
      {showChrome ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-700 shadow-sm ring-1 ring-zinc-200/70">
          <span>{label}</span>
          <span>{region.columns}열 국어형</span>
        </div>
      ) : null}
    </div>
  );
}

const sampleCounselingSections = [
  { id: "notes", label: "개선 포인트", value: "최근 풀이 과정에서 계산 실수를 줄이는 연습이 필요합니다." },
  { id: "weekly_report", label: "다음주 관리 계획", value: "수2 복습 문항을 풀고 오답 문항은 다시 설명하도록 합니다." },
  { id: "next_plan", label: "과제", value: "미친개념 수2 복습 문항 1회독" },
];

function CounselingCard({ section, region }: { section: { id: string; label: string; value: string }; region: ContentRegionElement }) {
  const fixedSlot = Boolean(region.rows && region.rows > 0);
  return (
    <div
      className="overflow-hidden"
      style={{
        height: fixedSlot ? "100%" : undefined,
        minHeight: fixedSlot ? 0 : region.minItemHeight,
        display: fixedSlot ? "flex" : undefined,
        flexDirection: fixedSlot ? "column" : undefined,
        ...boxStyle(region.cardStyle, { fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1, borderStyle: "solid", radius: 10 }),
        padding: Math.max(10, region.padding * 0.75),
      }}
    >
      <div className="mb-2" style={{ color: region.numberStyle.color, fontSize: region.numberStyle.fontSize, fontWeight: fontWeight(region.numberStyle.fontWeight || "bold") }}>
        {section.label}
      </div>
      <div className="whitespace-pre-wrap" style={{ color: region.bodyStyle.color, fontSize: region.bodyStyle.fontSize, lineHeight: region.bodyStyle.lineHeight }}>
        {section.value}
      </div>
    </div>
  );
}

function renderRegion(region: ContentRegionElement, problems: SampleProblem[] = [], showChrome = false) {
  const isCounseling = region.type === "counselingRegion" || region.binding === "counseling";
  const label = isCounseling ? "Counseling Region" : region.binding === "problems" ? "Problem Region" : region.binding === "solutions" || region.binding === "answers" ? "Answer Region" : "Content Region";
  const rowCount = region.rows ? Math.max(1, region.rows) : 0;
  const useSlotPreview = showChrome && region.type === "problemRegion";
  const dividerStyle = columnDividerLineStyle(region);
  const dividers = dividerStyle
    ? Array.from({ length: Math.max(0, region.columns - 1) }, (_, index) => (
        <span
          key={`column-divider-${index + 1}`}
          aria-hidden="true"
          style={{
            ...dividerStyle,
            left: columnDividerLeft(index + 1, Math.max(1, region.columns), region.padding, region.columnGap),
            top: region.padding,
            bottom: region.padding,
          }}
        />
      ))
    : null;
  if (!isCounseling && region.layoutMode === "korean-passage-flow" && !useSlotPreview) {
    return renderKoreanPassageFlowRegion(region, problems, showChrome, label, dividers);
  }
  const grid = (
    <div
      className="grid h-full w-full overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, region.columns)}, minmax(0, 1fr))`,
        gridTemplateRows: rowCount ? `repeat(${rowCount}, minmax(0, 1fr))` : undefined,
        gridAutoRows: rowCount ? undefined : "minmax(0, auto)",
        gridAutoFlow: rowCount && region.fillDirection === "column-first" ? "column" : "row",
        gap: `${region.rowGap}px ${region.columnGap}px`,
        padding: region.padding,
        alignContent: rowCount ? "stretch" : "start",
        alignItems: rowCount ? "stretch" : "start",
      }}
    >
      {useSlotPreview ? previewProblemSlots(region, problems).map((number) => <ProblemSlotCard key={`slot-${number}`} number={number} region={region} />) : problems.length ? problems.map((problem) => <ProblemCard key={problem.id} problem={region.type === "solutionRegion" ? { ...problem, solution: problem.answer || "" } : problem} region={region} />) : <div className="rounded border border-dashed border-zinc-200 bg-white/75 p-3 text-xs text-zinc-700">내보내기 시 문항과 답안이 이 영역에 자동 배치됩니다.</div>}
    </div>
  );
  const body = (
    <div className="relative h-full w-full overflow-hidden">
      {grid}
      {dividers}
      {showChrome ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-700 shadow-sm ring-1 ring-zinc-200/70">
          <span>{label}</span>
          <span>{region.columns}열{rowCount ? ` x ${rowCount}행` : ""}</span>
        </div>
      ) : null}
    </div>
  );
  if (!showChrome) return body;
  return body;
}

function variablePlaceholder(element: Extract<TemplateElement, { type: "variable" }>) {
  const label = element.fallback || element.name || element.variableKey;
  return label.startsWith("{") && label.endsWith("}") ? label : `{${label}}`;
}

function AutoFitVariable({ element }: { element: VariableElement }) {
  const text = variablePlaceholder(element);
  return <AutoFitTextBox element={element} text={text} minFontSize={5} />;
}

function AutoFitTextBox({ element, text, minFontSize: minFontSizeOverride }: { element: Extract<TemplateElement, { type: "text" | "variable" }>; text: string; minFontSize?: number }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const baseFontSize = Math.max(1, element.style?.fontSize ?? 14);
  const minFontSize = Math.min(baseFontSize, minFontSizeOverride ?? Math.max(6, Math.min(9, baseFontSize * 0.72)));
  const [fontSize, setFontSize] = useState(baseFontSize);
  const color = !element.style?.color || element.style.color === "transparent" ? "#111827" : element.style.color;

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    let cancelled = false;
    let frame = 0;

    const fits = (size: number) => {
      node.style.fontSize = `${size}px`;
      return node.scrollWidth <= node.clientWidth + 0.5 && node.scrollHeight <= node.clientHeight + 0.5;
    };

    const fitText = () => {
      if (cancelled) return;
      if (fits(baseFontSize)) {
        setFontSize(baseFontSize);
        return;
      }

      let low = minFontSize;
      let high = baseFontSize;
      let best = minFontSize;
      for (let index = 0; index < 12; index += 1) {
        const mid = (low + high) / 2;
        if (fits(mid)) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }
      setFontSize(Math.max(minFontSize, Math.floor(best * 10) / 10));
    };

    frame = window.requestAnimationFrame(fitText);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitText) : null;
    observer?.observe(node);
    if ("fonts" in document) {
      void document.fonts.ready.then(fitText).catch(() => undefined);
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [baseFontSize, minFontSize, text, element.width, element.height, element.style?.lineHeight, element.style?.letterSpacing]);

  return (
    <div
      ref={nodeRef}
      className="h-full w-full overflow-hidden whitespace-pre-wrap px-1 py-0.5"
      style={{
        color,
        fontSize,
        lineHeight: element.style?.lineHeight ?? 1.35,
        textAlign: element.style?.textAlign ?? "left",
        overflowWrap: "normal",
        wordBreak: "normal",
      }}
    >
      {text}
    </div>
  );
}

export function renderVisualElement(element: TemplateElement, dynamicProblems?: SampleProblem[], showRegionChrome = false): ReactNode {
  if (element.type === "text") return <AutoFitTextBox element={element} text={resolveTemplateText(element.text)} />;
  if (element.type === "richText") return <div className="h-full w-full p-2" dangerouslySetInnerHTML={{ __html: resolveTemplateText(element.html) }} />;
  if (element.type === "variable") {
    return <AutoFitVariable element={element} />;
  }
  if (element.type === "pageNumber") return <div className="flex h-full w-full items-center justify-center">{resolveTemplateText(element.format)}</div>;
  if (element.type === "shape") return renderShape(element);
  if (element.type === "line") return renderLine(element);
  if (element.type === "table") return renderTable(element);
  if (element.type === "image") {
    return element.src ? <img src={element.src} alt="" className="h-full w-full" style={{ objectFit: element.objectFit }} /> : <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">이미지</div>;
  }
  if (element.type === "examStatsChart") return renderExamStatsChart(element);
  if (isRegionElement(element)) return renderRegion(element, dynamicProblems, showRegionChrome);
  if (element.type === "qr") return <div className="grid h-full w-full grid-cols-5 grid-rows-5 gap-1 bg-white p-2">{Array.from({ length: 25 }).map((_, index) => <span key={index} className={index % 2 || index === 12 ? "bg-slate-900" : "bg-slate-200"} />)}</div>;
  if (element.type === "watermark") return <div className="flex h-full w-full items-center justify-center">{element.text}</div>;
  if (element.type === "headerBlock") return <div className="flex h-full w-full items-center justify-between border-b border-slate-900 px-2"><strong>{resolveTemplateText(element.title)}</strong><span className="text-xs text-slate-500">{resolveTemplateText(element.subtitle || "")}</span></div>;
  if (element.type === "footerBlock") return <div className="flex h-full w-full items-center justify-center border-t border-slate-200 text-xs text-slate-500">{resolveTemplateText(element.text)}</div>;
  return null;
}

type TemplatePageViewProps = {
  templateSet: TemplateSet;
  page: TemplatePage & { dynamicPlacements?: Record<string, SampleProblem[]> };
  scale?: number;
  scaleOrigin?: "top" | "top-left";
  selectedIds?: string[];
  selectionBox?: TemplateSelectionBox | null;
  interactive?: boolean;
  alignmentGuides?: AlignmentGuide[];
  renderElementContent?: (element: TemplateElement, defaultContent: ReactNode) => ReactNode;
  onElementPointerDown?: (event: PointerEvent<HTMLDivElement>, element: TemplateElement) => void;
  onElementContextMenu?: (event: MouseEvent<HTMLDivElement>, element: TemplateElement) => void;
  onResizePointerDown?: (event: PointerEvent<HTMLDivElement>, element: TemplateElement, direction: ResizeHandleDirection) => void;
  onRotatePointerDown?: (event: PointerEvent<HTMLDivElement>, element: TemplateElement) => void;
  onSelectPage?: () => void;
  onPagePointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
};

const resizeHandles: Array<{ direction: ResizeHandleDirection; className: string }> = [
  { direction: "nw", className: "-left-2 -top-2 cursor-nwse-resize" },
  { direction: "n", className: "left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize" },
  { direction: "ne", className: "-right-2 -top-2 cursor-nesw-resize" },
  { direction: "e", className: "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize" },
  { direction: "se", className: "-bottom-2 -right-2 cursor-nwse-resize" },
  { direction: "s", className: "left-1/2 -bottom-2 -translate-x-1/2 cursor-ns-resize" },
  { direction: "sw", className: "-bottom-2 -left-2 cursor-nesw-resize" },
  { direction: "w", className: "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize" },
];

export function TemplatePageView({
  templateSet,
  page,
  scale = 1,
  scaleOrigin = "top",
  selectedIds = [],
  selectionBox = null,
  interactive = false,
  alignmentGuides = [],
  renderElementContent,
  onElementPointerDown,
  onElementContextMenu,
  onResizePointerDown,
  onRotatePointerDown,
  onSelectPage,
  onPagePointerDown,
}: TemplatePageViewProps) {
  const size = page.pageSize || templateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <div
      className={`${scaleOrigin === "top-left" ? "origin-top-left" : "origin-top"} relative overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.42)]`}
      style={{
        width: size.width,
        height: size.height,
        transform: `scale(${scale})`,
        marginBottom: size.height * (scale - 1),
        background: page.background.color,
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (onPagePointerDown) {
          onPagePointerDown(event);
        } else {
          onSelectPage?.();
        }
      }}
    >
      {page.background.imageUrl ? <img src={page.background.imageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: page.background.opacity ?? 1 }} /> : null}
      {interactive && page.safeArea ? <div className="pointer-events-none absolute border border-dashed border-slate-300/70" style={{ left: page.safeArea.x, top: page.safeArea.y, width: page.safeArea.width, height: page.safeArea.height }} /> : null}
      {interactive && page.guides?.map((guide) => (
        <div
          key={guide.id}
          className="pointer-events-none absolute bg-zinc-400/70"
          style={guide.axis === "x" ? { left: guide.position, top: 0, width: 1, height: "100%" } : { left: 0, top: guide.position, height: 1, width: "100%" }}
        />
      ))}
      {alignmentGuides.map((guide) => (
        <div
          key={guide.id}
          className="pointer-events-none absolute z-[1400] bg-zinc-500/85 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_18px_rgba(139,92,246,0.55)]"
          style={guide.axis === "x" ? { left: guide.position, top: 0, width: 1, height: "100%" } : { left: 0, top: guide.position, height: 1, width: "100%" }}
        />
      ))}
      {interactive && selectionBox ? (
        <div
          className="pointer-events-none absolute z-[1500] rounded-[6px] border border-zinc-300 bg-zinc-400/15 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
          style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }}
        />
      ) : null}
      {sorted.map((element) => {
        const selected = selectedIds.includes(element.id);
        const defaultContent = renderVisualElement(element, page.dynamicPlacements?.[element.id], interactive);
        return (
          <div
            key={element.id}
            data-element-id={element.id}
            className={`${selected ? "ring-2 ring-zinc-500" : interactive ? "hover:ring-1 hover:ring-zinc-300" : ""} outline-none`}
            tabIndex={interactive ? -1 : undefined}
            style={{ ...elementStyle(element, selected), overflow: interactive && selected ? "visible" : "hidden" }}
            onPointerDown={(event) => {
              if (!interactive || element.locked) return;
              event.currentTarget.focus({ preventScroll: true });
              onElementPointerDown?.(event, element);
            }}
            onContextMenu={(event) => {
              if (!interactive) return;
              onElementContextMenu?.(event, element);
            }}
          >
            <div className="h-full w-full overflow-hidden">{renderElementContent ? renderElementContent(element, defaultContent) : defaultContent}</div>
            {interactive && selected && !element.locked ? (
              <>
                <div className="absolute left-1/2 -top-8 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border border-white bg-zinc-500 shadow-[0_8px_24px_rgba(109,40,217,0.35)]" onPointerDown={(event) => onRotatePointerDown?.(event, element)} />
                <div className="absolute left-1/2 -top-4 h-4 w-px -translate-x-1/2 bg-zinc-400/75" />
                {resizeHandles.map((handle) => (
                  <div
                    key={handle.direction}
                    className={`absolute h-4 w-4 rounded-[4px] border border-zinc-500 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.22)] ${handle.className}`}
                    onPointerDown={(event) => onResizePointerDown?.(event, element, handle.direction)}
                  />
                ))}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
