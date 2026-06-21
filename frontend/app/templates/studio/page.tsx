"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { nanoid } from "nanoid";
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  ArrowLeft,
  BarChart3,
  BoxSelect,
  Braces,
  BringToFront,
  Copy,
  Droplets,
  Eye,
  EyeOff,
  FileStack,
  FileText,
  Grid3X3,
  Hash,
  ImageIcon,
  Layers,
  LineChart,
  Lock,
  MessageSquareText,
  PanelBottom,
  PanelTop,
  Plus,
  QrCode,
  Redo2,
  Save,
  Search,
  SendToBack,
  Shapes,
  SlidersHorizontal,
  Table2,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react";
import { CSSProperties, ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AlignmentGuide, ResizeHandleDirection, TemplatePageView, TemplateSelectionBox } from "@/components/templates/visual-template-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getClipboardImageFiles, imageFileDisplayName, isEditableClipboardTarget, readFileAsDataUrl } from "@/lib/clipboardImages";
import { ClipboardDesignImage, createClipboardEditableElements, createClipboardImageElements, createClipboardRichTextElement, createClipboardTextElement, getClipboardDesignImages, getClipboardPlainText, getClipboardRichTextHtml } from "@/lib/powerpointClipboard";
import { importPowerPointFile } from "@/lib/powerpointPptxImport";
import { createDynamicPreviewPages, isRegionElement, visualTemplateVariableTokens } from "@/lib/visualTemplateEngine";
import { createBlankTemplateSet, createElement, createProblemRegion, pageRoleLabels } from "@/lib/visualTemplatePresets";
import { ElementStyle, ExamStatsDataSource, ExamStatsMetricKey, PAGE_SIZES, PageRole, PageSizePreset, TemplateCategory, TemplateElement, TemplateElementType, TemplatePage, TemplateSet } from "@/lib/visualTemplateTypes";
import { HubTemplatePayload, TemplateCategory as HubTemplateCategory, createHubTemplate, ensureTemplateHubSession, getHubTemplate, importPdfTemplate, updateHubTemplate } from "@/lib/templateHub";

const LOCAL_STORAGE_KEY = "tena-forge-visual-template-studio";
const DEFAULT_TEMPLATE_RETURN_TO = "/templates/mine";

