"use client";

import { CSSProperties, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  BringToFront,
  ChevronDown,
  Circle,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FlipHorizontal,
  FlipVertical,
  Grid3X3,
  Group,
  Folder,
  ImageIcon,
  Italic,
  LayoutTemplate,
  LineChart,
  Link2,
  List,
  Loader2,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Ruler,
  Save,
  Search,
  SendToBack,
  Settings,
  Shapes,
  Square,
  Star,
  Table2,
  TextCursorInput,
  Trash2,
  Type,
  Underline,
  Ungroup,
  Unlock,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { nanoid } from "nanoid";
import hotkeys from "hotkeys-js";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Slider from "@radix-ui/react-slider";
import * as Tooltip from "@radix-ui/react-tooltip";
import { closestCenter, DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/editor/color-picker";
import { ElementsSidebarPanel } from "@/components/editor/elements-sidebar-panel";
import { ProjectSidebarPanel } from "@/components/editor/project-sidebar-panel";
import { TemplateSidebarPanel } from "@/components/editor/template-sidebar-panel";
import { TextSidebarPanel } from "@/components/editor/text-sidebar-panel";
import { ToolsSidebarPanel } from "@/components/editor/tools-sidebar-panel";
import { UploadsSidebarPanel } from "@/components/editor/uploads-sidebar-panel";
import { ExportModal } from "@/components/export-modal";
import { SiteLogoMark } from "@/components/site-logo";
import { api, assetUrl, ExamTemplate, previewCanvasExport, saveVisualTemplate } from "@/lib/api";
import { getClipboardImageFiles, imageFileDisplayName, isEditableClipboardTarget, readFileAsDataUrl } from "@/lib/clipboardImages";
import { rememberElementUse } from "@/lib/elementPresets";
import { A4_CANVAS, CanvasDocument, CanvasDocumentPage, CanvasElement, CanvasElementType, DrawingTool, DynamicFieldKey, EMPTY_DOCUMENT, Guide, SidebarTab, getCanvasDocumentPages } from "@/lib/editorTypes";
import { getStarterTemplate } from "@/lib/starterTemplates";
import { legacyTemplateDocument } from "@/lib/templateFallback";
import { Alignment, LayerDirection, useEditorStore } from "@/store/editorStore";

const fontFamilies = ["NanumGothic", "NanumMyeongjo", "NanumBarunGothic", "NanumSquare", "Malgun Gothic", "Dotum", "Gulim", "Batang", "Arial", "Georgia", "Times New Roman", "Courier New", "Helvetica"];
const draftPrefix = "tena-forge-editor-draft:";

type FabricModule = typeof import("fabric");
type FabricCanvas = import("fabric").Canvas;
type FabricObject = import("fabric").FabricObject;
type SmartGuide = {
  id: string;
  axis: "x" | "y";
  position: number;
  label: string;
};

type ElementPreset = {
  id: string;
  label: string;
  icon: React.ReactNode;
  type: CanvasElementType;
  description?: string;
  create: (x: number, y: number) => CanvasElement;
};

function baseElement(type: CanvasElementType, name: string, x: number, y: number, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: nanoid(),
    type,
    name,
    x,
    y,
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
    strokeStyle: "solid",
    color: "#111827",
    fontFamily: "NanumGothic",
    fontSize: 14,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "left",
    lineHeight: 1.25,
    letterSpacing: 0,
    borderRadius: 0,
    ...extra,
  };
}

function createPresets() {
  return {
    basics: [
      { id: "text", label: "텍스트", icon: <Type className="h-5 w-5" />, type: "text", create: (x, y) => baseElement("text", "텍스트", x, y, { text: "새 텍스트", width: 220, height: 46, fontSize: 18 }) },
      { id: "shape", label: "도형", icon: <Shapes className="h-5 w-5" />, type: "rect", create: (x, y) => baseElement("rect", "직사각형", x, y, { width: 140, height: 96, fill: "#e0f2fe", stroke: "#0284c7", strokeWidth: 2 }) },
      { id: "divider", label: "구분선", icon: <Minus className="h-5 w-5" />, type: "divider", create: (x, y) => baseElement("divider", "구분선", x, y, { width: 260, height: 8, stroke: "#111827", strokeWidth: 2 }) },
      { id: "image", label: "이미지", icon: <ImageIcon className="h-5 w-5" />, type: "image", create: (x, y) => baseElement("image", "이미지", x, y, { width: 180, height: 120, fill: "#f8fafc", stroke: "#cbd5e1", strokeWidth: 1 }) },
      { id: "box", label: "박스", icon: <Square className="h-5 w-5" />, type: "box", create: (x, y) => baseElement("box", "정보 박스", x, y, { width: 260, height: 90, fill: "#ffffff", stroke: "#d1d5db", strokeWidth: 1, borderRadius: 6 }) },
      { id: "table", label: "표", icon: <Table2 className="h-5 w-5" />, type: "table", create: (x, y) => baseElement("table", "표", x, y, { width: 300, height: 140, rows: 4, columns: 4, fill: "#ffffff", stroke: "#111827", strokeWidth: 1 }) },
    ] as ElementPreset[],
    content: [
      { id: "question_area", label: "문항 영역", description: "문항이 자동 배치되는 영역", icon: <FileText className="h-5 w-5" />, type: "question_area", create: (x, y) => baseElement("question_area", "문항 영역", x, y, { width: 620, height: 620, fill: "transparent", stroke: "#cbd5e1", strokeWidth: 1, columns: 2, rows: 2, questionNumberFormat: "{n}.", questionFontSize: 11 }) },
      { id: "solution_area", label: "해설 영역", description: "정답과 해설이 자동 배치되는 영역", icon: <Clipboard className="h-5 w-5" />, type: "solution_area", create: (x, y) => baseElement("solution_area", "해설 영역", x, y, { width: 620, height: 300, fill: "#f8fafc", stroke: "#cbd5e1", strokeWidth: 1, answerFormat: "답: {a}" }) },
      { id: "answer_table", label: "답안표", description: "번호와 정답을 자동으로 표기", icon: <LineChart className="h-5 w-5" />, type: "answer_table", create: (x, y) => baseElement("answer_table", "답안표", x, y, { width: 520, height: 96, fill: "#ffffff", stroke: "#111827", strokeWidth: 1, answersPerRow: 5 }) },
    ] as ElementPreset[],
  };
}

const tokens: Array<{ key: DynamicFieldKey; label: string; color: string }> = [
  { key: "exam_title", label: "{{exam_title}}", color: "#2563eb" },
  { key: "class_name", label: "{{class}}", color: "#059669" },
  { key: "student_name", label: "{{name}}", color: "#d97706" },
  { key: "date", label: "{{date}}", color: "#dc2626" },
  { key: "exam_date", label: "{{exam_date}}", color: "#dc2626" },
  { key: "exam_time", label: "{{exam_time}}", color: "#ea580c" },
  { key: "exam_datetime", label: "{{exam_datetime}}", color: "#ea580c" },
  { key: "exam_start_time", label: "{{exam_start_time}}", color: "#ea580c" },
  { key: "exam_end_time", label: "{{exam_end_time}}", color: "#ea580c" },
  { key: "page_number", label: "{{page}}", color: "#7c3aed" },
  { key: "total_pages", label: "{{total}}", color: "#0891b2" },
  { key: "academy_name", label: "{{academy}}", color: "#be123c" },
  { key: "subject", label: "{{subject}}", color: "#4f46e5" },
  { key: "grade", label: "{{grade}}", color: "#059669" },
];

function defaultTokenValue(key: DynamicFieldKey) {
  return {
    exam_title: "Midterm prep",
    class_name: "Class A",
    student_name: "Student",
    date: "2026-05-06",
    exam_date: "2026.05.06",
    exam_start_time: "14:00",
    exam_end_time: "15:40",
    exam_time: "14:00 ~ 15:40",
    exam_datetime: "2026.05.06 14:00 ~ 15:40",
    page_number: "1",
    total_pages: "1",
    academy_name: "Tena Academy",
    subject: "Math",
    grade: "Grade 2",
  }[key];
}

function snap(value: number, gridSize: number, enabled: boolean) {
  return enabled ? Math.round(value / gridSize) * gridSize : value;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function maxCornerRadius(element: Pick<CanvasElement, "width" | "height">) {
  return Math.max(0, Math.floor(Math.min(element.width || 0, element.height || 0) / 2));
}

function canvasCornerRadius(element: Pick<CanvasElement, "width" | "height" | "borderRadius" | "radius">) {
  return clamp(Math.round(element.borderRadius ?? element.radius ?? 0), 0, maxCornerRadius(element));
}

function pathFromPoints(points: Array<{ x: number; y: number }>, smooth: boolean) {
  if (!points.length) return "M0 0";
  if (!smooth || points.length < 3) return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  let path = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  return `${path} L${last.x} ${last.y}`;
}

function normalizePoints(points: Array<{ x: number; y: number }>) {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    points: points.map((point) => ({ x: Math.round(point.x - minX), y: Math.round(point.y - minY) })),
  };
}

function arrowPath(width: number, height: number) {
  const mid = height / 2;
  const head = Math.max(18, Math.min(44, width * 0.22));
  return `M0 ${mid} H${Math.max(0, width - head)} M${Math.max(0, width - head)} ${mid} L${Math.max(0, width - head)} ${Math.max(0, mid - head / 2)} L${width} ${mid} L${Math.max(0, width - head)} ${Math.min(height, mid + head / 2)} Z`;
}

function makeDrawnElement(tool: DrawingTool, start: { x: number; y: number }, end: { x: number; y: number }, options: { stroke: string; strokeWidth: number; smooth: boolean; points?: Array<{ x: number; y: number }> }): CanvasElement | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.max(2, Math.abs(end.x - start.x));
  const height = Math.max(2, Math.abs(end.y - start.y));
  if (tool === "pen") {
    const normalized = normalizePoints(options.points?.length ? options.points : [start, end]);
    return baseElement("path", "펜 드로잉", Math.round(normalized.x), Math.round(normalized.y), {
      width: Math.max(2, normalized.width),
      height: Math.max(2, normalized.height),
      fill: "transparent",
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      pathData: pathFromPoints(normalized.points, options.smooth),
    });
  }
  if (tool === "line") {
    return baseElement("line", "직선", Math.round(x), Math.round(y), { width, height, fill: "transparent", stroke: options.stroke, strokeWidth: options.strokeWidth });
  }
  if (tool === "rect") return baseElement("rect", "사각형", Math.round(x), Math.round(y), { width, height, fill: "#e2e8f0", stroke: options.stroke, strokeWidth: 1 });
  if (tool === "circle") return baseElement("circle", "원", Math.round(x), Math.round(y), { width, height, fill: "#e2e8f0", stroke: options.stroke, strokeWidth: 1 });
  if (tool === "triangle") return baseElement("triangle", "삼각형", Math.round(x), Math.round(y), { width, height, fill: "#e2e8f0", stroke: options.stroke, strokeWidth: 1 });
  if (tool === "arrow") return baseElement("path", "화살표", Math.round(x), Math.round(y), { width, height, fill: options.stroke, stroke: options.stroke, strokeWidth: 1, pathData: arrowPath(width, height) });
  return null;
}

function layerName(element: CanvasElement) {
  return element.name || element.type;
}

function DraggableTile({ preset, onAdd }: { preset: ElementPreset; onAdd?: (preset: ElementPreset) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: preset.id, data: { preset } });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onAdd?.(preset)}
      className={`flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-md border bg-white text-xs font-medium text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 ${isDragging ? "opacity-40" : ""}`}
    >
      {preset.icon}
      {preset.label}
    </button>
  );
}

