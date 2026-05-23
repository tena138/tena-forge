"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";

import { Input } from "@/components/ui/input";
import { CanvasElement } from "@/lib/editorTypes";
import {
  createBaseTextElement,
  createDynamicFieldElement,
  dynamicFieldColors,
  dynamicFieldPresets,
  DynamicFieldPreset,
  editorFonts,
  fontSizePresets,
  textStylePresets,
} from "@/lib/textPresets";
import { useEditorStore } from "@/store/editorStore";

type TextDefaults = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

const lineHeightOptions = [
  { label: "좁게", value: 1.0 },
  { label: "보통", value: 1.4 },
  { label: "넓게", value: 1.8 },
  { label: "아주 넓게", value: 2.2 },
];

const letterSpacingOptions = [
  { label: "좁게", value: -2 },
  { label: "보통", value: 0 },
  { label: "넓게", value: 4 },
  { label: "아주 넓게", value: 8 },
];

function centerFor(page: { width: number; height: number }, width: number, height: number) {
  return {
    x: Math.max(0, Math.round((page.width - width) / 2)),
    y: Math.max(0, Math.round((page.height - height) / 2)),
  };
}

function isTextElement(element: CanvasElement) {
  return element.type === "text" || element.type === "dynamic_field" || element.type === "icon";
}

