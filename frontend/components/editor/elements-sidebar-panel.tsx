"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";

import { Input } from "@/components/ui/input";
import {
  allElementPresets,
  cloneRecentElement,
  ElementPalettePreset,
  ElementPaletteSection,
  iconPalettePresets,
  iconSizes,
  IconSizeKey,
  readPrimaryColor,
  readRecentElements,
  RecentElementEntry,
  RECENT_ELEMENTS_CHANGED_EVENT,
  rememberElementUse,
} from "@/lib/elementPresets";
import { CanvasDocument, CanvasElement } from "@/lib/editorTypes";
import { useEditorStore } from "@/store/editorStore";

const COLLAPSE_KEY = "tena-forge-editor-elements-collapse";
const COLOR_CHANGED_EVENT = "tena-forge-editor-recent-colors-changed";

type CollapsedState = Record<ElementPaletteSection, boolean>;

const defaultCollapsed: CollapsedState = {
  basicShapes: false,
  lines: false,
  boxes: false,
  exam: false,
  icons: false,
};

const sectionLabels: Record<ElementPaletteSection, string> = {
  basicShapes: "기본 도형",
  lines: "선 & 구분선",
  boxes: "박스 & 컨테이너",
  exam: "시험지 전용 요소",
  icons: "아이콘",
};

function readCollapsed() {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    return { ...defaultCollapsed, ...JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}") } as CollapsedState;
  } catch {
    return defaultCollapsed;
  }
}

function saveCollapsed(value: CollapsedState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(value));
}