function DraggableContentTile({ preset, onAdd }: { preset: ElementPreset; onAdd?: (preset: ElementPreset) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: preset.id, data: { preset } });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd?.(preset)} className={`flex w-full items-center gap-3 rounded-md border bg-white p-3 text-left shadow-sm hover:border-sky-300 hover:bg-sky-50 ${isDragging ? "opacity-40" : ""}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-700">{preset.icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{preset.label}</span>
        <span className="text-xs text-slate-500">{preset.description}</span>
      </span>
    </button>
  );
}

function SortableLayerRow({ element, index }: { element: CanvasElement; index: number }) {
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const setSelection = useEditorStore((state) => state.setSelection);
  const setVisibility = useEditorStore((state) => state.setVisibility);
  const lockElements = useEditorStore((state) => state.lockElements);
  const duplicateElements = useEditorStore((state) => state.duplicateElements);
  const deleteElements = useEditorStore((state) => state.deleteElements);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: element.id, data: { kind: "layer" } });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const isSelected = selectedIds.includes(element.id);
  const icon = element.type === "text" || element.type === "dynamic_field" ? <Type className="h-4 w-4" /> : element.type === "image" || element.type === "logo" ? <ImageIcon className="h-4 w-4" /> : <Square className="h-4 w-4" />;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div ref={setNodeRef} style={style} className={`flex h-9 items-center gap-2 rounded-md px-2 text-xs ${isSelected ? "bg-sky-100 text-sky-900" : "hover:bg-slate-100"}`} onClick={() => setSelection([element.id])}>
          <button {...attributes} {...listeners} aria-label={`${element.name} 레이어 이동`} className="cursor-grab text-slate-400">⋮⋮</button>
          {icon}
          <span className="min-w-0 flex-1 truncate">{index + 1}. {layerName(element)}</span>
          <button aria-label="보이기 전환" onClick={(event) => { event.stopPropagation(); setVisibility([element.id], !element.visible); }}>
            {element.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button aria-label="잠금 전환" onClick={(event) => { event.stopPropagation(); lockElements([element.id], !element.locked); }}>
            {element.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </button>
        </div>
      </ContextMenu.Trigger>
      <EditorContextContent
        onDuplicate={() => duplicateElements([element.id])}
        onDelete={() => deleteElements([element.id])}
        onLock={() => lockElements([element.id], !element.locked)}
      />
    </ContextMenu.Root>
  );
}

function EditorContextContent({ onDuplicate, onDelete, onLock }: { onDuplicate: () => void; onDelete: () => void; onLock: () => void }) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-[100] min-w-48 rounded-md border bg-card p-1 text-sm shadow-xl">
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent" onSelect={onDuplicate}>복제</ContextMenu.Item>
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">복사</ContextMenu.Item>
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">오려두기</ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">맨 앞으로</ContextMenu.Item>
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">앞으로</ContextMenu.Item>
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">뒤로</ContextMenu.Item>
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">맨 뒤로</ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent" onSelect={onLock}>잠금 / 잠금 해제</ContextMenu.Item>
        <ContextMenu.Item className="rounded px-2 py-1.5 text-red-600 outline-none hover:bg-red-50" onSelect={onDelete}>삭제</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

function CanvaLeftPanel({
  onNotice,
  onSave,
  onSaveCopy,
  onPreview,
  onOpenExport,
}: {
  onNotice?: (message: string) => void;
  onSave: () => Promise<ExamTemplate | null>;
  onSaveCopy: () => Promise<ExamTemplate | null>;
  onPreview: () => Promise<void> | void;
  onOpenExport: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const presets = useMemo(createPresets, []);
  const activeTab = useEditorStore((state) => state.activeSidebarTab);
  const setSidebarTab = useEditorStore((state) => state.setSidebarTab);
  const elements = useEditorStore((state) => state.canvasJson.elements);
  const addElement = useEditorStore((state) => state.addElement);
  const historyIndex = useEditorStore((state) => state.historyIndex);
  const history = useEditorStore((state) => state.history);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const showGrid = useEditorStore((state) => state.showGrid);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const showRulers = useEditorStore((state) => state.showRulers);
  const showGuides = useEditorStore((state) => state.showGuides);
  const toggleGrid = useEditorStore((state) => state.toggleGrid);
  const toggleSnap = useEditorStore((state) => state.toggleSnap);
  const toggleRulers = useEditorStore((state) => state.toggleRulers);
  const toggleGuides = useEditorStore((state) => state.toggleGuides);
  const normalizedTab = activeTab === "assets" ? "uploads" : activeTab;
  const filteredBasics = presets.basics.filter((preset) => preset.label.toLowerCase().includes(query.toLowerCase()));

  const tabs: Array<{ key: SidebarTab; label: string; hint: string; icon: React.ReactNode }> = [
    { key: "templates", label: "추천 템플릿", hint: "기본 레이아웃", icon: <LayoutTemplate className="h-6 w-6" /> },
    { key: "elements", label: "요소", hint: "도형과 영역", icon: <Shapes className="h-6 w-6" /> },
    { key: "text", label: "텍스트", hint: "글상자와 변수", icon: <Type className="h-6 w-6" /> },
    { key: "uploads", label: "업로드 항목", hint: "이미지와 로고", icon: <UploadCloud className="h-6 w-6" /> },
    { key: "tools", label: "도구", hint: "배치 도구", icon: <Pencil className="h-6 w-6" /> },
    { key: "projects", label: "프로젝트", hint: "저장과 버전", icon: <Folder className="h-6 w-6" /> },
  ];
  const activeMeta = tabs.find((tab) => tab.key === normalizedTab) || tabs[1];

  function addTextStyle(label: string, size: number, weight: "normal" | "bold", color = "#111827") {
    addElement(baseElement("text", label, 120, 120, { text: label, width: 260, height: Math.max(40, size * 1.7), fontSize: size, fontWeight: weight, color }));
  }

  function addPreset(preset: ElementPreset) {
    addElement(preset.create(120, 120));
  }

  const layerList = (
    <SortableContext items={elements.map((element) => element.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-1">
        {[...elements].sort((a, b) => b.zIndex - a.zIndex).map((element, index) => <SortableLayerRow key={element.id} element={element} index={index} />)}
        {!elements.length && <div className="rounded-md border border-dashed border-white/10 bg-white/[0.04] p-6 text-center text-xs text-slate-400">레이어가 없습니다.</div>}
      </div>
    </SortableContext>
  );

  return (
    <aside className="flex h-full w-[420px] shrink-0 forge-panel text-slate-100">
      <nav className="flex w-[108px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/10 bg-black/35 px-2 py-3" aria-label="편집 도구">
        {tabs.map((tab) => {
          const active = normalizedTab === tab.key;
          return (
            <Tooltip.Root key={tab.key}>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => setSidebarTab(tab.key)}
                  aria-label={tab.label}
                  aria-pressed={active}
                  className={`flex min-h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-md px-1 text-center text-[11px] leading-tight transition ${
                    active ? "bg-white/[0.10] text-white shadow-sm ring-1 ring-white/12" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {tab.icon}
                  <span className="w-full break-keep">{tab.label}</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content side="right" sideOffset={10} className="z-[90] rounded bg-slate-950 px-2 py-1 text-xs text-white shadow">
                  {tab.label}
                  <Tooltip.Arrow className="fill-slate-950" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col bg-[#0b0d13]">
        <div className="border-b border-white/10 bg-black/25 px-4 py-3">
          <div className="text-sm font-semibold text-white">{activeMeta.label}</div>
          <p className="mt-0.5 text-xs text-slate-400">{activeMeta.hint}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {normalizedTab === "templates" && (
            <TemplateSidebarPanel onNotice={onNotice} />
          )}

          {normalizedTab === "elements" && (
            <ElementsSidebarPanel />
          )}

          {false && normalizedTab === "elements" && (
            <div className="space-y-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="요소 검색" className="h-9 bg-white pl-9" aria-label="요소 검색" />
              </label>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">기본 요소</h3>
                <div className="grid grid-cols-2 gap-2">{filteredBasics.map((preset) => <DraggableTile key={preset.id} preset={preset} onAdd={addPreset} />)}</div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">자동 영역</h3>
                <div className="space-y-2">{presets.content.map((preset) => <DraggableContentTile key={preset.id} preset={preset} onAdd={addPreset} />)}</div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">도형</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ["사각형", "rect", <Square key="rect" className="h-4 w-4" />],
                    ["원", "circle", <Circle key="circle" className="h-4 w-4" />],
                    ["삼각형", "triangle", <Shapes key="triangle" className="h-4 w-4" />],
                    ["선", "line", <Minus key="line" className="h-4 w-4" />],
                  ].map(([label, type, icon]) => (
                    <button key={String(label)} className="flex h-12 items-center justify-center rounded-md border bg-white hover:bg-slate-100" aria-label={String(label)} onClick={() => addElement(baseElement(type as CanvasElementType, String(label), 140, 140, { width: type === "line" ? 180 : 100, height: type === "line" ? 20 : 100, fill: type === "line" ? "transparent" : "#e0f2fe", stroke: "#0f172a", strokeWidth: 2 }))}>{icon}</button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {normalizedTab === "text" && (
            <TextSidebarPanel />
          )}

          {false && normalizedTab === "text" && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">텍스트 스타일</h3>
                <div className="space-y-2">
                  <button className="w-full rounded-md border bg-white p-3 text-left text-2xl font-bold hover:bg-slate-100" onClick={() => addTextStyle("제목", 28, "bold")}>제목</button>
                  <button className="w-full rounded-md border bg-white p-3 text-left text-lg font-bold hover:bg-slate-100" onClick={() => addTextStyle("소제목", 18, "bold")}>소제목</button>
                  <button className="w-full rounded-md border bg-white p-3 text-left text-sm hover:bg-slate-100" onClick={() => addTextStyle("본문", 11, "normal")}>본문</button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">시험지 변수</h3>
                <div className="flex flex-wrap gap-2">
                  {tokens.map((token) => {
                    const preset: ElementPreset = { id: `token-${token.key}`, label: token.label, icon: <TextCursorInput className="h-4 w-4" />, type: "dynamic_field", description: token.label, create: (x, y) => baseElement("dynamic_field", token.label, x, y, { text: token.label, fieldKey: token.key, previewValue: defaultTokenValue(token.key), width: 170, height: 32, color: "#111827", fill: "transparent", backgroundColor: "transparent", stroke: "transparent", strokeWidth: 0, borderRadius: 0, fontSize: 14, fontWeight: "normal", textAlign: "left" }) };
                    return <DraggableToken key={token.key} preset={preset} color={token.color} onAdd={addPreset} />;
                  })}
                </div>
              </section>
            </div>
          )}

          {normalizedTab === "uploads" && (
            <UploadsSidebarPanel onNotice={onNotice} />
          )}

          {false && normalizedTab === "uploads" && (
            <div className="space-y-5">
              <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <UploadCloud className="h-6 w-6" /> 이미지 업로드
                <input className="hidden" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => addElement(baseElement("image", file.name, 140, 140, { src: String(reader.result), width: 240, height: 160, objectFit: "contain" })); reader.readAsDataURL(file); }} />
              </label>
              <button className="flex h-20 w-full items-center justify-center rounded-md border bg-white text-sm font-semibold hover:bg-slate-50" onClick={() => addElement(baseElement("image", "이미지 자리", 140, 140, { width: 240, height: 160, fill: "#f8fafc", stroke: "#cbd5e1", strokeWidth: 1 }))}>이미지 자리 추가</button>
            </div>
          )}

          {normalizedTab === "tools" && (
            <ToolsSidebarPanel />
          )}

          {false && normalizedTab === "tools" && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">편집</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" disabled={historyIndex <= 0} onClick={undo}><UndoIcon />실행 취소</Button>
                  <Button variant="outline" size="sm" disabled={historyIndex >= history.length - 1} onClick={redo}><Redo2 className="h-4 w-4" />다시 실행</Button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">확대/축소</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setZoom(zoom - 0.1)} aria-label="축소"><ZoomOut className="h-4 w-4" /></Button>
                  <Input value={`${Math.round(zoom * 100)}%`} onChange={(event) => setZoom(Number(event.target.value.replace("%", "")) / 100 || 1)} className="h-9 text-center text-xs" aria-label="확대/축소" />
                  <Button variant="outline" size="icon" onClick={() => setZoom(zoom + 0.1)} aria-label="확대"><ZoomIn className="h-4 w-4" /></Button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">보기 도구</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={showGrid ? "secondary" : "outline"} size="sm" onClick={toggleGrid}><Grid3X3 className="h-4 w-4" />그리드</Button>
                  <Button variant={snapToGrid ? "secondary" : "outline"} size="sm" onClick={toggleSnap}><MousePointer2 className="h-4 w-4" />스냅</Button>
                  <Button variant={showRulers ? "secondary" : "outline"} size="sm" onClick={toggleRulers}><Ruler className="h-4 w-4" />눈금자</Button>
                  <Button variant={showGuides ? "secondary" : "outline"} size="sm" onClick={toggleGuides}><List className="h-4 w-4" />안내선</Button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">빠른 추가</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button className="rounded-md border bg-white p-3 text-sm font-semibold hover:bg-slate-50" onClick={() => addElement(baseElement("divider", "가로선", 120, 140, { width: 320, height: 8, strokeWidth: 2 }))}>가로선</button>
                  <button className="rounded-md border bg-white p-3 text-sm font-semibold hover:bg-slate-50" onClick={() => addElement(baseElement("box", "정보 박스", 120, 140, { width: 260, height: 96, strokeWidth: 1, borderRadius: 4 }))}>정보 박스</button>
                  <button className="rounded-md border bg-white p-3 text-sm font-semibold hover:bg-slate-50" onClick={() => addElement(baseElement("table", "표", 120, 140, { width: 300, height: 140, rows: 4, columns: 4, strokeWidth: 1 }))}>표</button>
                  <button className="rounded-md border bg-white p-3 text-sm font-semibold hover:bg-slate-50" onClick={() => addElement(baseElement("answer_table", "답안표", 120, 140, { width: 520, height: 96, answersPerRow: 5, strokeWidth: 1 }))}>답안표</button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">속성</h3>
                <div className="[&>aside]:h-auto [&>aside]:border-l-0 [&>aside]:bg-transparent [&>aside]:p-0">
                  <Inspector />
                </div>
              </section>
            </div>
          )}

          {normalizedTab === "projects" && (
            <ProjectSidebarPanel onNotice={onNotice} onSave={onSave} onSaveCopy={onSaveCopy} onPreview={onPreview} onOpenExport={onOpenExport} />
          )}

          {normalizedTab === "layers" && layerList}
        </div>
      </div>
    </aside>
  );
}