function FieldChip({ field, onInsert }: { field: DynamicFieldPreset; onInsert: (field: DynamicFieldPreset) => void }) {
  const colors = dynamicFieldColors[field.group];
  const preset = {
    id: `dynamic-field-${field.key}`,
    label: field.label,
    type: "dynamic_field",
    defaultWidth: Math.max(118, field.label.length * 12),
    defaultHeight: 30,
    create: (x: number, y: number) => createDynamicFieldElement(field, x, y),
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: preset.id, data: { preset } });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onInsert(field)}
      className={`rounded-md px-2 py-1.5 text-xs font-medium transition hover:bg-slate-100 ${isDragging ? "opacity-45" : ""}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {field.label}
    </button>
  );
}

export function TextSidebarPanel() {
  const page = useEditorStore((state) => state.canvasJson.page);
  const elements = useEditorStore((state) => state.canvasJson.elements);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const addElement = useEditorStore((state) => state.addElement);
  const updateElements = useEditorStore((state) => state.updateElements);
  const [defaults, setDefaults] = useState<TextDefaults>({ fontFamily: "NanumGothic", fontSize: 11, lineHeight: 1.4, letterSpacing: 0 });
  const [fontQuery, setFontQuery] = useState("");

  const selectedTextIds = useMemo(
    () => elements.filter((element) => selectedIds.includes(element.id) && isTextElement(element)).map((element) => element.id),
    [elements, selectedIds]
  );
  const selectedText = useMemo(() => elements.find((element) => selectedTextIds.includes(element.id)), [elements, selectedTextIds]);

  const activeFont = selectedText?.fontFamily || defaults.fontFamily;
  const activeSize = selectedText?.fontSize || defaults.fontSize;
  const activeLineHeight = selectedText?.lineHeight || defaults.lineHeight;
  const activeLetterSpacing = selectedText?.letterSpacing ?? defaults.letterSpacing;

  const filteredFonts = editorFonts.filter((font) => `${font.label} ${font.family}`.toLowerCase().includes(fontQuery.trim().toLowerCase()));

  function applyOrDefault(partial: Partial<CanvasElement>, nextDefaults?: Partial<TextDefaults>) {
    if (selectedTextIds.length) {
      updateElements(selectedTextIds, partial);
      return;
    }
    if (nextDefaults) setDefaults((current) => ({ ...current, ...nextDefaults }));
  }

  function insertText(label: string, text: string, fontSize: number, weight: "normal" | "bold") {
    const width = fontSize >= 28 ? 320 : fontSize >= 18 ? 280 : 240;
    const height = Math.max(32, Math.round(fontSize * 1.8));
    const center = centerFor(page, width, height);
    addElement(
      createBaseTextElement(center.x, center.y, {
        name: label,
        text,
        width,
        height,
        fontSize,
        fontWeight: weight,
        fontFamily: defaults.fontFamily || "NanumGothic",
        lineHeight: defaults.lineHeight,
        letterSpacing: defaults.letterSpacing,
      }),
      { edit: true }
    );
  }

  function insertStylePreset(preset: (typeof textStylePresets)[number]) {
    const width = preset.element.width || 260;
    const height = preset.element.height || 34;
    const center = centerFor(page, width, height);
    addElement(
      createBaseTextElement(center.x, center.y, {
        name: preset.label,
        ...preset.element,
      })
    );
  }

  function insertDynamicField(field: DynamicFieldPreset) {
    const width = Math.max(118, field.label.length * 12);
    const center = centerFor(page, width, 30);
    addElement(createDynamicFieldElement(field, center.x, center.y));
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <button type="button" onClick={() => insertText("제목 텍스트", "제목을 입력하세요", 28, "bold")} className="flex w-full items-center gap-2 rounded-md border bg-white p-3 text-left text-sm font-bold text-slate-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
          <Plus className="h-4 w-4" /> 제목 텍스트 추가
        </button>
        <button type="button" onClick={() => insertText("소제목 텍스트", "소제목을 입력하세요", 18, "bold")} className="flex w-full items-center gap-2 rounded-md border bg-white p-3 text-left text-sm font-bold text-slate-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
          <Plus className="h-4 w-4" /> 소제목 텍스트 추가
        </button>
        <button type="button" onClick={() => insertText("본문 텍스트", "본문을 입력하세요", 11, "normal")} className="flex w-full items-center gap-2 rounded-md border bg-white p-3 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
          <Plus className="h-4 w-4" /> 본문 텍스트 추가
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">폰트</h3>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={fontQuery} onChange={(event) => setFontQuery(event.target.value)} placeholder="폰트 검색" className="h-9 bg-white pl-9" aria-label="폰트 검색" />
        </label>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border bg-white p-1">
          {filteredFonts.map((font) => (
            <button
              key={font.family}
              type="button"
              onClick={() => applyOrDefault({ fontFamily: font.family }, { fontFamily: font.family })}
              className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition hover:bg-slate-100 ${activeFont === font.family ? "bg-sky-50 text-sky-900" : "text-slate-700"}`}
              style={{ fontFamily: font.family }}
            >
              <span>{font.label}</span>
              <span className="text-[11px] text-slate-400">{font.family}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">크기</h3>
        <div className="grid grid-cols-7 gap-1">
          {fontSizePresets.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => applyOrDefault({ fontSize: size }, { fontSize: size })}
              className={`h-8 rounded-md text-xs font-semibold transition ${activeSize === size ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}
            >
              {size}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">스타일 프리셋</h3>
        <div className="space-y-2">
          {textStylePresets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => insertStylePreset(preset)} className="w-full rounded-md border bg-white p-3 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
              <div
                className="truncate"
                style={{
                  fontFamily: preset.element.fontFamily,
                  fontSize: Math.min(22, preset.element.fontSize || 12),
                  fontWeight: preset.element.fontWeight,
                  fontStyle: preset.element.fontStyle,
                  color: preset.element.color || "#111827",
                  textAlign: preset.element.textAlign,
                  letterSpacing: preset.element.letterSpacing,
                  borderBottom: preset.id === "section-header" ? "1px solid #111827" : undefined,
                  paddingBottom: preset.id === "section-header" ? 4 : undefined,
                }}
              >
                {preset.preview}
              </div>
              <div className="mt-1 text-[11px] font-medium text-slate-500">{preset.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-600">동적 필드</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {dynamicFieldPresets.map((field) => <FieldChip key={field.key} field={field} onInsert={insertDynamicField} />)}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">줄 간격</h3>
        <div className="grid grid-cols-4 gap-1">
          {lineHeightOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => applyOrDefault({ lineHeight: option.value }, { lineHeight: option.value })}
              className={`h-8 rounded-md text-[11px] font-semibold transition ${activeLineHeight === option.value ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-slate-600">자간</h3>
        <div className="grid grid-cols-4 gap-1">
          {letterSpacingOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => applyOrDefault({ letterSpacing: option.value }, { letterSpacing: option.value })}
              className={`h-8 rounded-md text-[11px] font-semibold transition ${activeLetterSpacing === option.value ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
