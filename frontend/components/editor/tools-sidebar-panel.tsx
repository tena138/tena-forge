"use client";

import { ChangeEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Circle,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  Grid3X3,
  History,
  MousePointer2,
  PenLine,
  Ruler,
  RotateCcw,
  RotateCw,
  Slash,
  Square,
  Triangle,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/editor/color-picker";
import { CanvasElement, DrawingTool } from "@/lib/editorTypes";
import { useEditorStore } from "@/store/editorStore";

type AlignMode = "selection" | "page";
type ToggleRow = {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
};

const drawingTools: Array<{ key: DrawingTool; label: string; icon: ReactNode }> = [
  { key: "pen", label: "펜", icon: <PenLine className="h-4 w-4" /> },
  { key: "line", label: "직선", icon: <Slash className="h-4 w-4" /> },
  { key: "rect", label: "사각형", icon: <Square className="h-4 w-4" /> },
  { key: "circle", label: "원", icon: <Circle className="h-4 w-4" /> },
  { key: "triangle", label: "삼각형", icon: <Triangle className="h-4 w-4" /> },
  { key: "arrow", label: "화살표", icon: <ArrowUp className="h-4 w-4 rotate-45" /> },
];

function bounds(elements: CanvasElement[]) {
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const maxY = Math.max(...elements.map((element) => element.y + element.height));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("ko-KR", { hour12: false });
}

function actionIcon(name: string) {
  if (name.includes("텍스트")) return "✏";
  if (name.includes("이동") || name.includes("정렬") || name.includes("배분")) return "↔";
  if (name.includes("색상") || name.includes("페이지")) return "🎨";
  if (name.includes("삭제")) return "⌫";
  if (name.includes("그리기")) return "✎";
  return "•";
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

export function ToolsSidebarPanel() {
  const document = useEditorStore((state) => state.canvasJson);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const activeDrawingTool = useEditorStore((state) => state.activeDrawingTool);
  const setDrawingTool = useEditorStore((state) => state.setDrawingTool);
  const penStrokeWidth = useEditorStore((state) => state.penStrokeWidth);
  const penColor = useEditorStore((state) => state.penColor);
  const penSmooth = useEditorStore((state) => state.penSmooth);
  const setPenOptions = useEditorStore((state) => state.setPenOptions);
  const showRulers = useEditorStore((state) => state.showRulers);
  const showGuides = useEditorStore((state) => state.showGuides);
  const showGrid = useEditorStore((state) => state.showGrid);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const gridSize = useEditorStore((state) => state.gridSize);
  const toggleRulers = useEditorStore((state) => state.toggleRulers);
  const toggleGuides = useEditorStore((state) => state.toggleGuides);
  const toggleGrid = useEditorStore((state) => state.toggleGrid);
  const toggleSnap = useEditorStore((state) => state.toggleSnap);
  const setGridSize = useEditorStore((state) => state.setGridSize);
  const clearGuides = useEditorStore((state) => state.clearGuides);
  const replaceElements = useEditorStore((state) => state.replaceElements);
  const updateElements = useEditorStore((state) => state.updateElements);
  const setPage = useEditorStore((state) => state.setPage);
  const history = useEditorStore((state) => state.actionHistory);
  const historyIndex = useEditorStore((state) => state.historyIndex);
  const jumpToHistory = useEditorStore((state) => state.jumpToHistory);
  const [alignMode, setAlignMode] = useState<AlignMode>("selection");
  const [historyOpen, setHistoryOpen] = useState(true);

  const selected = useMemo(() => document.elements.filter((element) => selectedIds.includes(element.id)), [document.elements, selectedIds]);
  const hasSelection = selected.length > 0;

  function commit(nextSelected: CanvasElement[], action: string) {
    const replacements = new Map(nextSelected.map((element) => [element.id, element]));
    replaceElements(document.elements.map((element) => replacements.get(element.id) || element), action, selectedIds);
  }

  function align(horizontal: "left" | "center" | "right", vertical: "top" | "middle" | "bottom") {
    if (!selected.length) return;
    const area = alignMode === "page" ? { minX: 0, minY: 0, maxX: document.page.width, maxY: document.page.height, width: document.page.width, height: document.page.height } : bounds(selected);
    commit(
      selected.map((element) => {
        const x = horizontal === "left" ? area.minX : horizontal === "center" ? area.minX + (area.width - element.width) / 2 : area.maxX - element.width;
        const y = vertical === "top" ? area.minY : vertical === "middle" ? area.minY + (area.height - element.height) / 2 : area.maxY - element.height;
        return { ...element, x: Math.round(x), y: Math.round(y) };
      }),
      "요소 정렬"
    );
  }

  function distribute(axis: "horizontal" | "vertical") {
    if (selected.length < 3) return;
    const sorted = [...selected].sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span = axis === "horizontal" ? last.x - first.x : last.y - first.y;
    const step = span / (sorted.length - 1);
    commit(sorted.map((element, index) => axis === "horizontal" ? { ...element, x: Math.round(first.x + step * index) } : { ...element, y: Math.round(first.y + step * index) }), "간격 배분");
  }

  function matchSize(kind: "width" | "height" | "both") {
    if (selected.length < 2) return;
    const maxWidth = Math.max(...selected.map((element) => element.width));
    const maxHeight = Math.max(...selected.map((element) => element.height));
    commit(selected.map((element) => ({ ...element, width: kind !== "height" ? maxWidth : element.width, height: kind !== "width" ? maxHeight : element.height })), "크기 맞추기");
  }

  function rotate(delta: number) {
    if (!selected.length) return;
    updateElements(selectedIds, { rotation: ((selected[0].rotation || 0) + delta + 360) % 360 });
  }

  function updateMargins(side: "top" | "bottom" | "left" | "right", value: number) {
    const margins = document.page.margins;
    const next = margins.linked ? { ...margins, top: value, bottom: value, left: value, right: value } : { ...margins, [side]: value };
    setPage({ margins: next });
  }

  async function setBackgroundImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readImage(file);
    setPage({ backgroundImage: dataUrl });
    event.target.value = "";
  }

  const recentHistory = history.slice(Math.max(0, history.length - 20)).map((entry, offset) => ({
    entry,
    index: Math.max(0, history.length - 20) + offset,
  })).reverse();
  const toggleRows: ToggleRow[] = [
    { label: "눈금자 표시", active: showRulers, onClick: toggleRulers, icon: <Ruler className="h-4 w-4" /> },
    { label: "안내선 표시", active: showGuides, onClick: toggleGuides, icon: <MousePointer2 className="h-4 w-4" /> },
    { label: "그리드 표시", active: showGrid, onClick: toggleGrid, icon: <Grid3X3 className="h-4 w-4" /> },
    { label: "스냅", active: snapToGrid, onClick: toggleSnap, icon: <MousePointer2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">그리기 도구</h3>
        <div className="grid grid-cols-2 gap-2">
          {drawingTools.map((tool) => (
            <button key={tool.key} type="button" onClick={() => setDrawingTool(activeDrawingTool === tool.key ? "select" : tool.key)} className={`flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${activeDrawingTool === tool.key ? "border-zinc-600 bg-zinc-600 text-white" : "bg-white text-slate-700 hover:border-zinc-300 hover:bg-zinc-50"}`}>
              {tool.icon}
              {tool.label}
            </button>
          ))}
        </div>
        {activeDrawingTool === "pen" && (
          <div className="mt-3 rounded-md border bg-white p-3">
            <label className="space-y-2 text-xs font-semibold text-slate-600">
              선 굵기: {penStrokeWidth}px
              <input type="range" min={1} max={20} value={penStrokeWidth} onChange={(event) => setPenOptions({ penStrokeWidth: Number(event.target.value) })} className="w-full" />
            </label>
            <div className="mt-3">
              <ColorPicker label="선 색상" value={penColor} onChange={(penColor) => setPenOptions({ penColor })} />
            </div>
            <label className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-600">
              부드럽게
              <input type="checkbox" checked={penSmooth} onChange={(event) => setPenOptions({ penSmooth: event.target.checked })} />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-600">측정 도구</h3>
        {toggleRows.map((row) => (
          <Button key={row.label} type="button" variant={row.active ? "secondary" : "outline"} className="w-full justify-start" onClick={row.onClick}>{row.icon}{row.label}</Button>
        ))}
        <div className="grid grid-cols-3 gap-1">
          {[5, 10, 20].map((size) => <button key={size} type="button" onClick={() => setGridSize(size)} className={`h-8 rounded-md text-xs font-semibold ${gridSize === size ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{size}px</button>)}
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={clearGuides}><Eraser className="h-4 w-4" />안내선 모두 삭제</Button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">선택한 요소 정렬</h3>
        <div className="grid grid-cols-2 gap-1">
          {(["selection", "page"] as const).map((mode) => <button key={mode} type="button" onClick={() => setAlignMode(mode)} className={`h-8 rounded-md text-xs font-semibold ${alignMode === mode ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{mode === "selection" ? "선택 영역 기준" : "페이지 기준"}</button>)}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {[
            ["↖", "left", "top"], ["↑", "center", "top"], ["↗", "right", "top"],
            ["←", "left", "middle"], ["⊕", "center", "middle"], ["→", "right", "middle"],
            ["↙", "left", "bottom"], ["↓", "center", "bottom"], ["↘", "right", "bottom"],
          ].map(([label, horizontal, vertical]) => <button key={label} disabled={!hasSelection} type="button" onClick={() => align(horizontal as "left" | "center" | "right", vertical as "top" | "middle" | "bottom")} className="h-9 rounded border bg-white text-sm font-semibold disabled:opacity-40">{label}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 3} onClick={() => distribute("horizontal")}><AlignHorizontalDistributeCenter className="h-4 w-4" />가로 균등</Button>
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 3} onClick={() => distribute("vertical")}><AlignVerticalDistributeCenter className="h-4 w-4" />세로 균등</Button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 2} onClick={() => matchSize("width")}>너비 통일</Button>
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 2} onClick={() => matchSize("height")}>높이 통일</Button>
          <Button type="button" variant="outline" size="sm" disabled={selected.length < 2} onClick={() => matchSize("both")}>크기 통일</Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-slate-600">변형 도구</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!hasSelection} onClick={() => updateElements(selectedIds, { flipX: !selected[0]?.flipX })}><FlipHorizontal className="h-4 w-4" />좌우 반전</Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasSelection} onClick={() => updateElements(selectedIds, { flipY: !selected[0]?.flipY })}><FlipVertical className="h-4 w-4" />상하 반전</Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasSelection} onClick={() => rotate(90)}><RotateCw className="h-4 w-4" />90° 회전</Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasSelection} onClick={() => rotate(-90)}><RotateCcw className="h-4 w-4" />-90° 회전</Button>
        </div>
        <Button type="button" variant="outline" className="w-full" disabled={!hasSelection} onClick={() => updateElements(selectedIds, { width: 220, height: 150, rotation: 0, flipX: false, flipY: false })}>원본 크기로</Button>
        <div className="grid grid-cols-4 gap-1">
          {[25, 50, 75, 100].map((opacity) => <button key={opacity} type="button" disabled={!hasSelection} onClick={() => updateElements(selectedIds, { opacity: opacity / 100 })} className="h-8 rounded-md bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">{opacity}%</button>)}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold text-slate-600">페이지 도구</h3>
        <ColorPicker label="배경색" value={document.page.backgroundColor} onChange={(backgroundColor) => setPage({ backgroundColor })} />
        <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white text-sm font-semibold hover:bg-slate-50">
          <UploadCloud className="h-4 w-4" /> 배경 이미지
          <input type="file" accept="image/*" className="hidden" onChange={setBackgroundImage} />
        </label>
        <div className="grid grid-cols-3 gap-1">
          {[
            ["cover", "채우기"], ["contain", "맞추기"], ["tile", "바둑판"],
          ].map(([fit, label]) => <button key={fit} type="button" onClick={() => setPage({ backgroundFit: fit as typeof document.page.backgroundFit })} className={`h-8 rounded-md text-xs font-semibold ${document.page.backgroundFit === fit ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{label}</button>)}
        </div>
        <label className="space-y-1 text-xs font-semibold text-slate-600">
          배경 불투명도 {Math.round((document.page.backgroundOpacity ?? 0.25) * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={document.page.backgroundOpacity ?? 0.25} onChange={(event) => setPage({ backgroundOpacity: Number(event.target.value) })} className="w-full" />
        </label>
        <Button type="button" variant="outline" className="w-full" onClick={() => setPage({ backgroundImage: null })}>배경 제거</Button>
        <div className="grid grid-cols-2 gap-2">
          {(["top", "bottom", "left", "right"] as const).map((side) => <label key={side} className="text-xs font-semibold text-slate-600">{side}<Input type="number" value={document.page.margins[side]} onChange={(event) => updateMargins(side, Number(event.target.value))} className="mt-1 h-8" /></label>)}
        </div>
        <label className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>여백 연결</span><input type="checkbox" checked={Boolean(document.page.margins.linked)} onChange={(event) => setPage({ margins: { ...document.page.margins, linked: event.target.checked } })} /></label>
        <label className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>여백 안내선 표시</span><input type="checkbox" checked={Boolean(document.page.showMarginGuides)} onChange={(event) => setPage({ showMarginGuides: event.target.checked })} /></label>
      </section>

      <section className="rounded-md border bg-white">
        <button type="button" onClick={() => setHistoryOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-slate-600">
          <span className="flex items-center gap-2"><History className="h-4 w-4" />작업 히스토리</span>
          <ChevronDown className={`h-4 w-4 transition ${historyOpen ? "" : "-rotate-90"}`} />
        </button>
        {historyOpen && (
          <div className="max-h-56 overflow-y-auto border-t p-1">
            {recentHistory.map(({ entry, index }) => (
              <button key={entry.id} type="button" onClick={() => jumpToHistory(index)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${historyIndex === index ? "bg-zinc-50 text-zinc-900" : "hover:bg-slate-50"}`}>
                <span className="w-5 text-center">{actionIcon(entry.name)}</span>
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="font-mono text-[10px] text-slate-500">{timeLabel(entry.timestamp)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