function DraggableToken({ preset, color, onAdd }: { preset: ElementPreset; color: string; onAdd?: (preset: ElementPreset) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: preset.id, data: { preset } });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={() => onAdd?.(preset)} className={`rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-900 transition hover:bg-slate-100 ${isDragging ? "opacity-50" : ""}`} style={{ color: "#111827" }}>
      {preset.label}
    </button>
  );
}

async function makeFabricObject(fabric: FabricModule, element: CanvasElement): Promise<FabricObject | null> {
  const common = {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    angle: element.rotation,
    flipX: Boolean(element.flipX),
    flipY: Boolean(element.flipY),
    opacity: element.opacity,
    visible: element.visible,
    selectable: !element.locked,
    evented: !element.locked,
    lockMovementX: element.locked,
    lockMovementY: element.locked,
    lockScalingX: element.locked,
    lockScalingY: element.locked,
    lockRotation: element.locked,
    objectCaching: false,
  } as Record<string, unknown>;
  const data = { id: element.id, locked: element.locked };
  let object: FabricObject | null = null;

  if (element.type === "text" || element.type === "dynamic_field" || element.type === "icon") {
    const fontFamily = element.fontFamily || "NanumGothic";
    const fontSize = element.fontSize || 14;
    const fontWeight = element.fontWeight || "normal";
    const fontStyle = element.fontStyle || "normal";
    object = new fabric.IText(element.previewValue || element.text || "", {
      ...common,
      fill: element.color || element.fill || "#111827",
      backgroundColor: element.backgroundColor || (element.type === "dynamic_field" && element.fill !== "transparent" ? element.fill : undefined),
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      underline: Boolean(element.underline),
      linethrough: Boolean(element.linethrough),
      textAlign: element.textAlign || "left",
      lineHeight: element.lineHeight || 1.25,
      charSpacing: (element.letterSpacing || 0) * 10,
    });
  } else if (element.type === "circle") {
    object = new fabric.Ellipse({ ...common, rx: element.width / 2, ry: element.height / 2, fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth });
  } else if (element.type === "triangle") {
    object = new fabric.Triangle({ ...common, fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth });
  } else if (element.type === "line" || element.type === "divider") {
    object = new fabric.Line([0, element.height / 2, element.width, element.height / 2], { ...common, fill: element.stroke, stroke: element.stroke, strokeWidth: Math.max(1, element.strokeWidth || 1), strokeDashArray: element.strokeStyle === "dashed" ? [8, 6] : element.strokeStyle === "dotted" ? [2, 6] : undefined });
  } else if (element.type === "path" && element.pathData) {
    const path = new fabric.Path(element.pathData, {
      ...common,
      fill: element.fill === "transparent" ? "" : element.fill || "",
      stroke: element.stroke || "#111827",
      strokeWidth: element.strokeWidth || 0,
      strokeDashArray: element.strokeStyle === "dashed" ? [8, 6] : element.strokeStyle === "dotted" ? [2, 6] : undefined,
      strokeUniform: true,
    });
    const pathWidth = path.width || element.width || 1;
    const pathHeight = path.height || element.height || 1;
    path.set({
      left: element.x,
      top: element.y,
      scaleX: element.width / pathWidth,
      scaleY: element.height / pathHeight,
    });
    object = path;
  } else if ((element.type === "image" || element.type === "logo") && element.src) {
    object = await new Promise<FabricObject | null>((resolve) => {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const img = new fabric.FabricImage(image, { ...common });
        img.scaleToWidth(element.width);
        img.scaleToHeight(element.height);
        resolve(img);
      };
      image.onerror = () => resolve(null);
      image.src = assetUrl(element.src || "");
    });
  } else if (element.type === "logo") {
    return null;
  } else if (element.type === "table" || element.type === "answer_table") {
    const rows = Math.max(1, element.rows || 4);
    const columns = Math.max(1, element.columns || element.answersPerRow || 4);
    const cornerRadius = canvasCornerRadius(element);
    const rect = new fabric.Rect({
      left: 0,
      top: 0,
      width: element.width,
      height: element.height,
      rx: cornerRadius,
      ry: cornerRadius,
      fill: element.fill === "transparent" ? "rgba(255,255,255,0.01)" : element.fill || "#ffffff",
      stroke: element.stroke || "#111827",
      strokeWidth: element.strokeWidth || 1,
      selectable: false,
      evented: false,
    });
    const parts: FabricObject[] = [rect];
    for (let row = 1; row < rows; row += 1) {
      parts.push(new fabric.Line([0, (element.height / rows) * row, element.width, (element.height / rows) * row], { stroke: element.stroke || "#111827", strokeWidth: Math.max(1, element.strokeWidth || 1), selectable: false, evented: false }));
    }
    for (let column = 1; column < columns; column += 1) {
      parts.push(new fabric.Line([(element.width / columns) * column, 0, (element.width / columns) * column, element.height], { stroke: element.stroke || "#111827", strokeWidth: Math.max(1, element.strokeWidth || 1), selectable: false, evented: false }));
    }
    const headers = element.tableHeaders || (element.type === "answer_table" ? ["번호", "정답", "배점"] : []);
    headers.slice(0, columns).forEach((header, index) => {
      parts.push(new fabric.Textbox(header, {
        left: (element.width / columns) * index,
        top: Math.max(3, element.height / rows / 2 - 8),
        width: element.width / columns,
        height: 18,
        fill: element.color || "#111827",
        fontFamily: element.fontFamily || "NanumGothic",
        fontSize: Math.min(13, Math.max(9, element.fontSize || 11)),
        fontWeight: "bold",
        textAlign: "center",
        selectable: false,
        evented: false,
      }));
    });
    object = new fabric.Group(parts, { ...common });
  }

  if (!object) {
    const cornerRadius = canvasCornerRadius(element);
    const rect = new fabric.Rect({
      ...common,
      rx: cornerRadius,
      ry: cornerRadius,
      fill: element.fill === "transparent" ? "rgba(255,255,255,0.01)" : element.fill || "#ffffff",
      stroke: element.stroke || "#cbd5e1",
      strokeWidth: element.strokeWidth || 0,
      strokeDashArray: element.strokeStyle === "dashed" ? [8, 6] : element.strokeStyle === "dotted" ? [2, 6] : undefined,
    });
    if (element.type === "question_area" || element.type === "solution_area") {
      object = rect;
    } else if (["answer_table", "table", "image"].includes(element.type)) {
      const label = new fabric.Textbox(element.name, {
        left: 16,
        top: Math.max(10, element.height / 2 - 12),
        width: Math.max(40, element.width - 32),
        height: 24,
        fill: "#64748b",
        fontFamily: "NanumGothic",
        fontSize: 14,
        textAlign: "center",
        selectable: false,
        evented: false,
      });
      object = new fabric.Group([rect, label], { ...common });
    } else {
      object = rect;
    }
  }
  if (object && element.shadow) {
    object.set("shadow", new fabric.Shadow(element.shadow));
  }
  object.set("data", data);
  return object;
}

function applyCanvasDrawingMode(canvas: FabricCanvas, drawingActive: boolean) {
  canvas.selection = !drawingActive;
  canvas.defaultCursor = drawingActive ? "crosshair" : "default";
  canvas.hoverCursor = drawingActive ? "crosshair" : "move";
  canvas.getObjects().forEach((object) => {
    const data = object.get("data") as { locked?: boolean } | undefined;
    object.set({
      selectable: !drawingActive && !data?.locked,
      evented: !drawingActive && !data?.locked,
    });
  });
  if (drawingActive) canvas.discardActiveObject();
  canvas.requestRenderAll();
}

function fabricObjectIds(objects: FabricObject[]) {
  return objects.map((object) => (object.get("data") as { id: string } | undefined)?.id).filter(Boolean) as string[];
}

function sameIdSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function objectBox(object: FabricObject) {
  const left = object.left || 0;
  const top = object.top || 0;
  const width = typeof object.getScaledWidth === "function" ? object.getScaledWidth() : (object.width || 0) * (object.scaleX || 1);
  const height = typeof object.getScaledHeight === "function" ? object.getScaledHeight() : (object.height || 0) * (object.scaleY || 1);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function smartGuideMove(object: FabricObject, canvasDocument: CanvasDocument, movingIds: string[], otherElements: CanvasElement[], manualGuides: Guide[], guideSnapEnabled: boolean) {
  if (!guideSnapEnabled) return [] as SmartGuide[];
  const threshold = 6;
  const box = objectBox(object);
  const xTargets: Array<{ position: number; label: string }> = [
    { position: 0, label: "페이지 왼쪽" },
    { position: canvasDocument.page.width / 2, label: "페이지 중앙" },
    { position: canvasDocument.page.width, label: "페이지 오른쪽" },
    { position: canvasDocument.page.margins.left, label: "왼쪽 여백" },
    { position: canvasDocument.page.width - canvasDocument.page.margins.right, label: "오른쪽 여백" },
    ...manualGuides.filter((guide) => guide.axis === "x").map((guide) => ({ position: guide.position, label: "안내선" })),
  ];
  const yTargets: Array<{ position: number; label: string }> = [
    { position: 0, label: "페이지 위쪽" },
    { position: canvasDocument.page.height / 2, label: "페이지 중앙" },
    { position: canvasDocument.page.height, label: "페이지 아래쪽" },
    { position: canvasDocument.page.margins.top, label: "위쪽 여백" },
    { position: canvasDocument.page.height - canvasDocument.page.margins.bottom, label: "아래쪽 여백" },
    ...manualGuides.filter((guide) => guide.axis === "y").map((guide) => ({ position: guide.position, label: "안내선" })),
  ];

  otherElements.forEach((element) => {
    if (movingIds.includes(element.id) || !element.visible) return;
    xTargets.push({ position: element.x, label: "요소 왼쪽" });
    xTargets.push({ position: element.x + element.width / 2, label: "요소 중앙" });
    xTargets.push({ position: element.x + element.width, label: "요소 오른쪽" });
    yTargets.push({ position: element.y, label: "요소 위쪽" });
    yTargets.push({ position: element.y + element.height / 2, label: "요소 중앙" });
    yTargets.push({ position: element.y + element.height, label: "요소 아래쪽" });
  });

  const xAnchors = [
    { value: box.left, offset: 0 },
    { value: box.centerX, offset: box.width / 2 },
    { value: box.right, offset: box.width },
  ];
  const yAnchors = [
    { value: box.top, offset: 0 },
    { value: box.centerY, offset: box.height / 2 },
    { value: box.bottom, offset: box.height },
  ];
  let xMatchDelta: number | null = null;
  let yMatchDelta: number | null = null;
  let xMatchTarget: { position: number; label: string } | null = null;
  let yMatchTarget: { position: number; label: string } | null = null;

  for (const target of xTargets) {
    for (const anchor of xAnchors) {
      const delta = target.position - anchor.value;
      if (Math.abs(delta) <= threshold && (xMatchDelta === null || Math.abs(delta) < Math.abs(xMatchDelta))) {
        xMatchDelta = delta;
        xMatchTarget = target;
      }
    }
  }
  for (const target of yTargets) {
    for (const anchor of yAnchors) {
      const delta = target.position - anchor.value;
      if (Math.abs(delta) <= threshold && (yMatchDelta === null || Math.abs(delta) < Math.abs(yMatchDelta))) {
        yMatchDelta = delta;
        yMatchTarget = target;
      }
    }
  }

  const guides: SmartGuide[] = [];
  if (xMatchDelta !== null && xMatchTarget) {
    object.set("left", (object.left || 0) + xMatchDelta);
    guides.push({ id: `x-${Math.round(xMatchTarget.position)}-${xMatchTarget.label}`, axis: "x", position: xMatchTarget.position, label: xMatchTarget.label });
  }
  if (yMatchDelta !== null && yMatchTarget) {
    object.set("top", (object.top || 0) + yMatchDelta);
    guides.push({ id: `y-${Math.round(yMatchTarget.position)}-${yMatchTarget.label}`, axis: "y", position: yMatchTarget.position, label: yMatchTarget.label });
  }
  if (guides.length) object.setCoords();
  return guides;
}

function CanvasWorkspace() {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvas = useRef<FabricCanvas | null>(null);
  const fabricModule = useRef<FabricModule | null>(null);
  const syncing = useRef(false);
  const renderSerial = useRef(0);
  const drawingRef = useRef<{ start: { x: number; y: number }; points: Array<{ x: number; y: number }> } | null>(null);
  const skipNextCanvasClick = useRef(false);
  const [fabricReady, setFabricReady] = useState(false);
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);
  const document = useEditorStore((state) => state.canvasJson);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const isEditing = useEditorStore((state) => state.isEditing);
  const editingElementId = useEditorStore((state) => state.editingElementId);
  const setSelection = useEditorStore((state) => state.setSelection);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const updateElement = useEditorStore((state) => state.updateElement);
  const showGrid = useEditorStore((state) => state.showGrid);
  const gridSize = useEditorStore((state) => state.gridSize);
  const showRulers = useEditorStore((state) => state.showRulers);
  const showGuides = useEditorStore((state) => state.showGuides);
  const guides = useEditorStore((state) => state.guides);
  const zoom = useEditorStore((state) => state.zoom);
  const addElement = useEditorStore((state) => state.addElement);
  const deleteGuide = useEditorStore((state) => state.deleteGuide);
  const activeDrawingTool = useEditorStore((state) => state.activeDrawingTool);

  useEffect(() => {
    let disposed = false;
    async function init() {
      const fabric = await import("fabric");
      if (!canvasEl.current || disposed) return;
      fabricModule.current = fabric;
      const canvas = new fabric.Canvas(canvasEl.current, {
        width: document.page.width,
        height: document.page.height,
        backgroundColor: document.page.backgroundImage ? "transparent" : document.page.backgroundColor,
        preserveObjectStacking: true,
        selectionColor: "rgba(14, 165, 233, 0.12)",
        selectionBorderColor: "#0ea5e9",
        selectionLineWidth: 1,
      });
      fabricCanvas.current = canvas;
      canvas.on("selection:created", () => {
        if (syncing.current) return;
        setSelection(fabricObjectIds(canvas.getActiveObjects()));
      });
      canvas.on("selection:updated", () => {
        if (syncing.current) return;
        setSelection(fabricObjectIds(canvas.getActiveObjects()));
      });
      canvas.on("selection:cleared", () => {
        if (syncing.current) return;
        clearSelection();
      });
      const updateSmartGuides = (event: { target?: FabricObject }) => {
        const object = event.target;
        if (!object) return;
        const state = useEditorStore.getState();
        const data = object.get("data") as { id?: string } | undefined;
        const movingIds = data?.id ? [data.id] : state.selectedIds;
        const guides = smartGuideMove(object, state.canvasJson, movingIds, state.canvasJson.elements, state.guides, state.showGuides);
        setSmartGuides(guides);
        if (guides.length) canvas.requestRenderAll();
      };
      canvas.on("object:moving", updateSmartGuides);
      canvas.on("object:scaling", updateSmartGuides);
      canvas.on("object:rotating", () => setSmartGuides([]));
      canvas.on("object:modified", (event) => {
        setSmartGuides([]);
        const object = event.target;
        const id = (object?.get("data") as { id: string } | undefined)?.id;
        if (!id || !object) return;
        const state = useEditorStore.getState();
        const element = state.canvasJson.elements.find((item) => item.id === id);
        const action = ((event as { transform?: { action?: string } }).transform?.action || "").toLowerCase();
        const next: Partial<CanvasElement> = {
          x: Math.round(snap(object.left || 0, state.gridSize, state.snapToGrid)),
          y: Math.round(snap(object.top || 0, state.gridSize, state.snapToGrid)),
        };
        if (action.includes("scale") || action.includes("resize")) {
          const scaledWidth = typeof object.getScaledWidth === "function" ? object.getScaledWidth() : (object.width || element?.width || 1) * (object.scaleX || 1);
          const scaledHeight = typeof object.getScaledHeight === "function" ? object.getScaledHeight() : (object.height || element?.height || 1) * (object.scaleY || 1);
          next.width = Math.max(1, Math.round(scaledWidth));
          next.height = Math.max(1, Math.round(scaledHeight));
        }
        const rotation = Math.round(object.angle || 0);
        if (!element || rotation !== Math.round(element.rotation || 0) || action.includes("rotate")) {
          next.rotation = rotation;
        }
        updateElement(id, next);
      });
      canvas.on("text:editing:exited", (event) => {
        const object = event.target as (FabricObject & { text?: string }) | undefined;
        const id = (object?.get("data") as { id: string } | undefined)?.id;
        if (!id || !object) return;
        updateElement(id, { text: object.text || "" });
      });
      canvas.on("mouse:down", (event) => {
        const state = useEditorStore.getState();
        const tool = state.activeDrawingTool;
        if (tool === "select") return;
        const pointer = canvas.getPointer(event.e);
        const shouldSnap = tool !== "pen" && state.snapToGrid;
        const point = {
          x: snap(pointer.x, state.gridSize, shouldSnap),
          y: snap(pointer.y, state.gridSize, shouldSnap),
        };
        drawingRef.current = { start: point, points: [point] };
      });
      canvas.on("mouse:move", (event) => {
        const drawing = drawingRef.current;
        const state = useEditorStore.getState();
        if (!drawing || state.activeDrawingTool !== "pen") return;
        const pointer = canvas.getPointer(event.e);
        drawing.points.push({ x: pointer.x, y: pointer.y });
      });
      canvas.on("mouse:up", (event) => {
        setSmartGuides([]);
        const drawing = drawingRef.current;
        drawingRef.current = null;
        if (!drawing) return;
        const state = useEditorStore.getState();
        const tool = state.activeDrawingTool;
        if (tool === "select") return;
        const pointer = canvas.getPointer(event.e);
        const shouldSnap = tool !== "pen" && state.snapToGrid;
        let end = {
          x: snap(pointer.x, state.gridSize, shouldSnap),
          y: snap(pointer.y, state.gridSize, shouldSnap),
        };
        if (tool !== "pen" && Math.abs(end.x - drawing.start.x) < 3 && Math.abs(end.y - drawing.start.y) < 3) {
          end = { x: drawing.start.x + 150, y: drawing.start.y + (tool === "line" ? 2 : 100) };
        }
        const element = makeDrawnElement(tool, drawing.start, end, {
          stroke: state.penColor,
          strokeWidth: state.penStrokeWidth,
          smooth: state.penSmooth,
          points: tool === "pen" ? [...drawing.points, { x: pointer.x, y: pointer.y }] : undefined,
        });
        if (!element) return;
        skipNextCanvasClick.current = true;
        state.setDrawingTool("select");
        state.setActionName("그리기");
        state.addElement(element);
      });
      setFabricReady(true);
    }
    init();
    return () => {
      disposed = true;
      fabricCanvas.current?.dispose();
      fabricCanvas.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    const fabric = fabricModule.current;
    if (!fabricReady || !canvas || !fabric) return;
    const renderId = renderSerial.current + 1;
    renderSerial.current = renderId;
    syncing.current = true;
    canvas.setDimensions({ width: document.page.width, height: document.page.height });
    const canvasBackground = document.page.backgroundImage ? "transparent" : document.page.backgroundColor;
    canvas.backgroundColor = canvasBackground;
    canvas.clear();
    canvas.backgroundColor = canvasBackground;
    Promise.all([...document.elements].sort((a, b) => a.zIndex - b.zIndex).map((element) => makeFabricObject(fabric, element))).then((objects) => {
      if (renderSerial.current !== renderId) return;
      objects.filter(Boolean).forEach((object) => canvas.add(object as FabricObject));
      const drawingActive = useEditorStore.getState().activeDrawingTool !== "select";
      applyCanvasDrawingMode(canvas, drawingActive);
      const active = drawingActive ? [] : canvas.getObjects().filter((object) => selectedIds.includes((object.get("data") as { id: string } | undefined)?.id || ""));
      if (active.length === 1) canvas.setActiveObject(active[0]);
      else if (active.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(active, { canvas }));
      canvas.requestRenderAll();
      syncing.current = false;
      if (isEditing) {
        const editId = editingElementId || selectedIds[0];
        const object = canvas.getObjects().find((item) => (item.get("data") as { id: string } | undefined)?.id === editId);
        const editable = object as FabricObject & { enterEditing?: () => void; selectAll?: () => void; hiddenTextarea?: HTMLTextAreaElement };
        if (editable?.enterEditing) {
          window.setTimeout(() => {
            canvas.setActiveObject(editable);
            editable.enterEditing?.();
            editable.selectAll?.();
            editable.hiddenTextarea?.focus();
            canvas.requestRenderAll();
            useEditorStore.setState({ isEditing: false, editingElementId: null });
          }, 0);
        }
      }
    });
  }, [fabricReady, document, isEditing, editingElementId]);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    const fabric = fabricModule.current;
    if (!fabricReady || !canvas || !fabric || useEditorStore.getState().activeDrawingTool !== "select") return;
    const currentIds = fabricObjectIds(canvas.getActiveObjects());
    if (sameIdSet(currentIds, selectedIds)) return;
    syncing.current = true;
    try {
      canvas.discardActiveObject();
      const active = canvas.getObjects().filter((object) => selectedIds.includes((object.get("data") as { id: string } | undefined)?.id || ""));
      if (active.length === 1) canvas.setActiveObject(active[0]);
      else if (active.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(active, { canvas }));
      canvas.requestRenderAll();
    } finally {
      syncing.current = false;
    }
  }, [fabricReady, selectedIds]);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;
    applyCanvasDrawingMode(canvas, activeDrawingTool !== "select");
  }, [activeDrawingTool]);

  function handleCanvasClick() {
    if (skipNextCanvasClick.current) {
      skipNextCanvasClick.current = false;
      return;
    }
    if (!fabricCanvas.current?.getActiveObject()) clearSelection();
  }

  const gridBackground: CSSProperties = showGrid
    ? {
        backgroundImage: `linear-gradient(to right, ${document.page.gridColor} 1px, transparent 1px), linear-gradient(to bottom, ${document.page.gridColor} 1px, transparent 1px)`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }
    : {};
  const backgroundUrl = document.page.backgroundImage ? assetUrl(document.page.backgroundImage) : "";
  const backgroundFit = document.page.backgroundFit || "contain";
  const backgroundImageStyle: CSSProperties = {
    backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : undefined,
    backgroundRepeat: backgroundFit === "tile" ? "repeat" : "no-repeat",
    backgroundSize: backgroundFit === "cover" ? "cover" : backgroundFit === "contain" ? "contain" : "auto",
    backgroundPosition: "center",
    opacity: document.page.backgroundOpacity ?? 0.25,
  };
  const pageFrameStyle: CSSProperties = {
    width: document.page.width,
    height: document.page.height,
    backgroundColor: document.page.backgroundColor,
    ...gridBackground,
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div ref={wrapperRef} className="relative h-full overflow-auto bg-[#07090f]" onClick={handleCanvasClick}>
          {showRulers && <Rulers page={document.page} />}
          <div className="relative min-h-full min-w-full p-[60px]" style={{ paddingTop: showRulers ? 80 : 60, paddingLeft: showRulers ? 80 : 60 }}>
            <div className="relative mx-auto w-fit origin-top" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
              {showGuides && guides.map((guide) => (
                <button
                  key={guide.id}
                  onDoubleClick={() => deleteGuide(guide.id)}
                  className="absolute z-20 border-sky-400"
                  style={guide.axis === "x" ? { left: guide.position, top: -999, height: 3000, borderLeftWidth: 1, borderStyle: "dashed" } : { top: guide.position, left: -999, width: 3000, borderTopWidth: 1, borderStyle: "dashed" }}
                  aria-label="안내선 삭제"
                />
              ))}
              <div className="relative bg-white shadow-[0_4px_24px_rgba(0,0,0,0.3)]" style={pageFrameStyle}>
                {backgroundUrl && <div className="pointer-events-none absolute inset-0" style={backgroundImageStyle} />}
                <canvas ref={canvasEl} />
                {smartGuides.map((guide) => (
                  <div
                    key={guide.id}
                    className="pointer-events-none absolute z-30 bg-sky-500/90"
                    style={guide.axis === "x" ? { left: guide.position, top: 0, width: 1, height: document.page.height } : { top: guide.position, left: 0, width: document.page.width, height: 1 }}
                  />
                ))}
                {document.page.showMarginGuides && (
                  <div
                    className="pointer-events-none absolute border border-dashed border-rose-400/80"
                    style={{
                      left: document.page.margins.left,
                      top: document.page.margins.top,
                      right: document.page.margins.right,
                      bottom: document.page.margins.bottom,
                    }}
                  />
                )}
                <DropTarget wrapperRef={wrapperRef} addElement={addElement} />
              </div>
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[100] min-w-48 rounded-md border bg-card p-1 text-sm shadow-xl">
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent" onSelect={() => useEditorStore.getState().pasteFromClipboard()}>붙여넣기</ContextMenu.Item>
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent" onSelect={() => useEditorStore.getState().setSelection(useEditorStore.getState().canvasJson.elements.map((element) => element.id))}>전체 선택</ContextMenu.Item>
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent" onSelect={() => useEditorStore.setState({ guides: [] })}>안내선 모두 삭제</ContextMenu.Item>
          <ContextMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent" onSelect={() => useEditorStore.getState().toggleGrid()}>그리드 표시/숨기기</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function DropTarget({ wrapperRef, addElement }: { wrapperRef: React.RefObject<HTMLDivElement>; addElement: (element: CanvasElement) => void }) {
  return <div className="pointer-events-none absolute inset-0" data-canvas-drop="true" data-wrapper-id={wrapperRef.current ? "ready" : "pending"} />;
}