function SvgIcon({ iconKey, className = "h-7 w-7", color = "currentColor" }: { iconKey: string; className?: string; color?: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (iconKey === "rect") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="12" y="14" width="40" height="36" fill="#e2e8f0" stroke="none" /></svg>;
  if (iconKey === "circle") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><circle cx="32" cy="32" r="20" fill="#e2e8f0" /></svg>;
  if (iconKey === "triangle") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M32 10 54 52H10Z" fill="#e2e8f0" /></svg>;
  if (iconKey === "roundedRect") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="11" y="14" width="42" height="36" rx="10" fill="#e2e8f0" /></svg>;
  if (iconKey === "star") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="m32 7 7 17h18L43 36l5 19-16-10-16 10 5-19L7 24h18z" fill="#e2e8f0" /></svg>;
  if (iconKey === "arrow") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M7 25h31V14l19 18-19 18V39H7z" fill="#e2e8f0" /></svg>;

  if (iconKey === "solidLine") return <svg viewBox="0 0 72 24" className={className} aria-hidden="true"><path d="M6 12h60" {...common} /></svg>;
  if (iconKey === "dashedLine") return <svg viewBox="0 0 72 24" className={className} aria-hidden="true"><path d="M6 12h60" {...common} strokeDasharray="10 8" /></svg>;
  if (iconKey === "dottedLine") return <svg viewBox="0 0 72 24" className={className} aria-hidden="true"><path d="M6 12h60" {...common} strokeDasharray="2 8" /></svg>;
  if (iconKey === "doubleLine") return <svg viewBox="0 0 72 24" className={className} aria-hidden="true"><path d="M6 8h60M6 16h60" {...common} strokeWidth={3} /></svg>;
  if (iconKey === "wavyLine") return <svg viewBox="0 0 72 24" className={className} aria-hidden="true"><path d="M5 12q8-12 16 0t16 0 16 0 16 0" {...common} strokeWidth={3} /></svg>;
  if (iconKey === "arrowLine") return <svg viewBox="0 0 72 24" className={className} aria-hidden="true"><path d="M5 12h56m0 0-10-7m10 7-10 7" {...common} strokeWidth={3} /></svg>;

  if (iconKey === "emptyBox") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="10" y="14" width="44" height="36" rx="2" {...common} strokeWidth={3} /></svg>;
  if (iconKey === "filledBox") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="10" y="14" width="44" height="36" rx="2" fill="#e2e8f0" /></svg>;
  if (iconKey === "shadowBox") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="16" y="20" width="40" height="34" rx="3" fill="#cbd5e1" /><rect x="9" y="11" width="40" height="34" rx="3" fill="#fff" stroke={color} strokeWidth="3" /></svg>;
  if (iconKey === "roundedBox") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="10" y="14" width="44" height="36" rx="12" {...common} strokeWidth={3} /></svg>;
  if (iconKey === "dashedBox") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="10" y="14" width="44" height="36" rx="2" {...common} strokeDasharray="6 5" strokeWidth={3} /></svg>;
  if (iconKey === "speechBox") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M10 12h44v30H28L17 53V42h-7z" {...common} strokeWidth={3} /></svg>;

  if (iconKey === "answerBlank") return <svg viewBox="0 0 80 40" className={className} aria-hidden="true"><path d="M8 28h64" {...common} strokeWidth={3} /><path d="M8 18h14" {...common} strokeWidth={3} /></svg>;
  if (iconKey === "scoreBox") return <svg viewBox="0 0 80 40" className={className} aria-hidden="true"><rect x="8" y="8" width="64" height="24" rx="2" {...common} strokeWidth={3} /><path d="M18 21h18m8 0h16" {...common} strokeWidth={3} /></svg>;
  if (iconKey === "numberBoxes") return <svg viewBox="0 0 88 32" className={className} aria-hidden="true">{Array.from({ length: 8 }).map((_, index) => <rect key={index} x={2 + index * 10.5} y="7" width="9" height="18" fill="none" stroke={color} strokeWidth="1.7" />)}</svg>;
  if (iconKey === "scissorsLine") return <svg viewBox="0 0 96 32" className={className} aria-hidden="true"><text x="4" y="22" fontSize="18" fill={color}>✂</text><path d="M28 16h62" {...common} strokeDasharray="6 5" strokeWidth={2.5} /></svg>;
  if (iconKey === "pageDivider") return <svg viewBox="0 0 96 28" className={className} aria-hidden="true"><path d="M4 14h32m12-10 10 10-10 10-10-10zm12 10h32" {...common} strokeWidth={2.5} /></svg>;
  if (iconKey === "scoringTable") return <svg viewBox="0 0 80 52" className={className} aria-hidden="true"><rect x="8" y="7" width="64" height="38" fill="none" stroke={color} strokeWidth="2.5" /><path d="M8 17h64M8 26h64M8 35h64M29 7v38M51 7v38" stroke={color} strokeWidth="1.7" /></svg>;

  if (iconKey === "check") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="m14 34 12 12 24-28" {...common} /></svg>;
  if (iconKey === "x") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M18 18 46 46M46 18 18 46" {...common} /></svg>;
  if (iconKey === "iconStar") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="m32 8 7 16h17L43 36l5 18-16-9-16 9 5-18L8 24h17z" {...common} /></svg>;
  if (iconKey === "pencil") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M14 48 18 36 42 12l10 10-24 24zM38 16l10 10" {...common} /></svg>;
  if (iconKey === "clock") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><circle cx="32" cy="32" r="22" {...common} /><path d="M32 19v15l10 6" {...common} /></svg>;
  if (iconKey === "scissors") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><circle cx="18" cy="18" r="7" {...common} /><circle cx="18" cy="46" r="7" {...common} /><path d="M25 22 51 48M25 42 51 16" {...common} /></svg>;
  if (iconKey === "bang") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M32 12v26" {...common} /><path d="M32 50h.1" {...common} strokeWidth={7} /></svg>;
  if (iconKey === "question") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M23 22a10 10 0 1 1 16 8c-5 4-7 6-7 12" {...common} /><path d="M32 52h.1" {...common} strokeWidth={7} /></svg>;
  if (iconKey === "play") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M22 14v36l28-18z" {...common} /></svg>;
  if (iconKey === "warning") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M32 8 58 54H6zM32 24v14M32 48h.1" {...common} /></svg>;
  if (iconKey === "pin") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M24 8h16l-3 18 11 10v6H16v-6l11-10zM32 42v14" {...common} /></svg>;
  if (iconKey === "trophy") return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M22 10h20v13a10 10 0 0 1-20 0zM22 16H10v5a10 10 0 0 0 12 10M42 16h12v5a10 10 0 0 1-12 10M32 33v13M23 54h18M27 46h10" {...common} /></svg>;

  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="14" y="14" width="36" height="36" {...common} /></svg>;
}

function Section({ section, collapsed, onToggle, children }: { section: ElementPaletteSection; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-3">
      <button type="button" onClick={onToggle} className="mb-2 flex w-full items-center justify-between text-left text-xs font-bold text-slate-600">
        <span>{sectionLabels[section]}</span>
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {!collapsed && children}
    </section>
  );
}

function PaletteTile({ preset, onInsert, large = false, primaryColor }: { preset: ElementPalettePreset; onInsert: (preset: ElementPalettePreset) => void; large?: boolean; primaryColor?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `element-${preset.id}`, data: { preset } });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onInsert(preset)}
      className={`group flex min-w-0 flex-col items-center justify-center rounded-md border bg-white text-center shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 ${
        large ? "min-h-[74px] gap-2 p-3" : "h-20 w-20 gap-1.5 p-2"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <SvgIcon iconKey={preset.iconKey} color={primaryColor || "#334155"} className={large ? "h-8 w-8 shrink-0 text-slate-700" : "h-7 w-7 shrink-0 text-slate-700"} />
      <span className={`${large ? "text-sm font-semibold" : "text-[11px] font-medium"} leading-tight text-slate-700`}>{preset.label}</span>
      {large && preset.description && <span className="line-clamp-1 text-[11px] leading-tight text-slate-500">{preset.description}</span>}
    </button>
  );
}

function LineTile({ preset, onInsert }: { preset: ElementPalettePreset; onInsert: (preset: ElementPalettePreset) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `element-${preset.id}`, data: { preset } });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onInsert(preset)}
      className={`flex h-[58px] min-w-[86px] flex-col items-center justify-center gap-1 rounded-md border bg-white px-2 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 ${isDragging ? "opacity-40" : ""}`}
    >
      <SvgIcon iconKey={preset.iconKey} className="h-7 w-14 text-slate-800" />
      {preset.label}
    </button>
  );
}

function RecentChip({ entry, onInsert }: { entry: RecentElementEntry; onInsert: (entry: RecentElementEntry) => void }) {
  const preset = allElementPresets.find((item) => item.id === entry.presetId);
  if (!preset) return null;
  return (
    <button
      type="button"
      onClick={() => onInsert(entry)}
      className="flex h-9 w-9 items-center justify-center rounded-md border bg-white text-slate-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
      title={entry.label}
      aria-label={`${entry.label} 다시 삽입`}
    >
      <SvgIcon iconKey={preset.iconKey} className="h-5 w-5" color={entry.element.color || entry.element.stroke || "#334155"} />
    </button>
  );
}

function centerForElement(page: CanvasDocument["page"], width: number, height: number) {
  return {
    x: Math.max(0, Math.round((page.width - width) / 2)),
    y: Math.max(0, Math.round((page.height - height) / 2)),
  };
}

export function ElementsSidebarPanel() {
  const page = useEditorStore((state) => state.canvasJson.page);
  const addElement = useEditorStore((state) => state.addElement);
  const [collapsed, setCollapsed] = useState<CollapsedState>(defaultCollapsed);
  const [recent, setRecent] = useState<RecentElementEntry[]>([]);
  const [iconQuery, setIconQuery] = useState("");
  const [iconSize, setIconSize] = useState<IconSizeKey>("medium");
  const [primaryColor, setPrimaryColor] = useState("#111827");

  useEffect(() => {
    setCollapsed(readCollapsed());
    setRecent(readRecentElements());
    setPrimaryColor(readPrimaryColor());

    function syncRecent() {
      setRecent(readRecentElements());
    }

    function syncColor() {
      setPrimaryColor(readPrimaryColor());
    }

    window.addEventListener(RECENT_ELEMENTS_CHANGED_EVENT, syncRecent);
    window.addEventListener(COLOR_CHANGED_EVENT, syncColor);
    window.addEventListener("storage", syncRecent);
    window.addEventListener("focus", syncColor);
    return () => {
      window.removeEventListener(RECENT_ELEMENTS_CHANGED_EVENT, syncRecent);
      window.removeEventListener(COLOR_CHANGED_EVENT, syncColor);
      window.removeEventListener("storage", syncRecent);
      window.removeEventListener("focus", syncColor);
    };
  }, []);

  function toggle(section: ElementPaletteSection) {
    setCollapsed((current) => {
      const next = { ...current, [section]: !current[section] };
      saveCollapsed(next);
      return next;
    });
  }

  function insertElement(element: CanvasElement, presetId: string, label: string) {
    addElement(element);
    rememberElementUse(presetId, label, element);
    setRecent(readRecentElements());
  }

  function insertPreset(preset: ElementPalettePreset) {
    const size = iconSizes[iconSize].value;
    const width = preset.section === "icons" ? size : preset.defaultWidth;
    const height = preset.section === "icons" ? size : preset.defaultHeight;
    const centered = preset.section === "lines" ? { x: 0, y: Math.round(page.height / 2 - height / 2) } : centerForElement(page, width, height);
    const element = preset.create(centered.x, centered.y, { iconSize: size, primaryColor, page });
    insertElement(element, preset.id, preset.label);
  }

  function insertRecent(entry: RecentElementEntry) {
    const centered = centerForElement(page, entry.element.width || 120, entry.element.height || 40);
    const element = cloneRecentElement(entry, centered.x, centered.y);
    insertElement(element, entry.presetId, entry.label);
  }

  const basicShapes = useMemo(() => allElementPresets.filter((preset) => preset.section === "basicShapes"), []);
  const lines = useMemo(() => allElementPresets.filter((preset) => preset.section === "lines"), []);
  const boxes = useMemo(() => allElementPresets.filter((preset) => preset.section === "boxes"), []);
  const exam = useMemo(() => allElementPresets.filter((preset) => preset.section === "exam"), []);
  const visibleIcons = useMemo(() => {
    const query = iconQuery.trim().toLowerCase();
    return iconPalettePresets.filter((preset) => !query || `${preset.label} ${preset.description || ""}`.toLowerCase().includes(query));
  }, [iconQuery]);

  const dynamicIconPresets = useMemo(
    () =>
      visibleIcons.map((preset) => ({
        ...preset,
        defaultWidth: iconSizes[iconSize].value,
        defaultHeight: iconSizes[iconSize].value,
        create: (x: number, y: number) => preset.create(x, y, { iconSize: iconSizes[iconSize].value, primaryColor, page }),
      })),
    [iconSize, page, primaryColor, visibleIcons]
  );

  return (
    <div className="space-y-4">
      <section className="sticky top-0 z-10 -mx-3 border-b bg-slate-50/95 px-3 pb-3 pt-1 backdrop-blur">
        <h3 className="mb-2 text-xs font-bold text-slate-600">최근 사용</h3>
        {recent.length ? (
          <div className="flex flex-wrap gap-2">
            {recent.map((entry) => <RecentChip key={entry.presetId} entry={entry} onInsert={insertRecent} />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-white px-3 py-2 text-xs text-slate-500">아직 사용한 요소가 없습니다</div>
        )}
      </section>

      <Section section="basicShapes" collapsed={collapsed.basicShapes} onToggle={() => toggle("basicShapes")}>
        <div className="grid grid-cols-2 gap-2">
          {basicShapes.map((preset) => <PaletteTile key={preset.id} preset={preset} onInsert={insertPreset} />)}
        </div>
      </Section>

      <Section section="lines" collapsed={collapsed.lines} onToggle={() => toggle("lines")}>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {lines.map((preset) => <LineTile key={preset.id} preset={preset} onInsert={insertPreset} />)}
        </div>
      </Section>

      <Section section="boxes" collapsed={collapsed.boxes} onToggle={() => toggle("boxes")}>
        <div className="grid grid-cols-2 gap-2">
          {boxes.map((preset) => <PaletteTile key={preset.id} preset={preset} onInsert={insertPreset} />)}
        </div>
      </Section>

      <Section section="exam" collapsed={collapsed.exam} onToggle={() => toggle("exam")}>
        <div className="space-y-2">
          {exam.map((preset) => <PaletteTile key={preset.id} preset={preset} onInsert={insertPreset} large />)}
        </div>
      </Section>

      <Section section="icons" collapsed={collapsed.icons} onToggle={() => toggle("icons")}>
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="아이콘 검색" className="h-9 bg-white pl-9" aria-label="아이콘 검색" />
          </label>
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded border" style={{ background: primaryColor }} aria-label="현재 아이콘 색상" />
            <div className="grid flex-1 grid-cols-3 gap-1">
              {(Object.keys(iconSizes) as IconSizeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIconSize(key)}
                  className={`h-8 rounded-md text-xs font-semibold transition ${iconSize === key ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}
                >
                  {iconSizes[key].label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2">
              {dynamicIconPresets.map((preset) => <PaletteTile key={preset.id} preset={preset} onInsert={insertPreset} primaryColor={primaryColor} />)}
            </div>
            {!dynamicIconPresets.length && <div className="rounded-md border border-dashed bg-white p-4 text-center text-xs text-slate-500">검색 결과가 없습니다</div>}
          </div>
        </div>
      </Section>
    </div>
  );
}