function safeTemplateEditorReturnTo(value: string | null, fallback = DEFAULT_TEMPLATE_RETURN_TO) {
  const candidate = (value || "").trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  try {
    const url = new URL(candidate, "https://tena.local");
    if (url.origin !== "https://tena.local") return fallback;
    if (url.pathname.startsWith("/templates/studio") || url.pathname.startsWith("/templates/editor")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function withReturnTo(path: string, returnTo: string) {
  return `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
}

type StudioPanel = "elements" | "pages" | "variables" | "search" | "layers";
type PaletteGroup = "기본 요소" | "문서 블록" | "동적 영역" | "시스템";
type SaveMode = "manual" | "auto";
type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const panelTabs: Array<{ key: StudioPanel; label: string; icon: typeof Type }> = [
  { key: "elements", label: "요소", icon: BoxSelect },
  { key: "pages", label: "페이지", icon: FileStack },
  { key: "variables", label: "변수", icon: Braces },
  { key: "search", label: "검색", icon: Search },
  { key: "layers", label: "레이어", icon: Layers },
];

const elementPalette: Array<{ type: TemplateElementType; label: string; description: string; group: PaletteGroup; icon: typeof Type }> = [
  { type: "counselingRegion", label: "상담 항목 영역", description: "상담 항목 자동 배치", group: "?숈쟻 ?곸뿭" as PaletteGroup, icon: MessageSquareText },
  { type: "text", label: "텍스트", description: "자유 텍스트 박스", group: "기본 요소", icon: Type },
  { type: "richText", label: "리치 텍스트", description: "강조와 줄바꿈 텍스트", group: "기본 요소", icon: FileText },
  { type: "image", label: "이미지", description: "로고, 표지, 사진", group: "기본 요소", icon: ImageIcon },
  { type: "shape", label: "도형", description: "상자, 원, 별", group: "기본 요소", icon: Shapes },
  { type: "line", label: "선", description: "구분선과 밑줄", group: "기본 요소", icon: SlidersHorizontal },
  { type: "table", label: "표", description: "채점표, 진도표", group: "문서 블록", icon: Table2 },
  { type: "headerBlock", label: "헤더", description: "제목과 브랜드 블록", group: "문서 블록", icon: PanelTop },
  { type: "footerBlock", label: "푸터", description: "하단 정보 블록", group: "문서 블록", icon: PanelBottom },
  { type: "problemRegion", label: "문항 영역", description: "문항 자동 배치", group: "동적 영역", icon: FileStack },
  { type: "solutionRegion", label: "답안 영역", description: "답안 자동 배치", group: "동적 영역", icon: FileText },
  { type: "answerRegion", label: "답안 영역", description: "답안 자동 배치", group: "동적 영역", icon: Grid3X3 },
  { type: "contentRegion", label: "콘텐츠 영역", description: "범용 동적 영역", group: "동적 영역", icon: BoxSelect },
  { type: "examStatsChart", label: "시험 통계 차트", description: "평균, 최고/최저, 분위수 추이", group: "동적 영역", icon: LineChart },
  { type: "pageNumber", label: "페이지 번호", description: "자동 페이지 표시", group: "시스템", icon: Hash },
  { type: "qr", label: "QR 코드", description: "QR 자리 표시자", group: "시스템", icon: QrCode },
  { type: "watermark", label: "워터마크", description: "보안과 브랜드 표시", group: "시스템", icon: Droplets },
];

function cloneTemplateSet(templateSet: TemplateSet): TemplateSet {
  return JSON.parse(JSON.stringify(templateSet)) as TemplateSet;
}

const examStatsMetricKeys: ExamStatsMetricKey[] = ["average", "highest", "lowest", "q1", "q2", "q3", "stddev"];
const defaultExamStatsChartMetrics: ExamStatsMetricKey[] = ["average", "q2"];
const validExamStatsMetricSet = new Set<string>(examStatsMetricKeys);

function finiteOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeExamStatsElement(element: TemplateElement): TemplateElement {
  if (element.type !== "examStatsChart") return element;
  const metrics = (Array.isArray(element.metrics) ? element.metrics : [])
    .filter((metric): metric is ExamStatsMetricKey => validExamStatsMetricSet.has(String(metric)));
  const yAxisMin = finiteOr(element.yAxisMin, 0);
  const rawMax = finiteOr(element.yAxisMax, 100);
  const yAxisMax = rawMax > yAxisMin ? rawMax : 100;
  return {
    ...element,
    title: element.title || "시험 통계",
    chartMode: element.chartMode === "bar" ? "bar" : "line",
    metrics: metrics.length ? metrics : defaultExamStatsChartMetrics,
    dataSource: element.dataSource === "studentExamHistory" ? "studentExamHistory" : "templateVariable",
    dataVariableKey: element.dataVariableKey || "exam_stats_series_json",
    xAxisDateStart: element.xAxisDateStart || "",
    xAxisDateEnd: element.xAxisDateEnd || "",
    showLegend: element.showLegend !== false,
    showGrid: element.showGrid !== false,
    showPointLabels: element.showPointLabels === true,
    showRespondents: element.showRespondents === true,
    yAxisMin,
    yAxisMax,
  };
}

function sanitizeTemplateSetForSave(templateSet: TemplateSet): TemplateSet {
  const next = cloneTemplateSet(templateSet);
  next.pages = next.pages.map((page) => ({
    ...page,
    elements: page.elements.map(normalizeExamStatsElement),
  }));
  return JSON.parse(JSON.stringify(next)) as TemplateSet;
}

function mapToHubCategory(category: TemplateCategory): HubTemplateCategory {
  if (category === "textbook") return "workbook";
  if (category === "solution") return "solution_book";
  if (category === "answerSheet") return "worksheet";
  if (category === "report") return "concept_note";
  if (category === "counseling") return "counseling_log";
  if (category === "custom") return "exam";
  return category;
}

function templateSnapshot(templateSet: TemplateSet) {
  return JSON.stringify(templateSet);
}

function visualTemplatePayload(templateSet: TemplateSet): HubTemplatePayload {
  const safeTemplateSet = sanitizeTemplateSetForSave(templateSet);
  return {
    title: safeTemplateSet.title,
    description: safeTemplateSet.description || null,
    category: mapToHubCategory(safeTemplateSet.category),
    visibility: safeTemplateSet.visibility === "academy" ? "unlisted" : safeTemplateSet.visibility === "marketplace" ? "marketplace" : safeTemplateSet.visibility,
    html: "<!-- Visual Template Studio: render from schema_json.visualTemplateSet -->",
    css: "",
    schema_json: { visualTemplateSet: safeTemplateSet, schemaVersion: safeTemplateSet.schemaVersion },
    thumbnail_url: null,
    source_type: safeTemplateSet.sourceType || "self_created",
    rights_confirmed: safeTemplateSet.rightsConfirmed ?? true,
  };
}

function createStudioPage(role: PageRole, templateSet: TemplateSet): TemplatePage {
  const size = templateSet.defaultPageSize;
  const page: TemplatePage = {
    id: nanoid(),
    name: pageRoleLabels[role],
    role,
    pageSize: size,
    background: { color: "#ffffff" },
    safeArea: { x: 48, y: 48, width: size.width - 96, height: size.height - 96 },
    guides: [],
    elements: [],
  };

  if (role === "problem" || role === "exam" || role === "textbookInner" || role === "textbookLeft" || role === "textbookRight") {
    page.elements.push(createProblemRegion(64, 150, size.width - 128, size.height - 260, role === "exam" ? 2 : 1));
  }
  page.elements.push(createElement("pageNumber", size.width / 2 - 60, size.height - 70));
  return page;
}

function getElementLabel(element: TemplateElement) {
  return `${element.name}${element.locked ? " · 잠김" : ""}${element.hidden ? " · 숨김" : ""}`;
}

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function maxVisualCornerRadius(element: Pick<TemplateElement, "width" | "height">) {
  return Math.max(0, Math.floor(Math.min(element.width || 0, element.height || 0) / 2));
}

function visualCornerRadius(element: TemplateElement) {
  return clampNumber(Math.round(element.style.radius ?? 0), 0, maxVisualCornerRadius(element));
}

function canRoundVisualElement(element: TemplateElement | null) {
  return Boolean(element && element.type === "shape" && (element.shape === "rect" || element.shape === "roundRect"));
}

function InspectorSection({ title, children, compact = false }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <section className={cls("rounded-[11px] border border-white/10 bg-white/[0.045] shadow-[0_14px_36px_rgba(0,0,0,0.18)]", compact ? "p-2.5" : "p-3")}>
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const borderStyleOptions: Array<{ value: NonNullable<ElementStyle["borderStyle"]>; label: string }> = [
  { value: "none", label: "없음" },
  { value: "solid", label: "실선" },
  { value: "dashed", label: "점선" },
  { value: "dotted", label: "점점선" },
];

const numberFormatOptions = [
  { value: "문 {n}.", label: "문 1." },
  { value: "{n}.", label: "1." },
  { value: "Q{n}.", label: "Q1." },
  { value: "[{n}]", label: "[1]" },
  { value: "({n})", label: "(1)" },
  { value: "{n}번", label: "1번" },
];

const examStatsMetricOptions: Array<{ key: ExamStatsMetricKey; label: string }> = [
  { key: "average", label: "응시자 평균" },
  { key: "highest", label: "최고점" },
  { key: "lowest", label: "최저점" },
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2 중앙값" },
  { key: "q3", label: "Q3" },
  { key: "stddev", label: "표준편차" },
];

const examStatsMetricPresets: Array<{ label: string; metrics: ExamStatsMetricKey[] }> = [
  { label: "핵심", metrics: ["average", "q2"] },
  { label: "범위", metrics: ["average", "highest", "lowest"] },
  { label: "분위수", metrics: ["q1", "q2", "q3"] },
  { label: "전체", metrics: examStatsMetricKeys },
];

const knownVariableTokens = new Set(visualTemplateVariableTokens.map((token) => token.token));

function variableTokenName(token: string) {
  return token.replace(/^\{|\}$/g, "");
}

function activeVariableQuery(value: string, caret: number) {
  if (caret < 0) return null;
  const prefix = value.slice(0, caret);
  const openIndex = prefix.lastIndexOf("{");
  if (openIndex < 0) return null;
  const query = prefix.slice(openIndex + 1);
  if (query.includes("}") || query.includes("\n") || query.length > 24) return null;
  return { start: openIndex, query };
}

function highlightedVariableParts(value: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /\{[^{}\n]+\}/g;
  let cursor = 0;
  let index = 0;

  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const start = match.index || 0;
    if (start > cursor) parts.push(value.slice(cursor, start));
    if (knownVariableTokens.has(token)) {
      parts.push(
        <span key={`${token}-${index}`} className="rounded bg-zinc-400/18 font-semibold text-zinc-200 ring-1 ring-zinc-300/20">
          {token}
        </span>
      );
    } else {
      parts.push(token);
    }
    cursor = start + token.length;
    index += 1;
  }

  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts.length ? parts : "\u200b";
}

function VariableTextArea({
  value,
  onChange,
  minHeight = "min-h-[100px]",
  mono = false,
}: {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  mono?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const active = activeVariableQuery(value, caret);
  const suggestions = active
    ? visualTemplateVariableTokens.filter((token) => {
        const query = active.query.trim().toLowerCase();
        if (!query) return true;
        return token.label.toLowerCase().includes(query) || variableTokenName(token.token).toLowerCase().includes(query);
      })
    : [];
  const menuOpen = Boolean(active && suggestions.length);
  const textClassName = cls("w-full resize-y whitespace-pre-wrap break-words p-2 leading-relaxed", minHeight, mono ? "font-mono text-xs" : "text-sm");

  function syncCaret() {
    const node = textareaRef.current;
    if (!node) return;
    setCaret(node.selectionStart ?? 0);
  }

  function insertToken(token: string) {
    const node = textareaRef.current;
    const selectionStart = node?.selectionStart ?? caret;
    const selectionEnd = node?.selectionEnd ?? selectionStart;
    const current = activeVariableQuery(value, selectionStart);
    const start = current?.start ?? selectionStart;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(selectionEnd)}`;
    const nextCaret = start + token.length;
    onChange(nextValue);
    setActiveIndex(0);
    setCaret(nextCaret);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!menuOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertToken(suggestions[activeIndex]?.token || suggestions[0].token);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setCaret(-1);
    }
  }

  return (
    <div className="relative">
      <div className="relative rounded-md border border-white/10 bg-white/[0.04] focus-within:border-zinc-400/50">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
          <div
            aria-hidden="true"
            className={cls(textClassName, "border border-transparent text-slate-100")}
            style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
          >
            {highlightedVariableParts(value)}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          className={cls(textClassName, "relative z-10 border-0 bg-transparent text-transparent caret-white outline-none selection:bg-zinc-400/30")}
          value={value}
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart ?? 0);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          onClick={syncCaret}
          onKeyUp={syncCaret}
          onSelect={syncCaret}
          onScroll={(event) => setScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}
        />
      </div>
      {menuOpen ? (
        <div className="absolute left-2 right-2 top-9 z-40 max-h-64 overflow-y-auto rounded-[10px] border border-white/10 bg-[#11131a] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
          {suggestions.map((token, index) => (
            <button
              key={token.token}
              type="button"
              className={cls(
                "flex w-full items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-left text-sm transition",
                index === activeIndex ? "bg-zinc-400/14 text-zinc-100" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                insertToken(token.token);
              }}
            >
              <span className="font-mono font-semibold">{token.token}</span>
              <span className="truncate text-[11px] text-slate-500">{token.group}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function inlineEditorFontWeight(value?: ElementStyle["fontWeight"]) {
  if (value === "medium") return 600;
  if (value === "bold") return 700;
  return 400;
}

function InlineTextEditor({
  element,
  onChange,
  onExit,
}: {
  element: Extract<TemplateElement, { type: "text" }>;
  onChange: (value: string) => void;
  onExit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const style: CSSProperties = {
    color: element.style.color || "#111827",
    fontFamily: element.style.fontFamily,
    fontSize: element.style.fontSize ? `${element.style.fontSize}px` : undefined,
    fontWeight: inlineEditorFontWeight(element.style.fontWeight),
    fontStyle: element.style.fontStyle,
    textAlign: element.style.textAlign || "left",
    lineHeight: element.style.lineHeight,
    letterSpacing: element.style.letterSpacing != null ? `${element.style.letterSpacing}px` : undefined,
  };

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    window.requestAnimationFrame(() => {
      node.focus({ preventScroll: true });
      const caret = node.value.length;
      node.setSelectionRange(caret, caret);
    });
  }, [element.id]);

  return (
    <textarea
      ref={textareaRef}
      aria-label="Edit text box"
      className="h-full w-full cursor-text resize-none select-text whitespace-pre-wrap bg-transparent p-1 outline-none ring-0 selection:bg-zinc-400/25"
      style={style}
      value={element.text}
      spellCheck={false}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
          onExit();
        }
      }}
      onBlur={onExit}
    />
  );
}

function colorInputValue(value: string | undefined, fallback: string) {
  return normalizeHexColor(value) || fallback;
}

function BorderStyleControls({ title, style, onChange, fillLabel = "배경" }: { title: string; style: ElementStyle; onChange: (patch: Partial<ElementStyle>) => void; fillLabel?: string }) {
  const borderStyle = style.borderStyle || ((style.strokeWidth ?? 1) > 0 ? "solid" : "none");
  const borderEnabled = borderStyle !== "none" && (style.strokeWidth ?? 0) > 0;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{title}</div>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
          <input
            type="checkbox"
            checked={borderEnabled}
            onChange={(event) =>
              onChange(event.target.checked ? { borderStyle: borderStyle === "none" ? "solid" : borderStyle, strokeWidth: Math.max(1, style.strokeWidth || 1), stroke: style.stroke || "#d8dee9" } : { borderStyle: "none", strokeWidth: 0 })
            }
          />
          테두리 표시
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label={fillLabel}>
          <div className="flex gap-1.5">
            <Input className="h-8 flex-1" type="color" value={colorInputValue(style.fill, "#ffffff")} onChange={(event) => onChange({ fill: event.target.value })} />
            <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={() => onChange({ fill: "transparent" })}>투명</Button>
          </div>
        </FieldLabel>
        <FieldLabel label="테두리 색">
          <Input className="h-8" type="color" value={colorInputValue(style.stroke, "#d8dee9")} onChange={(event) => onChange({ stroke: event.target.value })} />
        </FieldLabel>
        <FieldLabel label="테두리 방식">
          <select className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none" value={borderStyle} onChange={(event) => onChange({ borderStyle: event.target.value as ElementStyle["borderStyle"], strokeWidth: event.target.value === "none" ? 0 : Math.max(1, style.strokeWidth || 1) })}>
            {borderStyleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="테두리 두께">
          <Input className="h-8" type="number" min={0} max={40} value={style.strokeWidth ?? 0} onChange={(event) => onChange({ strokeWidth: clampNumber(Number(event.target.value), 0, 40), borderStyle: Number(event.target.value) <= 0 ? "none" : borderStyle === "none" ? "solid" : borderStyle })} />
        </FieldLabel>
        <FieldLabel label="둥근 정도">
          <Input className="h-8" type="number" min={0} max={80} value={style.radius ?? 0} onChange={(event) => onChange({ radius: clampNumber(Number(event.target.value), 0, 80) })} />
        </FieldLabel>
      </div>
    </div>
  );
}

function RegionDividerControls({ style, onChange }: { style?: ElementStyle; onChange: (patch: Partial<ElementStyle>) => void }) {
  const dividerStyle: ElementStyle = { stroke: "#d8dee9", strokeWidth: 0, borderStyle: "none", ...style };
  const borderStyle = dividerStyle.borderStyle || ((dividerStyle.strokeWidth ?? 0) > 0 ? "solid" : "none");
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">열 분할선</div>
      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="선 색">
          <Input className="h-8" type="color" value={colorInputValue(dividerStyle.stroke, "#d8dee9")} onChange={(event) => onChange({ stroke: event.target.value })} />
        </FieldLabel>
        <FieldLabel label="선 방식">
          <select className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none" value={borderStyle} onChange={(event) => onChange({ borderStyle: event.target.value as ElementStyle["borderStyle"], strokeWidth: event.target.value === "none" ? 0 : Math.max(1, dividerStyle.strokeWidth || 1) })}>
            {borderStyleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="선 두께">
          <Input className="h-8" type="number" min={0} max={24} value={dividerStyle.strokeWidth ?? 0} onChange={(event) => onChange({ strokeWidth: clampNumber(Number(event.target.value), 0, 24), borderStyle: Number(event.target.value) <= 0 ? "none" : borderStyle === "none" ? "solid" : borderStyle })} />
        </FieldLabel>
      </div>
    </div>
  );
}

function RegionNumberControls({ region, onChange }: { region: Extract<TemplateElement, { type: "problemRegion" | "solutionRegion" | "answerRegion" | "contentRegion" | "counselingRegion" }>; onChange: (patch: Partial<typeof region>) => void }) {
  const currentFormat = region.numberFormat || "문 {n}.";
  const selectedPreset = numberFormatOptions.some((option) => option.value === currentFormat) ? currentFormat : "custom";
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-2.5">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">문항 번호 표시</div>
      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="형식">
          <select className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none" value={selectedPreset} onChange={(event) => event.target.value !== "custom" && onChange({ numberFormat: event.target.value })}>
            {numberFormatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="custom">직접 입력</option>
          </select>
        </FieldLabel>
        <FieldLabel label="직접 형식">
          <Input className="h-8" value={currentFormat} onChange={(event) => onChange({ numberFormat: event.target.value || "{n}." })} />
        </FieldLabel>
        <FieldLabel label="번호 색">
          <Input className="h-8" type="color" value={colorInputValue(region.numberStyle.color, "#18181b")} onChange={(event) => onChange({ numberStyle: { ...region.numberStyle, color: event.target.value } })} />
        </FieldLabel>
        <FieldLabel label="번호 크기">
          <Input className="h-8" type="number" min={8} max={36} value={region.numberStyle.fontSize || 12} onChange={(event) => onChange({ numberStyle: { ...region.numberStyle, fontSize: clampNumber(Number(event.target.value), 8, 36) } })} />
        </FieldLabel>
        <FieldLabel label="번호 굵기">
          <select className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none" value={region.numberStyle.fontWeight || "bold"} onChange={(event) => onChange({ numberStyle: { ...region.numberStyle, fontWeight: event.target.value as ElementStyle["fontWeight"] } })}>
            <option value="normal">보통</option>
            <option value="medium">중간</option>
            <option value="bold">굵게</option>
          </select>
        </FieldLabel>
      </div>
    </div>
  );
}

const MIN_ELEMENT_SIZE = 18;
const SNAP_THRESHOLD = 6;

type SnapTarget = {
  axis: "x" | "y";
  position: number;
};

type ElementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getElementBox(element: Pick<TemplateElement, "x" | "y" | "width" | "height">): ElementBox {
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

function getBoundingBox(elements: TemplateElement[]): ElementBox {
  if (!elements.length) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function boxesIntersect(a: ElementBox, b: ElementBox) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getBoxAnchors(box: ElementBox) {
  return {
    x: [box.x, box.x + box.width / 2, box.x + box.width],
    y: [box.y, box.y + box.height / 2, box.y + box.height],
  };
}

function uniqueGuides(guides: AlignmentGuide[]) {
  const seen = new Set<string>();
  return guides.filter((guide) => {
    const key = `${guide.axis}:${Math.round(guide.position)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectSnapTargets(page: TemplatePage, templateSet: TemplateSet, movingIds: string[]): SnapTarget[] {
  const size = page.pageSize || templateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
  const targets: SnapTarget[] = [
    { axis: "x", position: 0 },
    { axis: "x", position: size.width / 2 },
    { axis: "x", position: size.width },
    { axis: "y", position: 0 },
    { axis: "y", position: size.height / 2 },
    { axis: "y", position: size.height },
  ];

  if (page.safeArea) {
    targets.push(
      { axis: "x", position: page.safeArea.x },
      { axis: "x", position: page.safeArea.x + page.safeArea.width / 2 },
      { axis: "x", position: page.safeArea.x + page.safeArea.width },
      { axis: "y", position: page.safeArea.y },
      { axis: "y", position: page.safeArea.y + page.safeArea.height / 2 },
      { axis: "y", position: page.safeArea.y + page.safeArea.height }
    );
  }

  page.elements.forEach((element) => {
    if (movingIds.includes(element.id) || element.hidden) return;
    const anchors = getBoxAnchors(getElementBox(element));
    anchors.x.forEach((position) => targets.push({ axis: "x", position }));
    anchors.y.forEach((position) => targets.push({ axis: "y", position }));
  });

  return targets;
}

function calculateMoveSnap(page: TemplatePage, templateSet: TemplateSet, startElements: TemplateElement[], movingIds: string[], dx: number, dy: number) {
  const startBox = getBoundingBox(startElements);
  const movingBox = { ...startBox, x: startBox.x + dx, y: startBox.y + dy };
  const anchors = getBoxAnchors(movingBox);
  const targets = collectSnapTargets(page, templateSet, movingIds);
  const guides: AlignmentGuide[] = [];
  let snappedDx = dx;
  let snappedDy = dy;

  for (const axis of ["x", "y"] as const) {
    let best: { distance: number; delta: number; position: number } | undefined;
    for (const anchor of anchors[axis]) {
      for (const target of targets) {
        if (target.axis !== axis) continue;
        const distance = Math.abs(anchor - target.position);
        if (distance <= SNAP_THRESHOLD && (!best || distance < best.distance)) {
          best = { distance, delta: target.position - anchor, position: target.position };
        }
      }
    }

    if (best) {
      if (axis === "x") snappedDx += best.delta;
      else snappedDy += best.delta;
      guides.push({ id: `snap-${axis}-${Math.round(best.position)}`, axis, position: best.position });
    }
  }

  return { dx: snappedDx, dy: snappedDy, guides: uniqueGuides(guides) };
}

function resizeFromHandle(start: TemplateElement, dx: number, dy: number, direction: ResizeHandleDirection): TemplateElement {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (direction.includes("e")) width = start.width + dx;
  if (direction.includes("s")) height = start.height + dy;
  if (direction.includes("w")) {
    width = start.width - dx;
    x = start.x + dx;
  }
  if (direction.includes("n")) {
    height = start.height - dy;
    y = start.y + dy;
  }

  if (width < MIN_ELEMENT_SIZE) {
    if (direction.includes("w")) x = start.x + start.width - MIN_ELEMENT_SIZE;
    width = MIN_ELEMENT_SIZE;
  }
  if (height < MIN_ELEMENT_SIZE) {
    if (direction.includes("n")) y = start.y + start.height - MIN_ELEMENT_SIZE;
    height = MIN_ELEMENT_SIZE;
  }

  return { ...start, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

type TemplateColorToken = {
  color: string;
  count: number;
};

const STYLE_COLOR_KEYS: Array<keyof Pick<ElementStyle, "fill" | "stroke" | "color">> = ["fill", "stroke", "color"];

function normalizeHexColor(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(trimmed)) return null;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

function incrementColor(counts: Map<string, number>, value?: string | null) {
  const color = normalizeHexColor(value);
  if (!color) return;
  counts.set(color, (counts.get(color) || 0) + 1);
}

function collectInlineColors(value: string | undefined, counts: Map<string, number>) {
  if (!value) return;
  for (const match of value.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g)) {
    incrementColor(counts, match[0]);
  }
}

function collectStyleColors(style: ElementStyle | undefined, counts: Map<string, number>) {
  if (!style) return;
  STYLE_COLOR_KEYS.forEach((key) => incrementColor(counts, style[key]));
  incrementColor(counts, style.shadow?.color);
}

function replaceColorValue(value: string | undefined, from: string, to: string) {
  return normalizeHexColor(value) === from ? to : value;
}

function replaceInlineColors(value: string | undefined, from: string, to: string) {
  if (!value) return value;
  return value.replace(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g, (match) => (normalizeHexColor(match) === from ? to : match));
}

function replaceStyleColors(style: ElementStyle, from: string, to: string): ElementStyle {
  const next: ElementStyle = { ...style };
  STYLE_COLOR_KEYS.forEach((key) => {
    const replaced = replaceColorValue(next[key], from, to);
    if (replaced !== undefined) next[key] = replaced;
  });
  if (next.shadow) {
    next.shadow = { ...next.shadow, color: replaceColorValue(next.shadow.color, from, to) || next.shadow.color };
  }
  return next;
}

function collectElementColors(element: TemplateElement, counts: Map<string, number>) {
  collectStyleColors(element.style, counts);
  if (element.type === "richText") collectInlineColors(element.html, counts);
  if (isRegionElement(element)) {
    collectStyleColors(element.cardStyle, counts);
    collectStyleColors(element.numberStyle, counts);
    collectStyleColors(element.bodyStyle, counts);
    collectStyleColors(element.answerSpaceStyle, counts);
    if (element.columnDividerStyle) collectStyleColors(element.columnDividerStyle, counts);
  }
}

function replaceElementColors(element: TemplateElement, from: string, to: string): TemplateElement {
  let next = { ...element, style: replaceStyleColors(element.style, from, to) } as TemplateElement;
  if (next.type === "richText") next = { ...next, html: replaceInlineColors(next.html, from, to) || next.html };
  if (isRegionElement(next)) {
    next = {
      ...next,
      cardStyle: replaceStyleColors(next.cardStyle, from, to),
      numberStyle: replaceStyleColors(next.numberStyle, from, to),
      bodyStyle: replaceStyleColors(next.bodyStyle, from, to),
      answerSpaceStyle: replaceStyleColors(next.answerSpaceStyle, from, to),
      columnDividerStyle: next.columnDividerStyle ? replaceStyleColors(next.columnDividerStyle, from, to) : next.columnDividerStyle,
    };
  }
  return next;
}

function collectTemplateColors(templateSet: TemplateSet): TemplateColorToken[] {
  const counts = new Map<string, number>();
  incrementColor(counts, templateSet.theme.primary);
  incrementColor(counts, templateSet.theme.graphite);
  incrementColor(counts, templateSet.theme.muted);
  templateSet.pages.forEach((page) => {
    incrementColor(counts, page.background.color);
    page.elements.forEach((element) => collectElementColors(element, counts));
  });

  return Array.from(counts.entries())
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}

type DragState =
  | {
      mode: "move";
      pageId: string;
      ids: string[];
      startX: number;
      startY: number;
      startElements: TemplateElement[];
    }
  | {
      mode: "resize";
      pageId: string;
      id: string;
      startX: number;
      startY: number;
      startElement: TemplateElement;
      direction: ResizeHandleDirection;
    }
  | {
      mode: "rotate";
      pageId: string;
      id: string;
      centerX: number;
      centerY: number;
    };

type MarqueeSelectionState = {
  pageId: string;
  startX: number;
  startY: number;
  pageLeft: number;
  pageTop: number;
  baseIds: string[];
};

function VisualTemplateStudioPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedId = searchParams.get("id");
  const forceNewTemplate = searchParams.get("new") === "1" || searchParams.has("type");
  const editorReturnTo = useMemo(() => safeTemplateEditorReturnTo(searchParams.get("returnTo")), [searchParams]);

  const [templateSet, setTemplateSet] = useState<TemplateSet>(() => createBlankTemplateSet());
  const [persistedTemplateId, setPersistedTemplateId] = useState<string | null>(requestedId);
  const [selectedPageId, setSelectedPageId] = useState<string>(() => templateSet.pages[0]?.id || "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextElementId, setEditingTextElementId] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [selectionBox, setSelectionBox] = useState<(TemplateSelectionBox & { pageId: string }) | null>(null);
  const [zoom, setZoom] = useState(0.84);
  const [leftPanel, setLeftPanel] = useState<StudioPanel>("elements");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [elementSearchQuery, setElementSearchQuery] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [pdfImportProgress, setPdfImportProgress] = useState<number | null>(null);
  const [pdfImportMessage, setPdfImportMessage] = useState("");
  const [pdfImportFileName, setPdfImportFileName] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<TemplateSet[]>([]);
  const [redoStack, setRedoStack] = useState<TemplateSet[]>([]);
  const clipboardRef = useRef<TemplateElement[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const templateSetRef = useRef(templateSet);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pptxInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const persistedTemplateIdRef = useRef<string | null>(requestedId);
  const lastServerSavedSnapshotRef = useRef(templateSnapshot(templateSet));
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<{ templateSet: TemplateSet; mode: SaveMode } | null>(null);
  const saveTemplateSetRef = useRef<((source: TemplateSet, mode: SaveMode) => Promise<void>) | null>(null);
  const editorHistoryUrlRef = useRef("");

  const selectedPage = useMemo(() => templateSet.pages.find((page) => page.id === selectedPageId) || templateSet.pages[0], [selectedPageId, templateSet.pages]);
  const selectedElements = useMemo(() => selectedPage?.elements.filter((element) => selectedIds.includes(element.id)) || [], [selectedIds, selectedPage]);
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  const selectedCornerRadiusMax = selectedElement ? maxVisualCornerRadius(selectedElement) : 0;
  const selectedCornerRadius = selectedElement ? visualCornerRadius(selectedElement) : 0;
  const dynamicPreviewPages = useMemo(() => createDynamicPreviewPages(templateSet), [templateSet]);
  const imageAssets = useMemo(() => templateSet.assets.filter((asset) => asset.type === "image" || asset.type === "logo"), [templateSet.assets]);
  const templateColors = useMemo(() => collectTemplateColors(templateSet), [templateSet]);
  const autoSaveLabel = useMemo(() => {
    if (saving || autoSaveStatus === "saving") return "저장 중";
    if (autoSaveStatus === "pending") return "자동 저장 대기";
    if (autoSaveStatus === "error") return "자동 저장 실패";
    if (autoSaveStatus === "saved") {
      if (!lastSavedAt) return "저장됨";
      return `저장됨 ${new Date(lastSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return "변경 시 자동 저장";
  }, [autoSaveStatus, lastSavedAt, saving]);

  useEffect(() => {
    templateSetRef.current = templateSet;
  }, [templateSet]);

  const filteredPalette = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) return elementPalette;
    return elementPalette.filter((item) => `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(query));
  }, [paletteQuery]);

  const pageElementsByLayer = useMemo(() => [...(selectedPage?.elements || [])].sort((a, b) => b.zIndex - a.zIndex), [selectedPage]);

  const filteredPageElements = useMemo(() => {
    const query = elementSearchQuery.trim().toLowerCase();
    if (!query) return pageElementsByLayer;
    return pageElementsByLayer.filter((element) => `${getElementLabel(element)} ${element.type}`.toLowerCase().includes(query));
  }, [elementSearchQuery, pageElementsByLayer]);

  const pushHistory = useCallback(() => {
    setUndoStack((current) => [...current.slice(-49), cloneTemplateSet(templateSet)]);
    setRedoStack([]);
  }, [templateSet]);

  const updateTemplateSet = useCallback(
    (updater: (draft: TemplateSet) => void, withHistory = true) => {
      if (withHistory) pushHistory();
      setTemplateSet((current) => {
        const next = cloneTemplateSet(current);
        updater(next);
        next.updatedAt = new Date().toISOString();
        return next;
      });
    },
    [pushHistory]
  );

  const updateSelectedElement = useCallback(
    (updater: (element: TemplateElement) => TemplateElement) => {
      if (!selectedElement || !selectedPage) return;
      updateTemplateSet((draft) => {
        const page = draft.pages.find((item) => item.id === selectedPage.id);
        if (!page) return;
        page.elements = page.elements.map((element) => (element.id === selectedElement.id ? updater(element) : element));
      });
    },
    [selectedElement, selectedPage, updateTemplateSet]
  );

  const updateTextElement = useCallback(
    (elementId: string, text: string) => {
      updateTemplateSet((draft) => {
        for (const page of draft.pages) {
          page.elements = page.elements.map((element) => (element.id === elementId && element.type === "text" ? { ...element, text } : element));
        }
      }, false);
    },
    [updateTemplateSet]
  );

  const updateSelectedCornerRadius = useCallback(
    (value: number) => {
      const radius = clampNumber(Math.round(value), 0, selectedCornerRadiusMax);
      updateSelectedElement((element) => ({ ...element, style: { ...element.style, radius } }));
    },
    [selectedCornerRadiusMax, updateSelectedElement]
  );

  function replaceTemplateColor(fromColor: string, toColor: string) {
    const from = normalizeHexColor(fromColor);
    const to = normalizeHexColor(toColor);
    if (!from || !to || from === to) return;

    updateTemplateSet((draft) => {
      draft.theme.primary = replaceColorValue(draft.theme.primary, from, to) || draft.theme.primary;
      draft.theme.graphite = replaceColorValue(draft.theme.graphite, from, to) || draft.theme.graphite;
      draft.theme.muted = replaceColorValue(draft.theme.muted, from, to) || draft.theme.muted;
      draft.pages.forEach((page) => {
        page.background.color = replaceColorValue(page.background.color, from, to) || page.background.color;
        page.elements = page.elements.map((element) => replaceElementColors(element, from, to));
      });
    });
    setNotice(`${from.toUpperCase()} 색상을 ${to.toUpperCase()}로 일괄 변경했습니다.`);
  }

  useEffect(() => {
    if (editingTextElementId && (!selectedIds.includes(editingTextElementId) || selectedIds.length !== 1)) {
      setEditingTextElementId(null);
    }
  }, [editingTextElementId, selectedIds]);

  const saveTemplateSet = useCallback(
    async (source: TemplateSet, mode: SaveMode = "manual") => {
      const safeSource = sanitizeTemplateSetForSave(source);
      const snapshot = templateSnapshot(safeSource);
      if (mode === "auto" && snapshot === lastServerSavedSnapshotRef.current) return;

      if (saveInFlightRef.current) {
        pendingSaveRef.current = { templateSet: cloneTemplateSet(safeSource), mode };
        setAutoSaveStatus("pending");
        return;
      }

      saveInFlightRef.current = true;
      setSaving(true);
      setAutoSaveStatus("saving");
      if (mode === "manual") setNotice(null);

      try {
        await ensureTemplateHubSession();
        const templateId = persistedTemplateIdRef.current;
        const payload = visualTemplatePayload(safeSource);
        const saved = templateId ? await updateHubTemplate(templateId, payload) : await createHubTemplate(payload);
        persistedTemplateIdRef.current = saved.id;
        setPersistedTemplateId(saved.id);
        lastServerSavedSnapshotRef.current = snapshot;
        setAutoSaveStatus("saved");
        setLastSavedAt(new Date().toISOString());
        if (mode === "manual") setNotice("템플릿 세트를 저장했습니다.");
        if (!templateId) router.replace(withReturnTo(`/templates/studio?id=${saved.id}`, editorReturnTo));
      } catch (error) {
        console.error("Visual template save failed", error);
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(source));
        setAutoSaveStatus("error");
        if (mode === "manual") setNotice("서버 저장에 실패해 로컬 임시 저장본으로 보관했습니다.");
      } finally {
        setSaving(false);
        saveInFlightRef.current = false;
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (pending && templateSnapshot(pending.templateSet) !== lastServerSavedSnapshotRef.current) {
          window.setTimeout(() => {
            void saveTemplateSetRef.current?.(pending.templateSet, pending.mode);
          }, 0);
        }
      }
    },
    [editorReturnTo, router]
  );

  useEffect(() => {
    saveTemplateSetRef.current = saveTemplateSet;
  }, [saveTemplateSet]);

  useEffect(() => {
    persistedTemplateIdRef.current = persistedTemplateId;
  }, [persistedTemplateId]);

  useEffect(() => {
    editorHistoryUrlRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, [searchParams]);

  useEffect(() => {
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    editorHistoryUrlRef.current = currentUrl;
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...currentState, __tenaTemplateEditorEntry: true }, "", currentUrl);
    window.history.pushState({ ...currentState, __tenaTemplateEditorGuard: true }, "", currentUrl);

    function keepEditorOpenOnBack() {
      if (!window.location.pathname.startsWith("/templates/studio")) return;
      window.history.pushState({ __tenaTemplateEditorGuard: true }, "", editorHistoryUrlRef.current || `${window.location.pathname}${window.location.search}${window.location.hash}`);
      setNotice("템플릿 편집 중에는 브라우저 뒤로가기로 허브로 나가지 않습니다.");
    }

    window.addEventListener("popstate", keepEditorOpenOnBack);
    return () => window.removeEventListener("popstate", keepEditorOpenOnBack);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(templateSet));
    }, 800);
    return () => window.clearTimeout(id);
  }, [templateSet]);

  useEffect(() => {
    const snapshot = templateSnapshot(templateSet);
    if (snapshot === lastServerSavedSnapshotRef.current) return;

    setAutoSaveStatus("pending");
    const id = window.setTimeout(() => {
      void saveTemplateSetRef.current?.(templateSet, "auto");
    }, 2500);
    return () => window.clearTimeout(id);
  }, [templateSet]);

  useEffect(() => {
    async function loadTemplate() {
      if (requestedId) {
        try {
          const template = await getHubTemplate(requestedId);
          const visual = template.schema_json?.visualTemplateSet;
          if (visual && typeof visual === "object") {
            const loaded = visual as TemplateSet;
            persistedTemplateIdRef.current = template.id;
            lastServerSavedSnapshotRef.current = templateSnapshot(loaded);
            setPersistedTemplateId(template.id);
            setAutoSaveStatus("saved");
            setLastSavedAt(template.updated_at || null);
            setTemplateSet(loaded);
            setSelectedPageId(loaded.pages[0]?.id || "");
            setNotice("저장된 Visual Template Set을 불러왔습니다.");
            return;
          }
          setNotice("이 템플릿은 레거시 코드 템플릿입니다. 새 Visual Template Set으로 변환해 편집하세요.");
        } catch {
          setNotice("서버 템플릿을 불러오지 못해 로컬 작업본으로 시작합니다.");
        }
      }

      if (forceNewTemplate && !requestedId) {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        return;
      }

      const local = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local && !requestedId) {
        try {
          const parsed = JSON.parse(local) as TemplateSet;
          if (parsed?.schemaVersion && Array.isArray(parsed.pages)) {
            lastServerSavedSnapshotRef.current = templateSnapshot(parsed);
            setAutoSaveStatus("idle");
            setTemplateSet(parsed);
            setSelectedPageId(parsed.pages[0]?.id || "");
            setNotice("최근 자동 저장본을 복원했습니다.");
          }
        } catch {
          window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
      }
    }
    void loadTemplate();
  }, [forceNewTemplate, requestedId]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const marquee = marqueeSelectionRef.current;
      if (marquee) {
        const currentTemplateSet = templateSetRef.current;
        const page = currentTemplateSet.pages.find((item) => item.id === marquee.pageId);
        if (!page) return;
        const size = page.pageSize || currentTemplateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
        const pointerX = clampNumber((event.clientX - marquee.pageLeft) / zoom, 0, size.width);
        const pointerY = clampNumber((event.clientY - marquee.pageTop) / zoom, 0, size.height);
        const box = {
          x: Math.min(marquee.startX, pointerX),
          y: Math.min(marquee.startY, pointerY),
          width: Math.abs(pointerX - marquee.startX),
          height: Math.abs(pointerY - marquee.startY),
        };
        setSelectionBox({ pageId: marquee.pageId, ...box });
        if (box.width >= 3 || box.height >= 3) {
          const hitIds = page.elements
            .filter((element) => !element.locked && boxesIntersect(getElementBox(element), box))
            .map((element) => element.id);
          setSelectedIds(Array.from(new Set([...marquee.baseIds, ...hitIds])));
        }
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (event.clientX - ("startX" in drag ? drag.startX : event.clientX)) / zoom;
      const dy = (event.clientY - ("startY" in drag ? drag.startY : event.clientY)) / zoom;
      let guidesForFrame: AlignmentGuide[] = [];

      setTemplateSet((current) => {
        const next = cloneTemplateSet(current);
        const page = next.pages.find((item) => item.id === drag.pageId);
        if (!page) return current;

        if (drag.mode === "move") {
          const snap = calculateMoveSnap(page, next, drag.startElements, drag.ids, dx, dy);
          guidesForFrame = snap.guides;
          page.elements = page.elements.map((element) => {
            const start = drag.startElements.find((item) => item.id === element.id);
            if (!start) return element;
            return { ...element, x: Math.round(start.x + snap.dx), y: Math.round(start.y + snap.dy) };
          });
        } else if (drag.mode === "resize") {
          page.elements = page.elements.map((element) =>
            element.id === drag.id ? resizeFromHandle(drag.startElement, dx, dy, drag.direction) : element
          );
        } else if (drag.mode === "rotate") {
          page.elements = page.elements.map((element) =>
            element.id === drag.id ? { ...element, rotation: Math.round((Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI + 90) } : element
          );
        }
        next.updatedAt = new Date().toISOString();
        return next;
      });
      setAlignmentGuides(guidesForFrame);
    }

    function onPointerUp() {
      marqueeSelectionRef.current = null;
      setSelectionBox(null);
      dragRef.current = null;
      setAlignmentGuides([]);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [zoom]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      const command = event.metaKey || event.ctrlKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        clipboardRef.current = selectedElements.map((element) => ({ ...element }));
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        nudge(dx, dy);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedElements, selectedIds, selectedPage?.id, undoStack, redoStack, templateSet]);

  function undo() {
    setUndoStack((current) => {
      const previous = current.at(-1);
      if (!previous) return current;
      setRedoStack((redoItems) => [...redoItems.slice(-49), cloneTemplateSet(templateSet)]);
      setTemplateSet(previous);
      setSelectedPageId(previous.pages[0]?.id || "");
      setSelectedIds([]);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((current) => {
      const next = current.at(-1);
      if (!next) return current;
      setUndoStack((undoItems) => [...undoItems.slice(-49), cloneTemplateSet(templateSet)]);
      setTemplateSet(next);
      setSelectedPageId(next.pages[0]?.id || "");
      setSelectedIds([]);
      return current.slice(0, -1);
    });
  }

  function startMarqueeSelection(event: ReactPointerEvent<HTMLDivElement>, page: TemplatePage) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    event.preventDefault();
    event.stopPropagation();
    const frame = event.currentTarget.getBoundingClientRect();
    const size = page.pageSize || templateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
    const startX = clampNumber((event.clientX - frame.left) / zoom, 0, size.width);
    const startY = clampNumber((event.clientY - frame.top) / zoom, 0, size.height);
    setSelectedPageId(page.id);
    setEditingTextElementId(null);
    setAlignmentGuides([]);
    marqueeSelectionRef.current = {
      pageId: page.id,
      startX,
      startY,
      pageLeft: frame.left,
      pageTop: frame.top,
      baseIds: event.shiftKey && page.id === selectedPageId ? selectedIds : [],
    };
    setSelectionBox({ pageId: page.id, x: startX, y: startY, width: 0, height: 0 });
    if (!event.shiftKey) setSelectedIds([]);
  }

  function selectElement(event: ReactPointerEvent<HTMLDivElement>, element: TemplateElement, page: TemplatePage) {
    event.stopPropagation();
    if (element.locked) return;
    if (event.shiftKey) {
      setSelectedIds((current) => (current.includes(element.id) ? current.filter((id) => id !== element.id) : [...current, element.id]));
    } else if (!selectedIds.includes(element.id)) {
      setSelectedIds([element.id]);
    }
    setEditingTextElementId(!event.shiftKey && event.detail > 1 && element.type === "text" ? element.id : null);
    setAlignmentGuides([]);

    const ids = event.shiftKey ? Array.from(new Set([...selectedIds, element.id])) : selectedIds.includes(element.id) ? selectedIds : [element.id];
    const selectedStarts = page.elements.filter((item) => ids.includes(item.id) && !item.locked) || [element];
    pushHistory();
    dragRef.current = {
      mode: "move",
      pageId: page.id,
      ids,
      startX: event.clientX,
      startY: event.clientY,
      startElements: selectedStarts,
    };
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>, element: TemplateElement, direction: ResizeHandleDirection) {
    event.stopPropagation();
    setAlignmentGuides([]);
    pushHistory();
    dragRef.current = { mode: "resize", pageId: selectedPage?.id || "", id: element.id, startX: event.clientX, startY: event.clientY, startElement: element, direction };
  }

  function startRotate(event: ReactPointerEvent<HTMLDivElement>, element: TemplateElement) {
    event.stopPropagation();
    const frame = (event.currentTarget.closest("[data-page-frame]") as HTMLElement | null)?.getBoundingClientRect();
    if (!frame) return;
    setAlignmentGuides([]);
    pushHistory();
    dragRef.current = {
      mode: "rotate",
      pageId: selectedPage?.id || "",
      id: element.id,
      centerX: frame.left + (element.x + element.width / 2) * zoom,
      centerY: frame.top + (element.y + element.height / 2) * zoom,
    };
  }

  function addElement(type: TemplateElementType, pageId = selectedPage?.id, x = 120, y = 140) {
    if (!pageId) return;
    const element = createElement(type, x, y);
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return;
      const maxZ = Math.max(0, ...page.elements.map((item) => item.zIndex || 0));
      page.elements.push({ ...element, zIndex: maxZ + 1 });
    });
    setSelectedPageId(pageId);
    setSelectedIds([element.id]);
    setEditingTextElementId(type === "text" ? element.id : null);
  }

  function readImageFile(file: File) {
    return readFileAsDataUrl(file);
  }

  async function addImageFiles(files: File[], pageId = selectedPage?.id, x = 120, y = 140) {
    if (!pageId || !files.length) return;
    const validFiles = files.filter((file) => file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024);
    if (!validFiles.length) {
      setNotice("PNG, JPG, JPEG, WebP, SVG 이미지만 10MB 이하로 업로드할 수 있습니다.");
      return;
    }

    const loaded = await Promise.all(validFiles.map(async (file) => ({ file, src: await readImageFile(file) })));
    const pageForSizing = templateSet.pages.find((item) => item.id === pageId);
    if (!pageForSizing) return;
    const maxZ = Math.max(0, ...pageForSizing.elements.map((item) => item.zIndex || 0));
    const sources: ClipboardDesignImage[] = loaded.map(({ file, src }, index) => ({ name: imageFileDisplayName(file, index), src }));
    const { elements, assets } = await createClipboardImageElements(sources, pageForSizing, x, y, maxZ);
    const insertedIds = elements.map((element) => element.id);

    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return;
      draft.assets.push(...assets);
      page.elements.push(...elements);
    });

    setSelectedPageId(pageId);
    setSelectedIds(insertedIds);
    setNotice(`${loaded.length}개 이미지를 추가했습니다.`);
  }

  async function addClipboardDesignImages(sources: ClipboardDesignImage[], pageId = selectedPage?.id, x = 120, y = 140) {
    if (!pageId || !sources.length) return;
    const pageForSizing = templateSet.pages.find((item) => item.id === pageId);
    if (!pageForSizing) return;
    const maxZ = Math.max(0, ...pageForSizing.elements.map((item) => item.zIndex || 0));
    const { elements, assets } = await createClipboardImageElements(sources, pageForSizing, x, y, maxZ);
    if (!elements.length) return;

    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return;
      draft.assets.push(...assets);
      page.elements.push(...elements);
    });
    setSelectedPageId(pageId);
    setSelectedIds(elements.map((element) => element.id));
    setNotice("PowerPoint 디자인을 원본에 가까운 이미지로 붙여넣었습니다.");
  }

  async function addClipboardEditableContent(data: DataTransfer | null, pageId = selectedPage?.id, x = 120, y = 140) {
    if (!pageId || !data) return false;
    const pageForSizing = templateSet.pages.find((item) => item.id === pageId);
    if (!pageForSizing) return false;
    const maxZ = Math.max(0, ...pageForSizing.elements.map((item) => item.zIndex || 0));
    const { elements, assets } = await createClipboardEditableElements(data, pageForSizing, x, y, maxZ);
    if (!elements.length) return false;

    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return;
      draft.assets.push(...assets);
      page.elements.push(...elements);
    });
    setSelectedPageId(pageId);
    setSelectedIds(elements.map((element) => element.id));
    setEditingTextElementId(elements.length === 1 && elements[0].type === "text" ? elements[0].id : null);
    setNotice(`PowerPoint 내용을 ${elements.length}개의 편집 가능한 요소로 붙여넣었습니다.`);
    return true;
  }

  function addClipboardElement(element: TemplateElement | null, pageId = selectedPage?.id, message = "클립보드 내용을 붙여넣었습니다.") {
    if (!pageId || !element) return false;
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return;
      page.elements.push(element);
    });
    setSelectedPageId(pageId);
    setSelectedIds([element.id]);
    setEditingTextElementId(element.type === "text" ? element.id : null);
    setNotice(message);
    return true;
  }

  function insertImageAsset(assetId: string, pageId = selectedPage?.id, x = 120, y = 140) {
    if (!pageId) return;
    const asset = templateSet.assets.find((item) => item.id === assetId);
    if (!asset?.url) return;
    const element = createElement("image", x, y);
    if (element.type !== "image") return;

    const insertedId = nanoid();
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return;
      const maxZ = Math.max(0, ...page.elements.map((item) => item.zIndex || 0));
      page.elements.push({
        ...element,
        id: insertedId,
        name: asset.name.replace(/\.[^.]+$/, "") || "이미지",
        src: asset.url,
        objectFit: "contain",
        zIndex: maxZ + 1,
      });
    });
    setSelectedPageId(pageId);
    setSelectedIds([insertedId]);
  }

  function handleImageInput(event: ReactChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    void addImageFiles(files);
    event.target.value = "";
  }

  async function importPptxFile(file: File, pageId = selectedPage?.id) {
    if (!pageId || !file) return;
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      setNotice("PPTX 파일만 가져올 수 있습니다.");
      return;
    }
    const pageForImport = templateSet.pages.find((item) => item.id === pageId);
    if (!pageForImport) return;

    try {
      const imported = await importPowerPointFile(file, pageForImport);
      if (!imported.elements.length) {
        setNotice("첫 번째 슬라이드에서 편집 가능한 요소를 찾지 못했습니다.");
        return;
      }
      updateTemplateSet((draft) => {
        const page = draft.pages.find((item) => item.id === pageId);
        if (!page) return;
        draft.assets.push(...imported.assets);
        page.elements.push(...imported.elements);
      });
      setSelectedPageId(pageId);
      setSelectedIds(imported.elements.map((element) => element.id));
      setEditingTextElementId(imported.elements.length === 1 && imported.elements[0].type === "text" ? imported.elements[0].id : null);
      setNotice(`${imported.slideName} 첫 슬라이드를 ${imported.elements.length}개의 편집 가능한 요소로 가져왔습니다.`);
    } catch (error: any) {
      setNotice(error?.message || "PPTX를 가져오지 못했습니다.");
    }
  }

  function handlePptxInput(event: ReactChangeEvent<HTMLInputElement>) {
    const file = Array.from(event.target.files || [])[0];
    if (file) void importPptxFile(file);
    event.target.value = "";
  }

  async function importPdfFile(file: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setNotice("PDF 파일만 가져올 수 있습니다.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setNotice("PDF 파일은 25MB 이하만 가져올 수 있습니다.");
      return;
    }
    const hasCurrentWork = templateSet.pages.some((page) => page.elements.length > 0);
    if (hasCurrentWork && !window.confirm("PDF 디자인을 새 템플릿 초안으로 가져오면 현재 스튜디오 문서가 교체됩니다. 계속할까요?")) {
      return;
    }

    setImportingPdf(true);
    setPdfImportProgress(0);
    setPdfImportFileName(file.name);
    setPdfImportMessage("PDF 파일을 업로드하는 중입니다.");
    setNotice("PDF 디자인을 분석하는 중입니다.");
    try {
      const imported = await importPdfTemplate(file, (progress) => {
        setPdfImportProgress(progress);
        setPdfImportMessage(progress >= 100 ? "업로드 완료. 대표 디자인 페이지를 분석하는 중입니다." : `PDF 파일을 업로드하는 중입니다. ${progress}%`);
      });
      setPdfImportProgress(100);
      setPdfImportMessage("분석 결과를 편집 가능한 템플릿으로 적용하는 중입니다.");
      const next = imported.templateSet;
      if (!next?.pages?.length) {
        setNotice("PDF에서 템플릿 페이지를 만들지 못했습니다.");
        return;
      }
      pushHistory();
      persistedTemplateIdRef.current = null;
      setPersistedTemplateId(null);
      lastServerSavedSnapshotRef.current = "";
      setTemplateSet(next);
      setSelectedPageId(next.pages[0]?.id || "");
      setSelectedIds([]);
      setEditingTextElementId(null);
      setAutoSaveStatus("pending");
      router.replace(withReturnTo("/templates/studio?new=1", editorReturnTo));
      const warningText = imported.warnings.length ? ` ${imported.warnings.length}개의 확인사항이 있습니다.` : "";
      setNotice(`${imported.source_file}에서 ${imported.imported_page_count}개 페이지를 템플릿 초안으로 만들었습니다.${warningText}`);
    } catch (error: any) {
      setNotice(error?.response?.data?.detail || error?.message || "PDF 디자인을 가져오지 못했습니다.");
    } finally {
      setImportingPdf(false);
      setPdfImportProgress(null);
      setPdfImportMessage("");
      setPdfImportFileName("");
    }
  }

  function handlePdfInput(event: ReactChangeEvent<HTMLInputElement>) {
    const file = Array.from(event.target.files || [])[0];
    if (file) void importPdfFile(file);
    event.target.value = "";
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (isEditableClipboardTarget(event.target)) return;

      const x = selectedElement ? selectedElement.x + 24 : 120;
      const y = selectedElement ? selectedElement.y + 24 : 140;
      const imageFiles = getClipboardImageFiles(event.clipboardData);
      const clipboardImages = getClipboardDesignImages(event.clipboardData);
      const plainText = getClipboardPlainText(event.clipboardData);
      const hasHtml = Boolean(event.clipboardData?.getData("text/html"));
      const hasRtf = Boolean(event.clipboardData?.getData("text/rtf"));
      const hasPlainTextTable = plainText.includes("\t") && plainText.includes("\n");

      if ((hasHtml || hasRtf || hasPlainTextTable) && selectedPage) {
        event.preventDefault();
        void addClipboardEditableContent(event.clipboardData, selectedPage.id, x, y).then((handled) => {
          if (handled) return;
          if (clipboardImages.length) {
            void addClipboardDesignImages(clipboardImages, selectedPage.id, x, y).then(() => {
              setNotice("클립보드 구조를 분해하지 못해 이미지로 붙여넣었습니다. PPTX 가져오기를 사용하면 더 안정적으로 요소화할 수 있습니다.");
            });
            return;
          }
          if (imageFiles.length) {
            void addImageFiles(imageFiles, selectedPage.id, x, y).then(() => {
              setNotice("클립보드 구조를 분해하지 못해 이미지로 붙여넣었습니다. PPTX 가져오기를 사용하면 더 안정적으로 요소화할 수 있습니다.");
            });
            return;
          }
          const maxZ = Math.max(0, ...selectedPage.elements.map((item) => item.zIndex || 0));
          const richTextHtml = getClipboardRichTextHtml(event.clipboardData);
          if (richTextHtml && addClipboardElement(createClipboardRichTextElement(richTextHtml, selectedPage, x, y, maxZ + 1), selectedPage.id, "PowerPoint 텍스트 스타일을 리치 텍스트로 붙여넣었습니다.")) return;
          if (plainText) addClipboardElement(createClipboardTextElement(plainText, selectedPage, x, y, maxZ + 1), selectedPage.id);
        });
        return;
      }

      if (imageFiles.length) {
        event.preventDefault();
        void addImageFiles(imageFiles, selectedPage?.id, x, y).then(() => {
          setNotice("PowerPoint가 클립보드에는 이미지만 제공했습니다. 요소 편집이 필요하면 PPTX 가져오기를 사용하세요.");
        });
        return;
      }

      if (clipboardImages.length) {
        event.preventDefault();
        void addClipboardDesignImages(clipboardImages, selectedPage?.id, x, y).then(() => {
          setNotice("PowerPoint가 클립보드에는 이미지만 제공했습니다. 요소 편집이 필요하면 PPTX 가져오기를 사용하세요.");
        });
        return;
      }

      if (selectedPage) {
        const maxZ = Math.max(0, ...selectedPage.elements.map((item) => item.zIndex || 0));
        const richTextHtml = getClipboardRichTextHtml(event.clipboardData);
        if (richTextHtml) {
          event.preventDefault();
          if (addClipboardElement(createClipboardRichTextElement(richTextHtml, selectedPage, x, y, maxZ + 1), selectedPage.id, "PowerPoint 텍스트 스타일을 리치 텍스트로 붙여넣었습니다.")) return;
        }
      }

      if (clipboardRef.current.length) {
        event.preventDefault();
        pasteElements();
        return;
      }

      if (selectedPage) {
        const maxZ = Math.max(0, ...selectedPage.elements.map((item) => item.zIndex || 0));
        if (plainText) {
          event.preventDefault();
          if (addClipboardElement(createClipboardTextElement(plainText, selectedPage, x, y, maxZ + 1), selectedPage.id)) return;
        }
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function handleDrop(event: ReactDragEvent<HTMLDivElement>, page: TemplatePage) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left) / zoom);
    const y = Math.round((event.clientY - rect.top) / zoom);

    const droppedFiles = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
    if (droppedFiles.length) {
      void addImageFiles(droppedFiles, page.id, x, y);
      return;
    }

    const assetId = event.dataTransfer.getData("application/x-template-asset");
    if (assetId) {
      insertImageAsset(assetId, page.id, x, y);
      return;
    }

    const type = event.dataTransfer.getData("application/x-template-element") as TemplateElementType;
    if (!type) return;
    addElement(type, page.id, x, y);
  }

  function deleteSelected() {
    if (!selectedPage || !selectedIds.length) return;
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements = page.elements.filter((element) => !selectedIds.includes(element.id));
    });
    setSelectedIds([]);
  }

  function duplicateSelected() {
    if (!selectedPage || !selectedElements.length) return;
    const copies = selectedElements.map((element) => ({ ...element, id: nanoid(), name: `${element.name} 복사본`, x: element.x + 18, y: element.y + 18, zIndex: element.zIndex + 1 }));
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements.push(...copies);
    });
    setSelectedIds(copies.map((item) => item.id));
  }

  function pasteElements() {
    if (!selectedPage || !clipboardRef.current.length) return;
    const copies = clipboardRef.current.map((element) => ({ ...element, id: nanoid(), name: `${element.name} 복사본`, x: element.x + 24, y: element.y + 24 }));
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements.push(...copies);
    });
    setSelectedIds(copies.map((item) => item.id));
  }

  function nudge(dx: number, dy: number) {
    if (!selectedPage || !selectedIds.length) return;
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements = page.elements.map((element) => (selectedIds.includes(element.id) && !element.locked ? { ...element, x: element.x + dx, y: element.y + dy } : element));
    });
  }

  function alignSelected(kind: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    if (!selectedPage || !selectedIds.length) return;
    const size = selectedPage.pageSize || templateSet.defaultPageSize;
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements = page.elements.map((element) => {
        if (!selectedIds.includes(element.id) || element.locked) return element;
        if (kind === "left") return { ...element, x: 48 };
        if (kind === "center") return { ...element, x: Math.round((size.width - element.width) / 2) };
        if (kind === "right") return { ...element, x: Math.round(size.width - element.width - 48) };
        if (kind === "top") return { ...element, y: 48 };
        if (kind === "middle") return { ...element, y: Math.round((size.height - element.height) / 2) };
        return { ...element, y: Math.round(size.height - element.height - 48) };
      });
    });
  }

  function updateLayer(action: "front" | "back") {
    if (!selectedPage || !selectedIds.length) return;
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      const maxZ = Math.max(0, ...page.elements.map((item) => item.zIndex || 0));
      const minZ = Math.min(0, ...page.elements.map((item) => item.zIndex || 0));
      page.elements = page.elements.map((element) => (selectedIds.includes(element.id) ? { ...element, zIndex: action === "front" ? maxZ + 1 : minZ - 1 } : element));
    });
  }

  function groupSelected() {
    if (selectedIds.length < 2 || !selectedPage) return;
    const groupId = nanoid();
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements = page.elements.map((element) => (selectedIds.includes(element.id) ? { ...element, groupId } : element));
    });
  }

  function ungroupSelected() {
    if (!selectedPage) return;
    updateTemplateSet((draft) => {
      const page = draft.pages.find((item) => item.id === selectedPage.id);
      if (!page) return;
      page.elements = page.elements.map((element) => (selectedIds.includes(element.id) ? { ...element, groupId: null } : element));
    });
  }

  function addPage(role: PageRole) {
    const page = createStudioPage(role, templateSet);
    updateTemplateSet((draft) => {
      draft.pages.push(page);
    });
    setSelectedPageId(page.id);
    setSelectedIds([]);
  }

  function removePage(pageId: string) {
    if (templateSet.pages.length <= 1) return;
    updateTemplateSet((draft) => {
      draft.pages = draft.pages.filter((page) => page.id !== pageId);
    });
    if (selectedPageId === pageId) {
      const next = templateSet.pages.find((page) => page.id !== pageId);
      setSelectedPageId(next?.id || "");
      setSelectedIds([]);
    }
  }

  async function saveTemplate() {
    await saveTemplateSet(templateSet, "manual");
    return;
    setSaving(true);
    setNotice(null);
    const payload = {
      title: templateSet.title,
      description: templateSet.description || null,
      category: mapToHubCategory(templateSet.category),
      visibility: templateSet.visibility === "academy" ? "unlisted" : templateSet.visibility === "marketplace" ? "marketplace" : templateSet.visibility,
      html: "<!-- Visual Template Studio: render from schema_json.visualTemplateSet -->",
      css: "",
      schema_json: { visualTemplateSet: templateSet, schemaVersion: templateSet.schemaVersion },
      thumbnail_url: null,
      source_type: "self_created",
      rights_confirmed: true,
    } as HubTemplatePayload;

    try {
      await ensureTemplateHubSession();
      const saved = persistedTemplateId ? await updateHubTemplate(String(persistedTemplateId), payload) : await createHubTemplate(payload);
      setPersistedTemplateId(saved.id);
      setNotice("템플릿 세트를 저장했습니다.");
      if (!persistedTemplateId) router.replace(withReturnTo(`/templates/studio?id=${saved.id}`, editorReturnTo));
    } catch (error) {
      console.error("Visual template save failed", error);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(templateSet));
      setNotice("서버 저장에 실패해 로컬 자동 저장본으로 보관했습니다.");
      setNotice("서버 저장에 실패해 로컬 임시 저장본으로 보관했습니다. 연결 상태를 확인한 뒤 다시 저장해주세요.");
    } finally {
      setSaving(false);
    }
  }

  function selectSingleElement(element: TemplateElement) {
    setSelectedIds([element.id]);
    setEditingTextElementId(element.type === "text" ? element.id : null);
  }

  function renderLeftPanel() {
    if (leftPanel === "elements") {
      const groups: PaletteGroup[] = ["기본 요소", "문서 블록", "동적 영역", "시스템"];
      return (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-950">요소</h2>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="요소 검색" className="h-9 bg-white/[0.035] pl-9 text-sm" />
          </label>

          <div className="rounded-[14px] border border-dashed border-zinc-300/35 bg-zinc-500/[0.08] p-3">
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" multiple className="hidden" onChange={handleImageInput} />
            <input ref={pptxInputRef} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" onChange={handlePptxInput} />
            <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handlePdfInput} />
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-[10px] bg-zinc-100 p-3 text-left transition hover:bg-zinc-200"
              onClick={() => imageInputRef.current?.click()}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-zinc-700 ring-1 ring-zinc-200">
                <ImageIcon className="h-5 w-5" />
              </span>
              <span className="block text-sm font-bold text-zinc-950">이미지 업로드</span>
            </button>
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-3 rounded-[10px] bg-zinc-100 p-3 text-left transition hover:bg-zinc-200"
              onClick={() => pptxInputRef.current?.click()}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-zinc-700 ring-1 ring-zinc-200">
                <FileStack className="h-5 w-5" />
              </span>
              <span className="block min-w-0">
                <span className="block text-sm font-bold text-zinc-950">PPTX 가져오기</span>
                <span className="mt-0.5 block text-xs text-zinc-500">첫 슬라이드를 편집 가능한 요소로 변환</span>
              </span>
            </button>
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-3 rounded-[10px] bg-zinc-100 p-3 text-left transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => pdfInputRef.current?.click()}
              disabled={importingPdf}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-zinc-700 ring-1 ring-zinc-200">
                <FileText className="h-5 w-5" />
              </span>
              <span className="block min-w-0">
                <span className="block text-sm font-bold text-zinc-950">{importingPdf ? "PDF 분석 중" : "PDF 디자인 추출"}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">PDF 레이아웃을 템플릿 초안으로 변환</span>
              </span>
            </button>
            {imageAssets.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {imageAssets.slice(-9).map((asset) => (
                  <button
                    key={asset.id}
                    draggable
                    className="group relative aspect-square overflow-hidden rounded-[9px] border border-white/10 bg-white/[0.04]"
                    onClick={() => insertImageAsset(asset.id)}
                    onDragStart={(event) => event.dataTransfer.setData("application/x-template-asset", asset.id)}
                    title={asset.name}
                  >
                    {asset.url ? <img src={asset.url} alt="" className="h-full w-full object-cover" /> : null}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">{asset.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {groups.map((group) => {
            const items = filteredPalette.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{group}</div>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.type}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData("application/x-template-element", item.type)}
                        onClick={() => addElement(item.type)}
                        className="group min-h-[74px] rounded-[11px] bg-zinc-100 p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-zinc-200"
                        title={item.description}
                      >
                        <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-zinc-700 ring-1 ring-zinc-200 transition">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="block text-sm font-bold text-zinc-950">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (leftPanel === "search") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-zinc-950">요소 검색</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[11px] font-bold text-slate-400">
              {filteredPageElements.length}/{pageElementsByLayer.length}
            </span>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input value={elementSearchQuery} onChange={(event) => setElementSearchQuery(event.target.value)} placeholder="이름, 타입 검색" className="h-9 bg-white/[0.035] pl-9 text-sm" />
          </label>
          <div className="space-y-2">
            {filteredPageElements.map((element) => (
              <button
                key={element.id}
                className={cls(
                  "flex w-full items-center gap-2 rounded-[11px] border px-3 py-2.5 text-left transition",
                  selectedIds.includes(element.id) ? "border-zinc-300/55 bg-zinc-500/14" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                )}
                onClick={() => selectSingleElement(element)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-black/25 text-zinc-200">
                  <Layers className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-zinc-950">{getElementLabel(element)}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {element.type} · {Math.round(element.x)}, {Math.round(element.y)} · {Math.round(element.width)}×{Math.round(element.height)}
                  </span>
                </span>
                {element.hidden ? <EyeOff className="h-4 w-4 shrink-0 text-slate-500" /> : null}
                {element.locked ? <Lock className="h-4 w-4 shrink-0 text-zinc-200" /> : null}
              </button>
            ))}
            {!filteredPageElements.length ? (
              <div className="rounded-[12px] border border-dashed border-white/10 bg-white/[0.03] px-3 py-6 text-center text-sm font-semibold text-slate-500">검색 결과 없음</div>
            ) : null}
          </div>
        </div>
      );
    }

    if (leftPanel === "pages") {
      return (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-950">페이지</h2>
          <div className="space-y-2">
            {templateSet.pages.map((page, index) => (
              <button
                key={page.id}
                className={cls(
                  "flex w-full items-center gap-3 rounded-[12px] border p-2 text-left transition",
                  page.id === selectedPageId ? "border-zinc-300/55 bg-zinc-500/14 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                )}
                onClick={() => {
                  setSelectedPageId(page.id);
                  setSelectedIds([]);
                }}
              >
                <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-[6px] bg-white text-xs font-black text-slate-900 shadow">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-zinc-950">{page.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{pageRoleLabels[page.role]}</div>
                </div>
                <span
                  role="button"
                  className="rounded-[7px] p-1.5 text-slate-500 hover:bg-zinc-500/15 hover:text-zinc-200"
                  onClick={(event) => {
                    event.stopPropagation();
                    removePage(page.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(pageRoleLabels) as PageRole[]).map((role) => (
              <Button key={role} variant="outline" size="sm" onClick={() => addPage(role)} className="justify-start">
                <Plus className="h-3.5 w-3.5" /> {pageRoleLabels[role]}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    if (leftPanel === "variables") {
      const groups = Array.from(new Set(visualTemplateVariableTokens.map((token) => token.group)));
      return (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-950">변수</h2>
          {groups.map((group) => (
            <div key={group} className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{group}</div>
              <div className="grid grid-cols-2 gap-2">
                {visualTemplateVariableTokens
                  .filter((token) => token.group === group)
                  .map((token) => (
                    <div
                      key={token.token}
                      className="min-h-[54px] rounded-[10px] border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left"
                      title={token.label}
                    >
                      <span className="block font-mono text-sm font-bold text-zinc-950">{token.token}</span>
                      <span className="mt-1 block text-[11px] text-slate-500">{token.label}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-950">레이어</h2>
        <div className="space-y-2">
          {pageElementsByLayer.map((element) => (
              <button
                key={element.id}
                className={cls(
                  "flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-sm transition",
                  selectedIds.includes(element.id) ? "border-zinc-300/55 bg-zinc-500/14" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                )}
                onClick={() => selectSingleElement(element)}
              >
                <Layers className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">{getElementLabel(element)}</span>
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-0px)] min-h-[840px] flex-col overflow-hidden bg-[#f7f7f5] text-zinc-950">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 bg-white/95 px-3 shadow-[0_16px_40px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={editorReturnTo} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 hover:text-black">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 flex-col">
            <Input
              className="h-8 w-[280px] border-transparent bg-transparent px-1 text-sm font-bold text-zinc-950 hover:bg-zinc-100 focus-visible:border-zinc-300"
              value={templateSet.title}
              onChange={(event) =>
                updateTemplateSet((draft) => {
                  draft.title = event.target.value;
                }, false)
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-zinc-500 transition hover:bg-zinc-100 hover:text-black disabled:opacity-35" onClick={undo} disabled={!undoStack.length} title="실행 취소">
            <Undo2 className="h-4 w-4" />
          </button>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-zinc-500 transition hover:bg-zinc-100 hover:text-black disabled:opacity-35" onClick={redo} disabled={!redoStack.length} title="다시 실행">
            <Redo2 className="h-4 w-4" />
          </button>
          <select className="h-9 rounded-[8px] border-0 bg-zinc-100 px-2 text-sm font-semibold text-zinc-950 outline-none transition focus:ring-2 focus:ring-black/10" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            <option value={0.5}>50%</option>
            <option value={0.72}>72%</option>
            <option value={0.84}>84%</option>
            <option value={0.9}>90%</option>
            <option value={1}>100%</option>
          </select>
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye className="h-4 w-4" /> 미리보기
          </Button>
          <span className={cls("min-w-[108px] text-right text-[11px] font-semibold", autoSaveStatus === "error" ? "text-zinc-950" : autoSaveStatus === "pending" ? "text-zinc-700" : "text-zinc-500")}>{autoSaveLabel}</span>
          <Button onClick={saveTemplate} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "저장 중" : "저장"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)_300px]">
        <div className="group/sidebar relative z-40 h-full min-h-0">
          <nav className="relative z-40 flex h-full min-h-0 flex-col items-center gap-1 bg-white/80 px-1.5 py-2">
            {panelTabs.map((tab) => {
              const Icon = tab.icon;
              const active = leftPanel === tab.key;
              return (
                <button
                  key={tab.key}
                  className={cls(
                    "group relative flex h-11 w-11 items-center justify-center rounded-[11px] transition",
                    active ? "bg-black text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-100 hover:text-black"
                  )}
                  onClick={() => setLeftPanel(tab.key)}
                  title={tab.label}
                >
                  {active ? <span className="absolute -left-2 h-6 w-0.5 rounded-full bg-black" /> : null}
                  <Icon className="h-5 w-5" />
                  <span className="sr-only">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <aside className="pointer-events-none absolute left-14 top-0 z-30 h-full w-[300px] -translate-x-2 bg-white/98 opacity-0 shadow-[18px_0_54px_rgba(0,0,0,0.10)] backdrop-blur transition duration-150 ease-out group-hover/sidebar:pointer-events-auto group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100">
            <div className="h-full overflow-y-auto p-3 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]">{renderLeftPanel()}</div>
          </aside>
        </div>

        <main className="min-h-0 overflow-auto bg-zinc-100 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]">
          <div className="mx-auto flex w-fit flex-col gap-7 p-5 pb-20">
            {templateSet.pages.map((page, index) => {
              const size = page.pageSize || templateSet.defaultPageSize;
              const renderedPage = dynamicPreviewPages.find((item) => item.id === page.id) || page;
              return (
                <section key={page.id} className="space-y-3">
                  <div className="flex items-center justify-between rounded-[9px] bg-white px-2.5 py-1.5 text-[11px] text-zinc-500 shadow-sm">
                    <button
                      className={cls("rounded px-2 py-1 font-bold transition", page.id === selectedPageId ? "bg-zinc-100 text-zinc-950" : "hover:bg-zinc-100")}
                      onClick={() => {
                        setSelectedPageId(page.id);
                        setSelectedIds([]);
                      }}
                    >
                      {index + 1}. {page.name}
                    </button>
                    <span>{size.preset.replaceAll("_", " ")} · {size.width}×{size.height}px</span>
                  </div>
                  <div
                    data-page-frame
                    className="relative"
                    style={{ width: size.width * zoom, height: size.height * zoom }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, page)}
                  >
                    <TemplatePageView
                      templateSet={templateSet}
                      page={renderedPage}
                      scale={zoom}
                      selectedIds={page.id === selectedPageId ? selectedIds : []}
                      selectionBox={selectionBox?.pageId === page.id ? selectionBox : null}
                      interactive={page.id === selectedPageId}
                      alignmentGuides={page.id === selectedPageId ? alignmentGuides : []}
                      renderElementContent={(element, defaultContent: ReactNode) =>
                        page.id === selectedPageId && element.type === "text" && editingTextElementId === element.id && selectedIds.length === 1 ? (
                          <InlineTextEditor
                            element={element}
                            onChange={(text) => updateTextElement(element.id, text)}
                            onExit={() => setEditingTextElementId((current) => (current === element.id ? null : current))}
                          />
                        ) : (
                          defaultContent
                        )
                      }
                      onSelectPage={() => {
                        setSelectedPageId(page.id);
                        setSelectedIds([]);
                        setEditingTextElementId(null);
                        setAlignmentGuides([]);
                      }}
                      onPagePointerDown={(event) => startMarqueeSelection(event, page)}
                      onElementPointerDown={(event, element) => {
                        setSelectedPageId(page.id);
                        selectElement(event, element, page);
                      }}
                      onResizePointerDown={startResize}
                      onRotatePointerDown={startRotate}
                    />
                  </div>
                </section>
              );
            })}
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto bg-white p-3 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]">
          <div className="space-y-3">
            <InspectorSection title="문서 색상" compact>
              <div className="grid grid-cols-2 gap-2">
                {templateColors.slice(0, 10).map((token) => (
                  <label
                    key={token.color}
                    className="relative flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-[9px] border border-white/10 bg-white/[0.035] px-2 transition hover:border-zinc-300/45 hover:bg-zinc-500/10"
                    title={`${token.color.toUpperCase()} · ${token.count}곳`}
                  >
                    <span className="h-5 w-5 shrink-0 rounded-[5px] border border-white/20 shadow-inner" style={{ backgroundColor: token.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-300">{token.color.toUpperCase()}</span>
                    <span className="text-[10px] text-slate-500">{token.count}</span>
                    <input
                      type="color"
                      value={token.color}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={(event) => replaceTemplateColor(token.color, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </InspectorSection>

            <InspectorSection title="빠른 작업" compact>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => alignSelected("left")} title="왼쪽 정렬" aria-label="왼쪽 정렬"><AlignStartHorizontal className="h-4 w-4" />좌</Button>
                <Button variant="outline" size="sm" onClick={() => alignSelected("center")} title="가로 가운데 정렬" aria-label="가로 가운데 정렬"><AlignHorizontalJustifyCenter className="h-4 w-4" />중</Button>
                <Button variant="outline" size="sm" onClick={() => alignSelected("right")} title="오른쪽 정렬" aria-label="오른쪽 정렬"><AlignEndHorizontal className="h-4 w-4" />우</Button>
                <Button variant="outline" size="sm" onClick={() => alignSelected("top")} title="위쪽 정렬">상</Button>
                <Button variant="outline" size="sm" onClick={() => alignSelected("middle")} title="세로 가운데 정렬" aria-label="세로 가운데 정렬"><AlignCenter className="h-4 w-4" />중</Button>
                <Button variant="outline" size="sm" onClick={() => alignSelected("bottom")} title="아래쪽 정렬">하</Button>
                <Button variant="outline" size="sm" onClick={() => updateLayer("front")} title="앞으로 가져오기" aria-label="앞으로 가져오기"><BringToFront className="h-4 w-4" />앞</Button>
                <Button variant="outline" size="sm" onClick={() => updateLayer("back")} title="뒤로 보내기" aria-label="뒤로 보내기"><SendToBack className="h-4 w-4" />뒤</Button>
                <Button variant="outline" size="sm" onClick={duplicateSelected} title="복제" aria-label="복제"><Copy className="h-4 w-4" />복제</Button>
                <Button variant="outline" size="sm" onClick={groupSelected}>그룹</Button>
                <Button variant="outline" size="sm" onClick={ungroupSelected}>해제</Button>
                <Button variant="destructive" size="sm" onClick={deleteSelected} title="삭제" aria-label="삭제"><Trash2 className="h-4 w-4" />삭제</Button>
              </div>
            </InspectorSection>

            {selectedElement ? (
              <>
                <InspectorSection title="위치와 크기">
                  <div className="grid grid-cols-2 gap-2">
                    <FieldLabel label="이름"><Input className="h-8" value={selectedElement.name} onChange={(event) => updateSelectedElement((element) => ({ ...element, name: event.target.value }))} /></FieldLabel>
                    <FieldLabel label="타입"><Input className="h-8" value={selectedElement.type} readOnly /></FieldLabel>
                    <FieldLabel label="X"><Input className="h-8" type="number" value={selectedElement.x} onChange={(event) => updateSelectedElement((element) => ({ ...element, x: Number(event.target.value) }))} /></FieldLabel>
                    <FieldLabel label="Y"><Input className="h-8" type="number" value={selectedElement.y} onChange={(event) => updateSelectedElement((element) => ({ ...element, y: Number(event.target.value) }))} /></FieldLabel>
                    <FieldLabel label="W"><Input className="h-8" type="number" value={selectedElement.width} onChange={(event) => updateSelectedElement((element) => ({ ...element, width: Number(event.target.value) }))} /></FieldLabel>
                    <FieldLabel label="H"><Input className="h-8" type="number" value={selectedElement.height} onChange={(event) => updateSelectedElement((element) => ({ ...element, height: Number(event.target.value) }))} /></FieldLabel>
                    <FieldLabel label="회전"><Input className="h-8" type="number" value={selectedElement.rotation} onChange={(event) => updateSelectedElement((element) => ({ ...element, rotation: Number(event.target.value) }))} /></FieldLabel>
                    <FieldLabel label="불투명도"><Input className="h-8" type="number" min={0} max={1} step={0.05} value={selectedElement.opacity} onChange={(event) => updateSelectedElement((element) => ({ ...element, opacity: Number(event.target.value) }))} /></FieldLabel>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => updateSelectedElement((element) => ({ ...element, locked: !element.locked }))}>
                      {selectedElement.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />} {selectedElement.locked ? "잠금 해제" : "잠금"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateSelectedElement((element) => ({ ...element, hidden: !element.hidden }))}>
                      {selectedElement.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {selectedElement.hidden ? "보이기" : "숨기기"}
                    </Button>
                  </div>
                </InspectorSection>

                {(selectedElement.type === "text" || selectedElement.type === "richText") ? (
                  <InspectorSection title="콘텐츠">
                    {selectedElement.type === "text" ? (
                      <VariableTextArea value={selectedElement.text} onChange={(text) => updateSelectedElement((element) => (element.type === "text" ? { ...element, text } : element))} />
                    ) : null}
                    {selectedElement.type === "richText" ? (
                      <VariableTextArea value={selectedElement.html} minHeight="min-h-[120px]" mono onChange={(html) => updateSelectedElement((element) => (element.type === "richText" ? { ...element, html } : element))} />
                    ) : null}
                  </InspectorSection>
                ) : null}

                {isRegionElement(selectedElement) ? (
                  <InspectorSection title="동적 영역">
                    {selectedElement.binding === "problems" ? (
                      <FieldLabel label="배치 방식">
                        <select
                          className="h-9 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white outline-none"
                          value={selectedElement.layoutMode || "grid"}
                          onChange={(event) => {
                            const layoutMode = event.target.value as "grid" | "korean-passage-flow";
                            updateSelectedElement((element) => {
                              if (!isRegionElement(element)) return element;
                              if (layoutMode === "korean-passage-flow") {
                                return { ...element, layoutMode, columns: Math.max(2, element.columns || 2), rows: undefined, fillDirection: "column-first" };
                              }
                              return { ...element, layoutMode, rows: element.rows || 2 };
                            });
                          }}
                        >
                          <option value="grid">일반 문항 배치</option>
                          <option value="korean-passage-flow">국어 지문형</option>
                        </select>
                      </FieldLabel>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <FieldLabel label="열 수"><Input className="h-8" type="number" min={1} max={8} value={selectedElement.columns} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, columns: clampNumber(Math.round(Number(event.target.value)), 1, 8) } : element))} /></FieldLabel>
                      {selectedElement.binding === "problems" && selectedElement.layoutMode === "korean-passage-flow" ? null : (
                        <FieldLabel label="행 수"><Input className="h-8" type="number" min={1} max={20} value={selectedElement.rows || 2} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, rows: clampNumber(Math.round(Number(event.target.value)), 1, 20) } : element))} /></FieldLabel>
                      )}
                      <FieldLabel label="열 간격"><Input className="h-8" type="number" value={selectedElement.columnGap} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, columnGap: Number(event.target.value) } : element))} /></FieldLabel>
                      <FieldLabel label="행 간격"><Input className="h-8" type="number" value={selectedElement.rowGap} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, rowGap: Number(event.target.value) } : element))} /></FieldLabel>
                      <FieldLabel label="패딩"><Input className="h-8" type="number" value={selectedElement.padding} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, padding: Number(event.target.value) } : element))} /></FieldLabel>
                    </div>
                    <p className="mt-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-slate-400">
                      {selectedElement.binding === "problems" && selectedElement.layoutMode === "korean-passage-flow"
                        ? "국어 지문형은 행 없이 1열 위에서 아래로 채운 뒤 다음 열로 이어집니다."
                        : `이 영역에는 최대 ${(selectedElement.columns || 1) * (selectedElement.rows || 2)}개 항목이 배치됩니다.`}
                    </p>
                    <FieldLabel label="오버플로">
                      <select className="h-9 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white outline-none" value={selectedElement.overflowStrategy} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, overflowStrategy: event.target.value as typeof element.overflowStrategy } : element))}>
                        <option value="create-next-page">다음 페이지 자동 생성</option>
                        <option value="warn">경고만 표시</option>
                        <option value="clip">넘친 내용 자르기</option>
                      </select>
                    </FieldLabel>
                    <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <input type="checkbox" checked={selectedElement.allowSplit} onChange={(event) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, allowSplit: event.target.checked } : element))} />
                      큰 문항 분할 허용
                    </label>
                    <div className="mt-3 space-y-3">
                      <RegionNumberControls
                        region={selectedElement}
                        onChange={(patch) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, ...patch } : element))}
                      />
                      <BorderStyleControls
                        title="문항 영역 배경 / 테두리"
                        style={selectedElement.style}
                        fillLabel="영역 배경"
                        onChange={(patch) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, style: { ...element.style, ...patch } } : element))}
                      />
                      <RegionDividerControls
                        style={selectedElement.columnDividerStyle}
                        onChange={(patch) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, columnDividerStyle: { stroke: "#d8dee9", strokeWidth: 0, borderStyle: "none", ...element.columnDividerStyle, ...patch } } : element))}
                      />
                      <BorderStyleControls
                        title="문항 카드 배경 / 테두리"
                        style={selectedElement.cardStyle}
                        fillLabel="카드 배경"
                        onChange={(patch) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, cardStyle: { ...element.cardStyle, ...patch } } : element))}
                      />
                      {selectedElement.type === "problemRegion" ? (
                        <BorderStyleControls
                          title="답안 칸 배경 / 테두리"
                          style={selectedElement.answerSpaceStyle}
                          fillLabel="답안 칸 배경"
                          onChange={(patch) => updateSelectedElement((element) => (isRegionElement(element) ? { ...element, answerSpaceStyle: { ...element.answerSpaceStyle, ...patch } } : element))}
                        />
                      ) : null}
                    </div>
                  </InspectorSection>
                ) : null}

                {selectedElement.type === "examStatsChart" ? (
                  <InspectorSection title="시험 통계 차트">
                    <div className="space-y-3">
                      <FieldLabel label="차트 제목">
                        <Input className="h-8" value={selectedElement.title} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, title: event.target.value } : element))} />
                      </FieldLabel>
                      <div>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">그래프 형태</div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: "line", label: "선 그래프", icon: LineChart },
                            { value: "bar", label: "막대 그래프", icon: BarChart3 },
                          ].map((option) => {
                            const Icon = option.icon;
                            const active = selectedElement.chartMode === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, chartMode: option.value as typeof element.chartMode } : element))}
                                className={cls(
                                  "flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-bold transition",
                                  active ? "border-zinc-300/50 bg-zinc-500/20 text-white" : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
                                )}
                              >
                                <Icon className="h-4 w-4" />
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldLabel label="데이터 변수">
                          <Input className="h-8" value={selectedElement.dataVariableKey || ""} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, dataVariableKey: event.target.value || "exam_stats_series_json" } : element))} />
                        </FieldLabel>
                        <FieldLabel label="데이터 소스">
                          <select
                            className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none"
                            value={selectedElement.dataSource || "templateVariable"}
                            onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, dataSource: event.target.value as ExamStatsDataSource } : element))}
                          >
                            <option value="templateVariable">템플릿 변수</option>
                            <option value="studentExamHistory">학생 시험 이력</option>
                          </select>
                        </FieldLabel>
                        <FieldLabel label="Y 최소">
                          <Input className="h-8" type="number" value={selectedElement.yAxisMin} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, yAxisMin: Number(event.target.value) } : element))} />
                        </FieldLabel>
                        <FieldLabel label="Y 최대">
                          <Input className="h-8" type="number" value={selectedElement.yAxisMax} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, yAxisMax: Number(event.target.value) } : element))} />
                        </FieldLabel>
                      </div>
                      <div>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">X축 날짜 범위</div>
                        <div className="grid grid-cols-2 gap-2">
                          <FieldLabel label="시작일">
                            <Input className="h-8" type="date" value={selectedElement.xAxisDateStart || ""} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, xAxisDateStart: event.target.value } : element))} />
                          </FieldLabel>
                          <FieldLabel label="종료일">
                            <Input className="h-8" type="date" value={selectedElement.xAxisDateEnd || ""} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, xAxisDateEnd: event.target.value } : element))} />
                          </FieldLabel>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">학생 시험 이력을 쓰면 이 기간 안의 시험 일자만 차트에 연결됩니다.</p>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">표시 지표</div>
                          <div className="flex flex-wrap gap-1">
                            {examStatsMetricPresets.map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, metrics: preset.metrics } : element))}
                                className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-slate-400 transition hover:border-zinc-300/35 hover:text-white"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {examStatsMetricOptions.map((metric) => {
                            const checked = (selectedElement.metrics || []).includes(metric.key);
                            return (
                              <label key={metric.key} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => updateSelectedElement((element) => {
                                    if (element.type !== "examStatsChart") return element;
                                    const currentMetrics = element.metrics || ["average"];
                                    if (event.target.checked) return { ...element, metrics: Array.from(new Set([...currentMetrics, metric.key])) };
                                    const next = currentMetrics.filter((item) => item !== metric.key);
                                    return { ...element, metrics: next.length ? next : currentMetrics };
                                  })}
                                />
                                {metric.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-300">
                          <input type="checkbox" checked={selectedElement.showLegend} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, showLegend: event.target.checked } : element))} />
                          범례 표시
                        </label>
                        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-300">
                          <input type="checkbox" checked={selectedElement.showGrid} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, showGrid: event.target.checked } : element))} />
                          격자 표시
                        </label>
                        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-300">
                          <input type="checkbox" checked={selectedElement.showPointLabels === true} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, showPointLabels: event.target.checked } : element))} />
                          시험명 표시
                        </label>
                        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-300">
                          <input type="checkbox" checked={selectedElement.showRespondents === true} onChange={(event) => updateSelectedElement((element) => (element.type === "examStatsChart" ? { ...element, showRespondents: event.target.checked, showPointLabels: event.target.checked ? true : element.showPointLabels } : element))} />
                          응시자 수
                        </label>
                      </div>
                    </div>
                  </InspectorSection>
                ) : null}

                <InspectorSection title="스타일">
                  <div className="grid grid-cols-2 gap-2">
                    <FieldLabel label="글자 크기"><Input className="h-8" type="number" value={selectedElement.style.fontSize || 14} onChange={(event) => updateSelectedElement((element) => ({ ...element, style: { ...element.style, fontSize: Number(event.target.value) } }))} /></FieldLabel>
                    <FieldLabel label="글자색"><Input className="h-8" type="color" value={colorInputValue(selectedElement.style.color, "#111827")} onChange={(event) => updateSelectedElement((element) => ({ ...element, style: { ...element.style, color: event.target.value } }))} /></FieldLabel>
                    <FieldLabel label="채우기"><Input className="h-8" type="color" value={colorInputValue(selectedElement.style.fill, "#ffffff")} onChange={(event) => updateSelectedElement((element) => ({ ...element, style: { ...element.style, fill: event.target.value } }))} /></FieldLabel>
                    <FieldLabel label="테두리"><Input className="h-8" type="color" value={colorInputValue(selectedElement.style.stroke, "#d8dee9")} onChange={(event) => updateSelectedElement((element) => ({ ...element, style: { ...element.style, stroke: event.target.value } }))} /></FieldLabel>
                    <FieldLabel label="테두리 방식">
                      <select className="h-8 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white outline-none" value={selectedElement.style.borderStyle || ((selectedElement.style.strokeWidth || 0) > 0 ? "solid" : "none")} onChange={(event) => updateSelectedElement((element) => ({ ...element, style: { ...element.style, borderStyle: event.target.value as ElementStyle["borderStyle"], strokeWidth: event.target.value === "none" ? 0 : Math.max(1, element.style.strokeWidth || 1) } }))}>
                        {borderStyleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </FieldLabel>
                    <FieldLabel label="테두리 두께"><Input className="h-8" type="number" min={0} max={40} value={selectedElement.style.strokeWidth || 0} onChange={(event) => updateSelectedElement((element) => ({ ...element, style: { ...element.style, strokeWidth: Number(event.target.value) } }))} /></FieldLabel>
                  </div>
                  {canRoundVisualElement(selectedElement) ? (
                    <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] p-2.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        <span>모서리 둥글기</span>
                        <span>{selectedCornerRadius}px</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={Math.max(1, selectedCornerRadiusMax)}
                          step={1}
                          value={selectedCornerRadius}
                          onChange={(event) => updateSelectedCornerRadius(Number(event.target.value))}
                          className="h-2 flex-1 accent-zinc-400"
                          aria-label="모서리 둥글기"
                        />
                        <Input
                          className="h-8 w-20"
                          type="number"
                          min={0}
                          max={selectedCornerRadiusMax}
                          value={selectedCornerRadius}
                          onChange={(event) => updateSelectedCornerRadius(Number(event.target.value))}
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {([
                          ["0", 0],
                          ["8", Math.min(8, selectedCornerRadiusMax)],
                          ["16", Math.min(16, selectedCornerRadiusMax)],
                          ["최대", selectedCornerRadiusMax],
                        ] as Array<[string, number]>).map(([label, radius]) => (
                          <Button
                            key={`${label}-${radius}`}
                            type="button"
                            variant={selectedCornerRadius === radius ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => updateSelectedCornerRadius(Number(radius))}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </InspectorSection>
              </>
            ) : (
              <InspectorSection title="페이지 설정">
                <div className="space-y-3">
                  <FieldLabel label="이름"><Input className="h-8" value={selectedPage?.name || ""} onChange={(event) => updateTemplateSet((draft) => { const page = draft.pages.find((item) => item.id === selectedPage?.id); if (page) page.name = event.target.value; })} /></FieldLabel>
                  <FieldLabel label="역할">
                    <select className="h-9 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white outline-none" value={selectedPage?.role || "custom"} onChange={(event) => updateTemplateSet((draft) => { const page = draft.pages.find((item) => item.id === selectedPage?.id); if (page) page.role = event.target.value as PageRole; })}>
                      {(Object.keys(pageRoleLabels) as PageRole[]).map((role) => <option key={role} value={role}>{pageRoleLabels[role]}</option>)}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="페이지 크기">
                    <select className="h-9 w-full rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm text-white outline-none" value={(selectedPage?.pageSize || templateSet.defaultPageSize).preset} onChange={(event) => updateTemplateSet((draft) => { const page = draft.pages.find((item) => item.id === selectedPage?.id); if (page) page.pageSize = PAGE_SIZES[event.target.value as PageSizePreset]; })}>
                      {(Object.keys(PAGE_SIZES) as PageSizePreset[]).map((preset) => <option key={preset} value={preset}>{preset.replaceAll("_", " ")}</option>)}
                    </select>
                  </FieldLabel>
                </div>
              </InspectorSection>
            )}

          </div>
        </aside>
      </div>

      {notice ? (
        <div className="fixed bottom-6 right-6 z-[60] max-w-[420px] rounded-[10px] bg-white px-4 py-3 text-sm font-semibold text-zinc-950 shadow-[0_18px_50px_rgba(0,0,0,0.14)] ring-1 ring-black/10 backdrop-blur">
          {notice}
        </div>
      ) : null}

      {importingPdf ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/82 px-5 backdrop-blur-sm">
          <div className="w-full max-w-[460px] rounded-[14px] bg-white p-5 shadow-[0_28px_80px_rgba(0,0,0,0.18)] ring-1 ring-black/10">
            <div className="flex items-start gap-4">
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 ring-1 ring-zinc-200">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-black" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-zinc-950">PDF 디자인 추출 중</div>
                <div className="mt-1 truncate text-xs font-semibold text-zinc-500">{pdfImportFileName}</div>
                <div className="mt-3 text-sm leading-6 text-zinc-700">{pdfImportMessage || "PDF 레이아웃을 분석하는 중입니다."}</div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-black transition-all duration-300"
                    style={{ width: `${pdfImportProgress == null ? 24 : Math.max(8, pdfImportProgress)}%` }}
                  />
                </div>
                <div className="mt-3 text-xs leading-5 text-zinc-500">
                  여러 페이지 PDF는 전체 구조를 훑어 표지, 내지, 단원 구분 같은 대표 디자인을 고르는 중입니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white/82 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-950">동적 콘텐츠 미리보기</h2>
            </div>
            <Button variant="outline" onClick={() => setPreview(false)}>닫기</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto flex w-fit flex-col gap-10 pb-16">
              {dynamicPreviewPages.map((page) => (
                <TemplatePageView key={page.id} templateSet={templateSet} page={page} scale={0.72} selectedIds={[]} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function VisualTemplateStudioPage() {
  return (
    <Suspense fallback={null}>
      <VisualTemplateStudioPageContent />
    </Suspense>
  );
}