function Rulers({ page }: { page: CanvasDocument["page"] }) {
  const setGuide = useEditorStore((state) => state.setGuide);
  const zoom = useEditorStore((state) => state.zoom);
  const ticksX = Array.from({ length: Math.ceil(page.width / 50) + 1 }, (_, index) => index * 50);
  const ticksY = Array.from({ length: Math.ceil(page.height / 50) + 1 }, (_, index) => index * 50);
  return (
    <>
      <div className="absolute left-0 top-0 z-30 h-5 w-5 border-b border-r border-slate-600 bg-[#2b2b2b]" />
      <div className="absolute left-5 right-0 top-0 z-30 h-5 bg-[#2b2b2b] text-[9px] text-slate-300">
        {ticksX.map((tick) => <button key={tick} className="absolute top-0 h-5 border-l border-slate-600 pl-1" style={{ left: tick * zoom + 60 }} onDoubleClick={() => setGuide({ id: nanoid(), axis: "x", position: tick })}>{tick}</button>)}
      </div>
      <div className="absolute bottom-0 left-0 top-5 z-30 w-5 bg-[#2b2b2b] text-[9px] text-slate-300">
        {ticksY.map((tick) => <button key={tick} className="absolute left-0 w-5 border-t border-slate-600 pt-1 [writing-mode:vertical-rl]" style={{ top: tick * zoom + 60 }} onDoubleClick={() => setGuide({ id: nanoid(), axis: "y", position: tick })}>{tick}</button>)}
      </div>
    </>
  );
}

function NumericField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="space-y-1 text-xs font-medium text-slate-600">
      {label}
      <Input type="number" min={min} max={max} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} className="h-8" aria-label={label} />
    </label>
  );
}

function Inspector() {
  const document = useEditorStore((state) => state.canvasJson);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const updateElement = useEditorStore((state) => state.updateElement);
  const updateElements = useEditorStore((state) => state.updateElements);
  const deleteElements = useEditorStore((state) => state.deleteElements);
  const reorderLayer = useEditorStore((state) => state.reorderLayer);
  const alignElements = useEditorStore((state) => state.alignElements);
  const distributeElements = useEditorStore((state) => state.distributeElements);
  const groupElements = useEditorStore((state) => state.groupElements);
  const ungroupElement = useEditorStore((state) => state.ungroupElement);
  const setPage = useEditorStore((state) => state.setPage);
  const showGrid = useEditorStore((state) => state.showGrid);
  const gridSize = useEditorStore((state) => state.gridSize);
  const setGridSize = useEditorStore((state) => state.setGridSize);
  const toggleGrid = useEditorStore((state) => state.toggleGrid);
  const toggleSnap = useEditorStore((state) => state.toggleSnap);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const selected = document.elements.filter((element) => selectedIds.includes(element.id));
  const element = selected[0];

  if (!selected.length) {
    return (
      <aside className="h-full overflow-auto border-l bg-white p-4 text-slate-900">
        <h2 className="text-sm font-semibold">페이지 설정</h2>
        <div className="mt-4 space-y-4">
          <div className="rounded-md border p-3 text-xs text-slate-600">페이지 크기: A4 (210 × 297mm)</div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600">방향</div>
            <div className="grid grid-cols-2 gap-2">
              {(["portrait", "landscape"] as const).map((orientation) => (
                <button key={orientation} className={`h-9 rounded-md border text-xs ${document.page.orientation === orientation ? "border-sky-400 bg-sky-50" : ""}`} onClick={() => setPage({ orientation, width: orientation === "portrait" ? A4_CANVAS.width : A4_CANVAS.height, height: orientation === "portrait" ? A4_CANVAS.height : A4_CANVAS.width })}>
                  {orientation === "portrait" ? "세로" : "가로"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumericField label="위" value={document.page.margins.top} onChange={(top) => setPage({ margins: { ...document.page.margins, top } })} />
            <NumericField label="아래" value={document.page.margins.bottom} onChange={(bottom) => setPage({ margins: { ...document.page.margins, bottom } })} />
            <NumericField label="좌" value={document.page.margins.left} onChange={(left) => setPage({ margins: { ...document.page.margins, left } })} />
            <NumericField label="우" value={document.page.margins.right} onChange={(right) => setPage({ margins: { ...document.page.margins, right } })} />
          </div>
          <ColorPicker label="배경색" value={document.page.backgroundColor} onChange={(backgroundColor) => setPage({ backgroundColor })} />
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>그리드 표시</span>
              <input type="checkbox" checked={showGrid} onChange={toggleGrid} aria-label="그리드 표시" />
            </div>
            <div className="mt-3">
              <NumericField label="크기" value={gridSize} min={4} max={40} onChange={setGridSize} />
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>스냅 활성화</span>
              <input type="checkbox" checked={snapToGrid} onChange={toggleSnap} aria-label="스냅 활성화" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <label><input defaultChecked type="checkbox" /> 그리드</label>
              <label><input defaultChecked type="checkbox" /> 안내선</label>
              <label><input defaultChecked type="checkbox" /> 다른 요소</label>
              <label><input defaultChecked type="checkbox" /> 페이지 경계</label>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (selected.length > 1) {
    return (
      <aside className="h-full overflow-auto border-l bg-white p-4 text-slate-900">
        <h2 className="text-sm font-semibold">{selected.length}개 요소 선택됨</h2>
        <InspectorSection title="정렬">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["left", <ArrowLeft key="left" className="h-4 w-4" />],
              ["center", <AlignCenter key="center" className="h-4 w-4" />],
              ["right", <ArrowRight key="right" className="h-4 w-4" />],
              ["top", <ArrowUp key="top" className="h-4 w-4" />],
              ["middle", <AlignJustify key="middle" className="h-4 w-4" />],
              ["bottom", <ArrowDown key="bottom" className="h-4 w-4" />],
            ].map(([alignment, icon]) => <Button key={String(alignment)} variant="outline" size="sm" onClick={() => alignElements(selectedIds, alignment as Alignment)}>{icon}</Button>)}
          </div>
        </InspectorSection>
        <InspectorSection title="간격 맞추기">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => distributeElements(selectedIds, "horizontal")}><AlignHorizontalDistributeCenter className="h-4 w-4" />가로</Button>
            <Button variant="outline" size="sm" onClick={() => distributeElements(selectedIds, "vertical")}><AlignVerticalDistributeCenter className="h-4 w-4" />세로</Button>
          </div>
        </InspectorSection>
        <InspectorSection title="그룹화">
          <Button className="w-full" variant="outline" onClick={() => groupElements(selectedIds)}><Group className="h-4 w-4" />그룹 만들기</Button>
        </InspectorSection>
        <InspectorSection title="공통 속성">
          <OpacityControl value={selected[0].opacity} onChange={(opacity) => updateElements(selectedIds, { opacity })} />
        </InspectorSection>
      </aside>
    );
  }

  return (
    <aside className="h-full overflow-auto border-l bg-white p-4 text-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="min-w-0 truncate text-sm font-semibold">{element.name}</h2>
        <Button variant="ghost" size="icon" onClick={() => deleteElements([element.id])} aria-label="삭제"><Trash2 className="h-4 w-4 text-red-600" /></Button>
      </div>
      <InspectorSection title="Position & Size">
        <div className="grid grid-cols-2 gap-2">
          <NumericField label="X" value={element.x} onChange={(x) => updateElement(element.id, { x })} />
          <NumericField label="Y" value={element.y} onChange={(y) => updateElement(element.id, { y })} />
          <NumericField label="W" value={element.width} onChange={(width) => updateElement(element.id, { width })} />
          <NumericField label="H" value={element.height} onChange={(height) => updateElement(element.id, { height })} />
        </div>
        <NumericField label="Rotation" value={element.rotation} onChange={(rotation) => updateElement(element.id, { rotation })} />
        <OpacityControl value={element.opacity} onChange={(opacity) => updateElement(element.id, { opacity })} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm"><FlipHorizontal className="h-4 w-4" />가로</Button>
          <Button variant="outline" size="sm"><FlipVertical className="h-4 w-4" />세로</Button>
        </div>
      </InspectorSection>
      <InspectorSection title="Visibility">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={element.visible ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { visible: !element.visible })}>{element.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}보이기</Button>
          <Button variant={element.locked ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { locked: !element.locked })}>{element.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}잠금</Button>
        </div>
      </InspectorSection>
      <InspectorSection title="Layer">
        <div className="grid grid-cols-4 gap-2">
          {[
            ["front", <BringToFront key="f" className="h-4 w-4" />],
            ["forward", <ArrowUp key="u" className="h-4 w-4" />],
            ["backward", <ArrowDown key="d" className="h-4 w-4" />],
            ["back", <SendToBack key="b" className="h-4 w-4" />],
          ].map(([direction, icon]) => <Button key={String(direction)} variant="outline" size="sm" onClick={() => reorderLayer(element.id, direction as LayerDirection)}>{icon}</Button>)}
        </div>
      </InspectorSection>
      {(element.type === "text" || element.type === "dynamic_field" || element.type === "icon") && <TextInspector element={element} />}
      {element.type === "dynamic_field" && <DynamicInspector element={element} />}
      {(element.type === "rect" || element.type === "box" || element.type === "circle" || element.type === "triangle") && <ShapeInspector element={element} />}
      {(element.type === "image" || element.type === "logo") && <ImageInspector element={element} />}
      {(element.type === "line" || element.type === "divider") && <DividerInspector element={element} />}
      {element.type === "table" && <TableInspector element={element} />}
      {element.type === "question_area" && <QuestionAreaInspector element={element} />}
      {element.type === "solution_area" && <SolutionAreaInspector element={element} />}
      {element.type === "answer_table" && <AnswerTableInspector element={element} />}
      {element.type === "group" && <InspectorSection title="그룹"><Button variant="outline" onClick={() => ungroupElement(element.id)}><Ungroup className="h-4 w-4" />그룹 해제</Button></InspectorSection>}
      <Button variant="destructive" className="mt-4 w-full" onClick={() => deleteElements([element.id])}><Trash2 className="h-4 w-4" />삭제</Button>
    </aside>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-md border p-3">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-normal text-slate-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function OpacityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-2 text-xs font-medium text-slate-600">
      Opacity {Math.round(value * 100)}%
      <Slider.Root value={[value * 100]} min={0} max={100} step={1} onValueChange={([next]) => onChange(next / 100)} className="relative flex h-5 touch-none items-center">
        <Slider.Track className="relative h-2 flex-1 rounded bg-slate-200"><Slider.Range className="absolute h-full rounded bg-sky-500" /></Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-full border bg-white shadow" aria-label="투명도" />
      </Slider.Root>
    </label>
  );
}

function TextInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="Typography">
      <textarea className="min-h-20 w-full rounded-md border p-2 text-sm" value={element.text || ""} onChange={(event) => updateElement(element.id, { text: event.target.value, previewValue: undefined })} aria-label="텍스트 내용" />
      <label className="space-y-1 text-xs font-medium text-slate-600">
        Font family
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.fontFamily} onChange={(event) => updateElement(element.id, { fontFamily: event.target.value })}>
          {fontFamilies.map((font) => <option key={font}>{font}</option>)}
        </select>
      </label>
      <NumericField label="Font size" value={element.fontSize || 14} onChange={(fontSize) => updateElement(element.id, { fontSize })} />
      <SliderField label="Line height" min={0.8} max={3} step={0.1} value={element.lineHeight || 1.2} onChange={(lineHeight) => updateElement(element.id, { lineHeight })} />
      <SliderField label="Letter spacing" min={-5} max={20} step={1} value={element.letterSpacing || 0} onChange={(letterSpacing) => updateElement(element.id, { letterSpacing })} />
      <div className="grid grid-cols-4 gap-2">
        <Button variant={element.fontWeight === "bold" ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { fontWeight: element.fontWeight === "bold" ? "normal" : "bold" })}><Bold className="h-4 w-4" /></Button>
        <Button variant={element.fontStyle === "italic" ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { fontStyle: element.fontStyle === "italic" ? "normal" : "italic" })}><Italic className="h-4 w-4" /></Button>
        <Button variant={element.underline ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { underline: !element.underline })}><Underline className="h-4 w-4" /></Button>
        <Button variant={element.linethrough ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { linethrough: !element.linethrough })}>S</Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          ["left", <AlignLeft key="l" className="h-4 w-4" />],
          ["center", <AlignCenter key="c" className="h-4 w-4" />],
          ["right", <AlignRight key="r" className="h-4 w-4" />],
          ["justify", <AlignJustify key="j" className="h-4 w-4" />],
        ].map(([align, icon]) => <Button key={String(align)} variant={element.textAlign === align ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { textAlign: align as CanvasElement["textAlign"] })}>{icon}</Button>)}
      </div>
      <ColorPicker label="글자색" value={element.color || "#111827"} onChange={(color) => updateElement(element.id, { color })} />
      <ColorPicker label="배경색" value={element.backgroundColor || "transparent"} onChange={(backgroundColor) => updateElement(element.id, { backgroundColor })} />
      <SliderField label="모서리 둥글기" min={0} max={50} step={1} value={element.borderRadius || 0} onChange={(borderRadius) => updateElement(element.id, { borderRadius })} />
    </InspectorSection>
  );
}

function DynamicInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="Dynamic Field">
      <label className="space-y-1 text-xs font-medium text-slate-600">
        연결된 필드
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.fieldKey} onChange={(event) => updateElement(element.id, { fieldKey: event.target.value as DynamicFieldKey, text: `{{${tokens.find((token) => token.key === event.target.value)?.label.replace(/[{}]/g, "") || "필드"}}}` })}>
          {tokens.map((token) => <option key={token.key} value={token.key}>{token.label}</option>)}
        </select>
      </label>
      <Input value={element.previewValue || ""} onChange={(event) => updateElement(element.id, { previewValue: event.target.value })} placeholder="Preview value" className="h-8" />
    </InspectorSection>
  );
}

function ShapeInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="Shape">
      <ColorPicker label="채우기" value={element.fill || "#ffffff"} onChange={(fill) => updateElement(element.id, { fill })} />
      <ColorPicker label="테두리" value={element.stroke || "#111827"} onChange={(stroke) => updateElement(element.id, { stroke })} />
      <NumericField label="테두리 두께" value={element.strokeWidth || 0} min={0} max={20} onChange={(strokeWidth) => updateElement(element.id, { strokeWidth })} />
      <label className="space-y-1 text-xs font-medium text-slate-600">
        테두리 스타일
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.strokeStyle} onChange={(event) => updateElement(element.id, { strokeStyle: event.target.value as CanvasElement["strokeStyle"] })}>
          <option value="none">none</option>
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
          <option value="double">double</option>
        </select>
      </label>
      {(element.type === "rect" || element.type === "box") && (
        <CornerRadiusControl element={element} onChange={(borderRadius) => updateElement(element.id, { borderRadius })} />
      )}
    </InspectorSection>
  );
}

function ImageInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="Image / Logo">
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded border bg-slate-50">
          {element.src ? <img src={element.src} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-xs hover:bg-slate-50">
          이미지 교체
          <input className="hidden" type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => updateElement(element.id, { src: String(reader.result) });
            reader.readAsDataURL(file);
          }} />
        </label>
      </div>
      <SliderField label="Border radius" min={0} max={80} step={1} value={element.borderRadius || 0} onChange={(borderRadius) => updateElement(element.id, { borderRadius })} />
      <label className="space-y-1 text-xs font-medium text-slate-600">
        오브젝트 맞춤
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.objectFit || "contain"} onChange={(event) => updateElement(element.id, { objectFit: event.target.value as CanvasElement["objectFit"] })}>
          <option value="cover">채우기</option>
          <option value="contain">맞추기</option>
          <option value="fill">늘리기</option>
        </select>
      </label>
    </InspectorSection>
  );
}

function DividerInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="Divider">
      <ColorPicker label="색상" value={element.stroke || "#111827"} onChange={(stroke) => updateElement(element.id, { stroke })} />
      <SliderField label="두께" min={1} max={12} step={1} value={element.strokeWidth || 1} onChange={(strokeWidth) => updateElement(element.id, { strokeWidth })} />
      <label className="space-y-1 text-xs font-medium text-slate-600">
        스타일
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.strokeStyle || "solid"} onChange={(event) => updateElement(element.id, { strokeStyle: event.target.value as CanvasElement["strokeStyle"] })}>
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
          <option value="double">double</option>
        </select>
      </label>
    </InspectorSection>
  );
}

function TableInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="Table">
      <div className="grid grid-cols-2 gap-2">
        <NumericField label="Rows" value={element.rows || 4} min={1} max={20} onChange={(rows) => updateElement(element.id, { rows })} />
        <NumericField label="Columns" value={element.columns || 4} min={1} max={10} onChange={(columns) => updateElement(element.id, { columns })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => updateElement(element.id, { rows: (element.rows || 4) + 1 })}>행 추가</Button>
        <Button variant="outline" size="sm" onClick={() => updateElement(element.id, { columns: (element.columns || 4) + 1 })}>열 추가</Button>
      </div>
      <ColorPicker label="헤더 배경색" value={element.backgroundColor || "#f1f5f9"} onChange={(backgroundColor) => updateElement(element.id, { backgroundColor })} />
    </InspectorSection>
  );
}

function QuestionAreaInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="문항 영역">
      <div className="grid grid-cols-2 gap-2">
        <NumericField label="열 수" value={element.columns || 2} min={1} max={8} onChange={(columns) => updateElement(element.id, { columns: Math.max(1, Math.min(8, Math.round(columns))) })} />
        <NumericField label="행 수" value={element.rows || 2} min={1} max={20} onChange={(rows) => updateElement(element.id, { rows: Math.max(1, Math.min(20, Math.round(rows))) })} />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((rows) => <Button key={rows} variant={(element.rows || 2) === rows ? "secondary" : "outline"} size="sm" onClick={() => updateElement(element.id, { rows })}>{rows}행</Button>)}
      </div>
      <p className="rounded-md border bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
        최대 {(element.columns || 2) * (element.rows || 2)}문항이 이 영역에 배치됩니다.
      </p>
      <NumericField label="열 간격" value={24} onChange={() => undefined} />
      <label className="space-y-1 text-xs font-medium text-slate-600">
        문항 번호 형식
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.questionNumberFormat || "문 {n}."} onChange={(event) => updateElement(element.id, { questionNumberFormat: event.target.value as CanvasElement["questionNumberFormat"] })}>
          <option>문 {`{n}`}.</option>
          <option>{`{n}`}.</option>
          <option>Q{`{n}`}.</option>
          <option>[n]</option>
        </select>
      </label>
      <NumericField label="문항 글자 크기" value={element.questionFontSize || 11} onChange={(questionFontSize) => updateElement(element.id, { questionFontSize })} />
      <ColorPicker label="글자 색" value={element.color || "#111827"} onChange={(color) => updateElement(element.id, { color })} />
    </InspectorSection>
  );
}

function SolutionAreaInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="해설 영역">
      <label className="space-y-1 text-xs font-medium text-slate-600">
        정답 표시
        <select className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={element.answerFormat || "정답: {a}"} onChange={(event) => updateElement(element.id, { answerFormat: event.target.value as CanvasElement["answerFormat"] })}>
          <option>정답: {`{a}`}</option>
          <option>답: {`{a}`}</option>
          <option>▶ {`{a}`}</option>
        </select>
      </label>
      <ColorPicker label="해설 색" value={element.color || "#111827"} onChange={(color) => updateElement(element.id, { color })} />
      <label className="flex items-center justify-between text-xs"><span>핵심 개념 표시</span><input type="checkbox" defaultChecked /></label>
    </InspectorSection>
  );
}

function AnswerTableInspector({ element }: { element: CanvasElement }) {
  const updateElement = useEditorStore((state) => state.updateElement);
  return (
    <InspectorSection title="답안표 영역">
      <NumericField label="한 행의 문항 수" value={element.answersPerRow || 5} min={1} max={20} onChange={(answersPerRow) => updateElement(element.id, { answersPerRow })} />
      <ColorPicker label="헤더 배경색" value={element.backgroundColor || "#f1f5f9"} onChange={(backgroundColor) => updateElement(element.id, { backgroundColor })} />
      <ColorPicker label="테두리 색" value={element.stroke || "#111827"} onChange={(stroke) => updateElement(element.id, { stroke })} />
    </InspectorSection>
  );
}

function SliderField({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-2 text-xs font-medium text-slate-600">
      {label}: {Number(value).toFixed(step < 1 ? 1 : 0)}
      <Slider.Root value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next)} className="relative flex h-5 touch-none items-center">
        <Slider.Track className="relative h-2 flex-1 rounded bg-slate-200"><Slider.Range className="absolute h-full rounded bg-sky-500" /></Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-full border bg-white shadow" aria-label={label} />
      </Slider.Root>
    </label>
  );
}

function CornerRadiusControl({ element, onChange }: { element: Pick<CanvasElement, "width" | "height" | "borderRadius" | "radius">; onChange: (value: number) => void }) {
  const max = maxCornerRadius(element);
  const sliderMax = Math.max(1, max);
  const value = canvasCornerRadius(element);
  const applyRadius = (next: number) => onChange(clamp(Math.round(next), 0, max));
  const presets = [
    { label: "0", value: 0 },
    { label: "8", value: Math.min(8, max) },
    { label: "16", value: Math.min(16, max) },
    { label: "최대", value: max },
  ];

  return (
    <div className="rounded-md border bg-slate-50 p-2">
      <SliderField label="모서리 둥글기" min={0} max={sliderMax} step={1} value={value} onChange={applyRadius} />
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {presets.map((preset) => (
          <Button
            key={`${preset.label}-${preset.value}`}
            type="button"
            variant={value === preset.value ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => applyRadius(preset.value)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function TopToolbar({ onPreview, onSave }: { onPreview: () => void; onSave: () => void }) {
  const templateName = useEditorStore((state) => state.templateName);
  const setTemplateName = useEditorStore((state) => state.setTemplateName);
  const isDirty = useEditorStore((state) => state.isDirty);
  const isSaving = useEditorStore((state) => state.isSaving);

  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between border-b bg-background/85 backdrop-blur-xl px-3 text-foreground shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/templates" aria-label="홈" className="flex h-10 w-10 items-center justify-center rounded-md transition hover:bg-accent">
          <SiteLogoMark className="h-9 w-9 rounded-[9px] p-1" />
        </Link>
        <button type="button" className="rounded-md px-3 py-2 text-lg font-semibold hover:bg-accent">크기 조정</button>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="hidden h-9 w-56 border-transparent bg-accent px-3 text-sm font-semibold placeholder:text-muted-foreground focus-visible:border-ring md:block" aria-label="Template name" />
        {isDirty && <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-label="Unsaved changes" />}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onPreview}>미리보기</Button>
        <Button size="sm" onClick={onSave} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}저장</Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" aria-label="More options" className="hover:bg-accent"><Settings className="h-4 w-4" /></Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="z-[90] min-w-44 rounded-md border bg-card p-1 text-sm shadow-xl">
              <DropdownMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">단축키</DropdownMenu.Item>
              <DropdownMenu.Item className="rounded px-2 py-1.5 outline-none hover:bg-accent">프레젠테이션 모드</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

function UndoIcon() {
  return <Redo2 className="h-4 w-4 rotate-180" />;
}

function EditorStatusBar() {
  const page = useEditorStore((state) => state.canvasJson.page);
  const document = useEditorStore((state) => state.canvasJson);
  const elements = useEditorStore((state) => state.canvasJson.elements);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const zoom = useEditorStore((state) => state.zoom);
  const isDirty = useEditorStore((state) => state.isDirty);
  const pages = getCanvasDocumentPages(document);
  const activeIndex = Math.max(0, pages.findIndex((item) => item.id === document.activePageId));

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t forge-panel px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>페이지 {activeIndex + 1} / {pages.length}</span>
        <span className="h-4 w-px bg-border" />
        <span>A4 {page.orientation === "portrait" ? "세로" : "가로"}</span>
        <span>{page.width} x {page.height}px</span>
      </div>
      <div className="flex items-center gap-3">
        <span>{elements.length}개 요소</span>
        <span>{selectedIds.length ? `${selectedIds.length}개 선택됨` : "선택 없음"}</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span className={isDirty ? "text-orange-600" : "text-emerald-600"}>{isDirty ? "저장 필요" : "저장됨"}</span>
      </div>
    </footer>
  );
}

function PageMiniature({ page, active }: { page: CanvasDocumentPage; active: boolean }) {
  const scaleX = 42 / page.page.width;
  const scaleY = 60 / page.page.height;
  const elements = [...page.elements].sort((a, b) => a.zIndex - b.zIndex).slice(0, 18);
  return (
    <div className={`relative h-[60px] w-[42px] shrink-0 overflow-hidden rounded-sm border bg-white shadow-sm ${active ? "border-primary ring-2 ring-primary/25" : "border-slate-200"}`} style={{ backgroundColor: page.page.backgroundColor }}>
      {elements.map((element) => (
        <div
          key={element.id}
          className="absolute overflow-hidden"
          style={{
            left: element.x * scaleX,
            top: element.y * scaleY,
            width: Math.max(1, element.width * scaleX),
            height: Math.max(1, element.height * scaleY),
            backgroundColor: element.type === "text" || element.type === "dynamic_field" || element.type === "line" || element.type === "divider" ? "transparent" : element.fill || "#e2e8f0",
            borderTop: element.type === "line" || element.type === "divider" ? `1px solid ${element.stroke || "#111827"}` : undefined,
            border: element.type !== "line" && element.type !== "divider" && element.stroke ? `1px solid ${element.stroke}` : undefined,
            borderRadius: element.type === "circle" ? "999px" : canvasCornerRadius(element) ? Math.max(1, canvasCornerRadius(element) * Math.min(scaleX, scaleY)) : 0,
            opacity: element.opacity,
          }}
        />
      ))}
    </div>
  );
}

function TemplatePageStrip() {
  const document = useEditorStore((state) => state.canvasJson);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const addPage = useEditorStore((state) => state.addPage);
  const duplicatePage = useEditorStore((state) => state.duplicatePage);
  const deletePage = useEditorStore((state) => state.deletePage);
  const renamePage = useEditorStore((state) => state.renamePage);
  const pages = getCanvasDocumentPages(document);
  const activePage = pages.find((page) => page.id === document.activePageId) || pages[0];
  const activeIndex = Math.max(0, pages.findIndex((page) => page.id === activePage.id));

  function removeActivePage() {
    if (pages.length <= 1) return;
    if (!window.confirm("현재 페이지를 삭제하시겠습니까?")) return;
    deletePage(activePage.id);
  }

  return (
    <div className="flex h-[116px] shrink-0 items-center gap-3 border-t border-white/10 bg-[#0a0c12] px-3">
      <div className="w-44 shrink-0">
        <div className="text-xs font-semibold text-slate-400">템플릿 페이지</div>
        <div className="mt-1 text-sm font-bold text-white">페이지 {activeIndex + 1} / {pages.length}</div>
        <Input value={activePage.name} onChange={(event) => renamePage(activePage.id, event.target.value)} className="mt-2 h-8 text-xs" aria-label="현재 페이지 이름" />
      </div>

      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-3">
        {pages.map((page, index) => {
          const active = page.id === activePage.id;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => setActivePage(page.id)}
              className={`flex w-32 shrink-0 items-center gap-2 rounded-md border px-2 py-2 text-left transition ${
                active ? "border-primary/70 bg-white/[0.09] shadow-sm" : "border-white/10 bg-white/[0.035] hover:border-white/18 hover:bg-white/[0.06]"
              }`}
            >
              <PageMiniature page={page} active={active} />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-400">{index + 1}</span>
                <span className="block truncate text-xs font-bold text-slate-100">{page.name}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{page.elements.length}개 요소</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button type="button" size="icon" variant="outline" onClick={addPage} aria-label="페이지 추가">
              <Plus className="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Content className="z-[90] rounded bg-slate-950 px-2 py-1 text-xs text-white">페이지 추가</Tooltip.Content></Tooltip.Portal>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button type="button" size="icon" variant="outline" onClick={() => duplicatePage(activePage.id)} aria-label="페이지 복제">
              <Copy className="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Content className="z-[90] rounded bg-slate-950 px-2 py-1 text-xs text-white">페이지 복제</Tooltip.Content></Tooltip.Portal>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button type="button" size="icon" variant="outline" onClick={removeActivePage} disabled={pages.length <= 1} aria-label="페이지 삭제">
              <Trash2 className="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Content className="z-[90] rounded bg-slate-950 px-2 py-1 text-xs text-white">페이지 삭제</Tooltip.Content></Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </div>
  );
}

function PreviewOverlay({ url, loading, onClose }: { url: string | null; loading: boolean; onClose: () => void }) {
  if (!loading && !url) return null;
  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/90 p-6 text-white">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-white/15 bg-slate-900">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
          <div className="font-semibold">미리보기</div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="미리보기 닫기"><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-800">
          {loading ? (
            <div className="m-8 h-[calc(100%-4rem)] animate-pulse rounded-md bg-white/10" />
          ) : (
            <iframe src={url || ""} className="h-full w-full bg-white" title="PDF preview" />
          )}
        </div>
      </div>
    </div>
  );
}

function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50">
      <div className="max-h-[80vh] w-[620px] overflow-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Shortcuts</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {[
            ["Ctrl+Z", "Undo"],
            ["Ctrl+Shift+Z / Ctrl+Y", "Redo"],
            ["Ctrl+C / X / V", "Copy / Cut / Paste"],
            ["Ctrl+D", "Duplicate"],
            ["Delete", "Delete"],
            ["Ctrl+A", "Select all"],
            ["Arrow", "Move 1px"],
            ["Shift+Arrow", "Move 10px"],
            ["Ctrl+0 / Ctrl+1", "Fit / 100%"],
            ["Ctrl+'", "Toggle grid"],
            ["Ctrl+Shift+H", "Toggle rulers"],
            ["Ctrl+S", "Save"],
            ["F11", "Preview"],
          ].map(([key, desc]) => <div key={key} className="flex items-center justify-between rounded-md border p-2"><kbd className="font-mono text-xs">{key}</kbd><span>{desc}</span></div>)}
        </div>
      </div>
    </div>
  );
}

function VisualTemplateEditorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const setDocument = useEditorStore((state) => state.setDocument);
  const document = useEditorStore((state) => state.canvasJson);
  const templateId = useEditorStore((state) => state.templateId);
  const templateName = useEditorStore((state) => state.templateName);
  const isDirty = useEditorStore((state) => state.isDirty);
  const setSaving = useEditorStore((state) => state.setSaving);
  const markSaved = useEditorStore((state) => state.markSaved);
  const addElement = useEditorStore((state) => state.addElement);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const updateElements = useEditorStore((state) => state.updateElements);
  const deleteElements = useEditorStore((state) => state.deleteElements);
  const duplicateElements = useEditorStore((state) => state.duplicateElements);
  const copyToClipboard = useEditorStore((state) => state.copyToClipboard);
  const pasteFromClipboard = useEditorStore((state) => state.pasteFromClipboard);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setZoom = useEditorStore((state) => state.setZoom);
  const toggleGrid = useEditorStore((state) => state.toggleGrid);
  const toggleRulers = useEditorStore((state) => state.toggleRulers);
  const toggleGuides = useEditorStore((state) => state.toggleGuides);
  const [activeDrag, setActiveDrag] = useState<ElementPreset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTemplateId, setExportTemplateId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [mounted, setMounted] = useState(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addClipboardImages = useCallback(
    async (files: File[]) => {
      const validFiles = files.filter((file) => file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024);
      if (!validFiles.length) {
        setNotice("이미지는 10MB 이하만 붙여넣을 수 있습니다.");
        return;
      }

      try {
        const loaded = await Promise.all(validFiles.map(async (file, index) => ({ file, index, src: await readFileAsDataUrl(file) })));
        const page = useEditorStore.getState().canvasJson.page;
        const startX = Math.max(24, Math.round((page.width - 240) / 2));
        const startY = 140;

        loaded.forEach(({ file, index, src }) => {
          const fileName = imageFileDisplayName(file, index);
          addElement(baseElement("image", fileName.replace(/\.[^.]+$/, "") || "이미지", startX + index * 18, startY + index * 18, { src, width: 240, height: 160, objectFit: "contain", fill: "#f8fafc", stroke: "#cbd5e1", strokeWidth: 1 }));
        });
        setNotice(`${loaded.length}개 이미지를 붙여넣었습니다.`);
      } catch {
        setNotice("클립보드 이미지를 읽지 못했습니다.");
      }
    },
    [addElement]
  );

  const writeDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    const state = useEditorStore.getState();
    if (!state.isDirty) return;
    const key = `${draftPrefix}${state.templateId || searchParams.get("starter") || "new"}`;
    localStorage.setItem(key, JSON.stringify({ id: state.templateId, name: state.templateName, canvasJson: state.canvasJson }));
  }, [searchParams]);

  useEffect(() => {
    const id = searchParams.get("id");
    const starter = searchParams.get("starter");
    const blank = searchParams.get("blank");
    const draftKey = `${draftPrefix}${id || starter || "new"}`;
    const draft = typeof window !== "undefined" ? localStorage.getItem(draftKey) : null;
    async function load() {
      if (draft) {
        try {
          const parsed = JSON.parse(draft) as { name: string; id: string | null; canvasJson: CanvasDocument };
          setDocument(parsed.canvasJson, { id: parsed.id, name: parsed.name, dirty: true });
          return;
        } catch {
          localStorage.removeItem(draftKey);
        }
      }
      if (blank) {
        const blankDocument = JSON.parse(JSON.stringify(EMPTY_DOCUMENT)) as CanvasDocument;
        blankDocument.updatedAt = new Date().toISOString();
        setDocument(blankDocument, { id: null, name: "새 시각 템플릿", dirty: false });
        return;
      }
      if (id) {
        const template = await api<ExamTemplate>(`/api/templates/${id}`);
        setDocument(template.canvas_json || legacyTemplateDocument(template), { id: template.id, name: template.name, dirty: false });
        return;
      }
      const selected = getStarterTemplate(starter);
      setDocument(selected.canvasJson, { id: null, name: selected.name, dirty: false });
    }
    load().catch((error) => {
      console.error(error);
      setNotice("템플릿을 불러오지 못했습니다.");
    });
  }, [searchParams, setDocument]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      writeDraft();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [writeDraft]);

  useEffect(() => {
    const persistQuietly = () => writeDraft();
    const onVisibilityChange = () => {
      if (window.document.visibilityState === "hidden") persistQuietly();
    };
    window.addEventListener("pagehide", persistQuietly);
    window.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", persistQuietly);
      window.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [writeDraft]);

  const save = useCallback(async (): Promise<ExamTemplate | null> => {
    if (saveInFlight.current) return null;
    saveInFlight.current = true;
    try {
      setSaving(true);
      const allElements = getCanvasDocumentPages(document).flatMap((page) => page.elements);
      const questionArea = allElements.find((element) => element.type === "question_area");
      const questionAreaCapacity = questionArea ? Math.max(1, questionArea.columns || 1) * Math.max(1, questionArea.rows || 1) : 2;
      const result = await saveVisualTemplate({
        id: templateId,
        name: templateName,
        canvas_json: document,
        academy_name: allElements.find((element) => element.type === "dynamic_field" && element.fieldKey === "academy_name")?.previewValue || null,
        font_size: questionArea?.questionFontSize || 11,
        problems_per_page: questionAreaCapacity,
        include_solution: allElements.some((element) => element.type === "solution_area"),
      });
      localStorage.removeItem(`${draftPrefix}${templateId || searchParams.get("starter") || "new"}`);
      markSaved(result.id);
      setNotice("템플릿이 저장되었습니다");
      if (!templateId) router.replace(`/templates/editor?id=${result.id}`);
      return result;
    } catch (error) {
      setSaving(false);
      setNotice(error instanceof Error ? error.message : "저장에 실패했습니다.");
      return null;
    } finally {
      saveInFlight.current = false;
    }
  }, [document, markSaved, router, searchParams, setSaving, templateId, templateName]);

  useEffect(() => {
    if (!isDirty) return;
    writeDraft();
    const timeout = window.setTimeout(() => {
      if (!useEditorStore.getState().isDirty) return;
      save().then((result) => {
        if (result) setNotice("자동 저장되었습니다");
      });
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [document, isDirty, save, templateName, writeDraft]);

  const saveCopy = useCallback(async (): Promise<ExamTemplate | null> => {
    try {
      setSaving(true);
      const allElements = getCanvasDocumentPages(document).flatMap((page) => page.elements);
      const questionArea = allElements.find((element) => element.type === "question_area");
      const questionAreaCapacity = questionArea ? Math.max(1, questionArea.columns || 1) * Math.max(1, questionArea.rows || 1) : 2;
      const result = await saveVisualTemplate({
        id: null,
        name: `${templateName} (복사본)`,
        canvas_json: document,
        academy_name: allElements.find((element) => element.type === "dynamic_field" && element.fieldKey === "academy_name")?.previewValue || null,
        font_size: questionArea?.questionFontSize || 11,
        problems_per_page: questionAreaCapacity,
        include_solution: allElements.some((element) => element.type === "solution_area"),
      });
      localStorage.removeItem(`${draftPrefix}${templateId || searchParams.get("starter") || "new"}`);
      markSaved(result.id);
      setNotice("사본이 저장되었습니다");
      router.replace(`/templates/editor?id=${result.id}`);
      return result;
    } catch (error) {
      setSaving(false);
      setNotice(error instanceof Error ? error.message : "사본 저장에 실패했습니다.");
      return null;
    }
  }, [document, markSaved, router, searchParams, setSaving, templateId, templateName]);

  const openExport = useCallback(async () => {
    let id = useEditorStore.getState().templateId;
    if (!id || useEditorStore.getState().isDirty) {
      const saved = await save();
      id = saved?.id || useEditorStore.getState().templateId;
    }
    if (!id) {
      setNotice("먼저 템플릿을 저장해 주세요.");
      return;
    }
    setExportTemplateId(id);
    setExportOpen(true);
  }, [save]);

  const preview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const blob = await previewCanvasExport(document);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "미리보기에 실패했습니다.");
    } finally {
      setPreviewLoading(false);
    }
  }, [document]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (isEditableClipboardTarget(event.target)) return;

      const imageFiles = getClipboardImageFiles(event.clipboardData);
      if (imageFiles.length) {
        event.preventDefault();
        void addClipboardImages(imageFiles);
        return;
      }

      if (useEditorStore.getState().clipboard.length) {
        event.preventDefault();
        pasteFromClipboard();
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addClipboardImages, pasteFromClipboard]);

  useEffect(() => {
    hotkeys("ctrl+s,command+s", (event) => { event.preventDefault(); save(); });
    hotkeys("ctrl+z,command+z", (event) => { event.preventDefault(); undo(); });
    hotkeys("ctrl+shift+z,ctrl+y,command+shift+z,command+y", (event) => { event.preventDefault(); redo(); });
    hotkeys("ctrl+c,command+c", (event) => { event.preventDefault(); copyToClipboard(); });
    hotkeys("ctrl+d,command+d", (event) => { event.preventDefault(); duplicateElements(selectedIds); });
    hotkeys("delete,backspace", (event) => { if (selectedIds.length) { event.preventDefault(); deleteElements(selectedIds); } });
    hotkeys("esc", () => clearSelection());
    hotkeys("ctrl+a,command+a", (event) => { event.preventDefault(); useEditorStore.getState().setSelection(useEditorStore.getState().canvasJson.elements.map((element) => element.id)); });
    hotkeys("up,down,left,right,shift+up,shift+down,shift+left,shift+right", (event, handler) => {
      if (!selectedIds.length) return;
      event.preventDefault();
      const amount = handler.shortcut?.startsWith("shift+") ? 10 : 1;
      const dx = handler.key === "left" ? -amount : handler.key === "right" ? amount : 0;
      const dy = handler.key === "up" ? -amount : handler.key === "down" ? amount : 0;
      const elements = useEditorStore.getState().canvasJson.elements.filter((element) => selectedIds.includes(element.id));
      elements.forEach((element) => useEditorStore.getState().updateElement(element.id, { x: element.x + dx, y: element.y + dy }));
    });
    hotkeys("ctrl+0,command+0", (event) => { event.preventDefault(); setZoom(0.72); });
    hotkeys("ctrl+1,command+1", (event) => { event.preventDefault(); setZoom(1); });
    hotkeys("ctrl+=,command+=,ctrl+plus,command+plus", (event) => { event.preventDefault(); setZoom(useEditorStore.getState().zoom + 0.1); });
    hotkeys("ctrl+-,command+-", (event) => { event.preventDefault(); setZoom(useEditorStore.getState().zoom - 0.1); });
    hotkeys("ctrl+shift+h,command+shift+h", (event) => { event.preventDefault(); toggleRulers(); });
    hotkeys("ctrl+shift+;,command+shift+;", (event) => { event.preventDefault(); toggleGuides(); });
    hotkeys("ctrl+',command+'", (event) => { event.preventDefault(); toggleGrid(); });
    hotkeys("?", () => setShortcutsOpen(true));
    hotkeys("f11", (event) => { event.preventDefault(); preview(); });
    return () => hotkeys.unbind();
  }, [clearSelection, copyToClipboard, deleteElements, duplicateElements, preview, redo, save, selectedIds, setZoom, toggleGrid, toggleGuides, toggleRulers, undo]);

  function onDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current?.preset as ElementPreset | null);
  }

  function onDragEnd(event: DragEndEvent) {
    const preset = event.active.data.current?.preset as ElementPreset | undefined;
    setActiveDrag(null);
    if (!preset) {
      const overId = event.over?.id ? String(event.over.id) : null;
      const activeId = String(event.active.id);
      if (!overId || activeId === overId) return;
      const state = useEditorStore.getState();
      const sorted = [...state.canvasJson.elements].sort((a, b) => b.zIndex - a.zIndex);
      const from = sorted.findIndex((element) => element.id === activeId);
      const to = sorted.findIndex((element) => element.id === overId);
      if (from < 0 || to < 0) return;
      const [moved] = sorted.splice(from, 1);
      sorted.splice(to, 0, moved);
      const next = {
        ...state.canvasJson,
        elements: sorted.map((element, index) => ({ ...element, zIndex: sorted.length - index - 1 })),
        updatedAt: new Date().toISOString(),
      };
      state.setDocument(next, { id: state.templateId, name: state.templateName, dirty: true });
      return;
    }
    const target = window.document.querySelector("[data-canvas-drop='true']") as HTMLElement | null;
    const page = target?.parentElement;
    if (!page) return;
    const rect = page.getBoundingClientRect();
    const activeRect = event.active.rect.current.translated || event.active.rect.current.initial;
    const dropX = activeRect ? (activeRect.left + activeRect.width / 2 - rect.left) / useEditorStore.getState().zoom : 120;
    const dropY = activeRect ? (activeRect.top + activeRect.height / 2 - rect.top) / useEditorStore.getState().zoom : 120;
    const palettePreset = preset as ElementPreset & { defaultWidth?: number; defaultHeight?: number; section?: string };
    const elementX = palettePreset.section === "lines" ? 0 : Math.max(0, dropX - (palettePreset.defaultWidth || 0) / 2);
    const elementY = Math.max(0, dropY - (palettePreset.defaultHeight || 0) / 2);
    const element = preset.create(elementX, elementY);
    addElement(element);
    rememberElementUse(preset.id, preset.label, element);
  }

  if (!mounted) {
    return <div className="fixed inset-0 z-[80] flex items-center justify-center text-sm text-slate-400" style={{ background: "radial-gradient(circle at 8% 0%, hsl(263 88% 58% / 0.20), transparent 28rem), linear-gradient(180deg, hsl(224 28% 7%), hsl(224 34% 3%))" }}>Opening editor...</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Tooltip.Provider delayDuration={250}>
        <div className="fixed inset-0 z-[80] flex min-h-0 w-full flex-col overflow-hidden text-slate-100" style={{ background: "radial-gradient(circle at 8% 0%, hsl(263 88% 58% / 0.20), transparent 28rem), radial-gradient(circle at 86% 12%, hsl(250 72% 42% / 0.12), transparent 26rem), linear-gradient(180deg, hsl(224 28% 7%), hsl(224 34% 3%))" }}>
          <TopToolbar onPreview={preview} onSave={save} />
          <main className="flex min-h-0 flex-1">
            <CanvaLeftPanel onNotice={setNotice} onSave={save} onSaveCopy={saveCopy} onPreview={preview} onOpenExport={openExport} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <CanvasWorkspace />
              </div>
              <TemplatePageStrip />
            </div>
          </main>
          <EditorStatusBar />
          {notice && <div className="fixed bottom-14 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-sm text-white shadow-xl">{notice}</div>}
          <PreviewOverlay url={previewUrl} loading={previewLoading} onClose={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewLoading(false); }} />
          <ExportModal open={exportOpen} onOpenChange={setExportOpen} source="selection" problemIds={[]} count={0} initialTemplateId={exportTemplateId || templateId} hideTemplateSelection />
          <ShortcutHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div>
      </Tooltip.Provider>
      <DragOverlay>{activeDrag ? <div className="rounded-md border border-white/10 bg-[#0b0d13] px-3 py-2 text-sm font-semibold text-white shadow-xl">{activeDrag.label}</div> : null}</DragOverlay>
    </DndContext>
  );
}

export default function VisualTemplateEditorPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-slate-400" style={{ background: "radial-gradient(circle at 8% 0%, hsl(263 88% 58% / 0.20), transparent 28rem), linear-gradient(180deg, hsl(224 28% 7%), hsl(224 34% 3%))" }}>Opening editor...</div>}>
      <VisualTemplateEditorPageInner />
    </Suspense>
  );
}
