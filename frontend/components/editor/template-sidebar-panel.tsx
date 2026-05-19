"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, ImageIcon, Loader2, Pencil, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExamTemplate, api, assetUrl } from "@/lib/api";
import { CanvasDocument, CanvasDocumentPage, CanvasElement, getCanvasDocumentPages } from "@/lib/editorTypes";
import { StarterTemplateCategory, starterTemplates } from "@/lib/starterTemplates";
import { legacyTemplateDocument } from "@/lib/templateFallback";
import { useEditorStore } from "@/store/editorStore";

type FilterCategory = "all" | StarterTemplateCategory;

type TemplatePanelItem = {
  id: string;
  name: string;
  description: string;
  category: StarterTemplateCategory;
  document: CanvasDocument;
  source: "starter" | "saved";
  template?: ExamTemplate;
  logoUrl?: string | null;
};

const filterTabs: Array<{ key: FilterCategory; label: string }> = [
  { key: "all", label: "전체" },
  { key: "basic", label: "기본형" },
  { key: "logo", label: "로고형" },
  { key: "exam", label: "시험형" },
  { key: "minimal", label: "미니멀" },
];

function cloneDocument(document: CanvasDocument): CanvasDocument {
  return JSON.parse(JSON.stringify(document)) as CanvasDocument;
}

function pageToDocument(source: CanvasDocument, page: CanvasDocumentPage): CanvasDocument {
  return {
    ...source,
    page: page.page,
    elements: page.elements,
    activePageId: page.id,
  };
}

function imageSrc(src?: string | null) {
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("http")) return src;
  return assetUrl(src);
}

function classifySavedTemplate(template: ExamTemplate): StarterTemplateCategory {
  const normalizedName = `${template.name} ${template.academy_name || ""}`.toLowerCase();
  const elements = template.canvas_json ? getCanvasDocumentPages(template.canvas_json).flatMap((page) => page.elements) : [];
  if (normalizedName.includes("minimal") || normalizedName.includes("미니멀")) return "minimal";
  if (normalizedName.includes("logo") || normalizedName.includes("로고") || elements.some((element) => element.type === "logo")) return "logo";
  if (normalizedName.includes("exam") || normalizedName.includes("모의") || normalizedName.includes("시험형") || elements.some((element) => element.type === "answer_table")) return "exam";
  return "basic";
}

function formatQuestionNumber(format: CanvasElement["questionNumberFormat"], n: number) {
  if (format === "[n]") return `[${n}]`;
  return (format || "문 {n}.").replace("{n}", String(n));
}

function displayText(element: CanvasElement) {
  return element.previewValue || element.text || element.name;
}

function PreviewElement({ element, scale, logoUrl }: { element: CanvasElement; scale: number; logoUrl?: string | null }) {
  if (element.visible === false || element.type === "group") return null;

  const base: CSSProperties = {
    position: "absolute",
    left: element.x * scale,
    top: element.y * scale,
    width: Math.max(1, element.width * scale),
    height: Math.max(1, element.height * scale),
    opacity: element.opacity ?? 1,
    transform: `rotate(${element.rotation || 0}deg)`,
    transformOrigin: "center",
    overflow: "hidden",
  };

  if (element.type === "text" || element.type === "dynamic_field" || element.type === "icon") {
    return (
      <div
        style={{
          ...base,
          color: element.color || "#111827",
          fontFamily: element.fontFamily || "NanumGothic",
          fontSize: Math.max(3, (element.fontSize || 12) * scale),
          fontWeight: element.fontWeight || "normal",
          fontStyle: element.fontStyle || "normal",
          textAlign: element.textAlign || "left",
          lineHeight: element.lineHeight || 1.2,
          whiteSpace: "pre-wrap",
          background: element.backgroundColor || undefined,
          borderRadius: element.borderRadius ? element.borderRadius * scale : undefined,
          padding: element.backgroundColor ? `${3 * scale}px ${6 * scale}px` : undefined,
        }}
      >
        {displayText(element)}
      </div>
    );
  }

  if (element.type === "line" || element.type === "divider") {
    return (
      <div
        style={{
          ...base,
          height: Math.max(1, element.height * scale),
          borderTop: `${Math.max(1, (element.strokeWidth || 1) * scale)}px ${element.strokeStyle === "dashed" ? "dashed" : "solid"} ${element.stroke || "#111827"}`,
        }}
      />
    );
  }

  if (element.type === "path" && element.pathData) {
    return (
      <svg
        viewBox={`0 0 ${element.width} ${element.height}`}
        style={base}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={element.pathData}
          fill={element.fill === "transparent" ? "none" : element.fill || "none"}
          stroke={element.stroke || "#111827"}
          strokeWidth={Math.max(1, (element.strokeWidth || 0) * scale)}
          strokeDasharray={element.strokeStyle === "dashed" ? "8 6" : element.strokeStyle === "dotted" ? "2 6" : undefined}
        />
      </svg>
    );
  }

  if (element.type === "image" || element.type === "logo") {
    const src = imageSrc(element.src || (element.type === "logo" ? logoUrl : ""));
    if (element.type === "logo" && !src) return null;
    return (
      <div
        style={{
          ...base,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: element.strokeWidth
            ? `${Math.max(1, element.strokeWidth * scale)}px ${element.strokeStyle === "dashed" ? "dashed" : "solid"} ${element.stroke || "#cbd5e1"}`
            : undefined,
          background: element.fill || "#f8fafc",
          color: "#64748b",
          fontSize: Math.max(8, 12 * scale),
          fontWeight: 700,
        }}
      >
        {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-5 w-5 text-slate-300" />}
      </div>
    );
  }

  if (element.type === "question_area") {
    const columns = Math.max(1, element.columns || 1);
    const questionsPerColumn = 5;
    const columnWidth = element.width / columns;
    return (
      <div
        style={{
          ...base,
          border: element.strokeWidth ? `${Math.max(1, element.strokeWidth * scale)}px solid ${element.stroke || "#d1d5db"}` : undefined,
          background: element.fill === "transparent" ? "transparent" : element.fill || "transparent",
        }}
      >
        {Array.from({ length: columns - 1 }).map((_, index) => (
          <div key={index} className="absolute bottom-0 top-0 w-px bg-slate-200" style={{ left: `${((index + 1) * 100) / columns}%` }} />
        ))}
        {Array.from({ length: columns * questionsPerColumn }).map((_, index) => {
          const column = Math.floor(index / questionsPerColumn);
          const row = index % questionsPerColumn;
          const left = (column * columnWidth + 14) * scale;
          const top = (18 + row * 74) * scale;
          return (
            <div
              key={index}
              className="absolute text-slate-700"
              style={{
                left,
                top,
                width: Math.max(20, (columnWidth - 28) * scale),
                fontSize: Math.max(4, (element.questionFontSize || 10) * scale),
                fontFamily: element.fontFamily || "NanumGothic",
              }}
            >
              <div className="font-semibold">{formatQuestionNumber(element.questionNumberFormat, index + 1)}</div>
              <div className="mt-1 h-px bg-slate-300" />
              <div className="mt-2 h-px w-5/6 bg-slate-200" />
              <div className="mt-2 h-px w-2/3 bg-slate-200" />
            </div>
          );
        })}
      </div>
    );
  }

  if (element.type === "table" || element.type === "answer_table") {
    const rows = Math.max(1, element.rows || 2);
    const columns = Math.max(1, element.columns || element.answersPerRow || 5);
    return (
      <div
        style={{
          ...base,
          border: `${Math.max(1, (element.strokeWidth || 1) * scale)}px solid ${element.stroke || "#111827"}`,
          background: element.fill || "#ffffff",
          color: "#334155",
          fontSize: Math.max(4, (element.fontSize || 10) * scale),
        }}
      >
        {Array.from({ length: rows - 1 }).map((_, index) => <div key={`r-${index}`} className="absolute left-0 right-0 h-px bg-slate-300" style={{ top: `${((index + 1) * 100) / rows}%` }} />)}
        {Array.from({ length: columns - 1 }).map((_, index) => <div key={`c-${index}`} className="absolute bottom-0 top-0 w-px bg-slate-300" style={{ left: `${((index + 1) * 100) / columns}%` }} />)}
        {element.type === "answer_table" && (
          <>
            <div className="absolute left-2 top-1 font-semibold" style={{ fontSize: Math.max(5, 11 * scale) }}>답안표</div>
            {Array.from({ length: rows * columns }).map((_, index) => (
              <span
                key={index}
                className="absolute flex items-center justify-center"
                style={{
                  left: `${(index % columns) * (100 / columns)}%`,
                  top: `${Math.floor(index / columns) * (100 / rows)}%`,
                  width: `${100 / columns}%`,
                  height: `${100 / rows}%`,
                  paddingTop: 10 * scale,
                }}
              >
                {index + 1}
              </span>
            ))}
          </>
        )}
      </div>
    );
  }

  const borderRadius = element.type === "circle" ? "999px" : `${(element.borderRadius || 0) * scale}px`;
  const clipPath = element.type === "triangle" ? "polygon(50% 0%, 0% 100%, 100% 100%)" : undefined;

  return (
    <div
      style={{
        ...base,
        borderRadius,
        clipPath,
        background: element.fill === "transparent" ? "transparent" : element.fill || "#ffffff",
        border: element.strokeWidth ? `${Math.max(1, element.strokeWidth * scale)}px solid ${element.stroke || "#111827"}` : undefined,
        boxShadow: element.shadow ? `${element.shadow.offsetX * scale}px ${element.shadow.offsetY * scale}px ${element.shadow.blur * scale}px ${element.shadow.color}` : undefined,
      }}
    />
  );
}

function TemplateCanvasPreview({ document, scale, logoUrl, className }: { document: CanvasDocument; scale: number; logoUrl?: string | null; className?: string }) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: document.page.width * scale,
        height: document.page.height * scale,
        background: document.page.backgroundColor || "#ffffff",
        boxShadow: "0 8px 22px rgba(15, 23, 42, 0.14)",
        overflow: "hidden",
      }}
    >
      {[...document.elements].sort((a, b) => a.zIndex - b.zIndex).map((element) => (
        <PreviewElement key={element.id} element={element} scale={scale} logoUrl={logoUrl} />
      ))}
    </div>
  );
}

function TemplateThumbnail({ item }: { item: TemplatePanelItem }) {
  const firstPage = getCanvasDocumentPages(item.document)[0];
  const previewDocument = pageToDocument(item.document, firstPage);
  const scale = 160 / previewDocument.page.width;
  return (
    <div className="flex h-[226px] w-[160px] items-start justify-center overflow-hidden bg-slate-100">
      <TemplateCanvasPreview document={previewDocument} scale={scale} logoUrl={item.logoUrl} />
    </div>
  );
}

function TemplateCard({
  item,
  onApply,
  onPreview,
  onEdit,
  onDelete,
}: {
  item: TemplatePanelItem;
  onApply: (item: TemplatePanelItem) => void;
  onPreview: (item: TemplatePanelItem) => void;
  onEdit?: (item: TemplatePanelItem) => void;
  onDelete?: (item: TemplatePanelItem) => void;
}) {
  function handleButton(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  return (
    <article className="group rounded-md border bg-white p-3 shadow-sm transition hover:border-sky-300">
      <div className="relative mx-auto h-[226px] w-[160px] overflow-hidden rounded-sm border bg-slate-100">
        <TemplateThumbnail item={item} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 px-3 opacity-0 transition group-hover:opacity-100">
          <Button type="button" size="sm" className="w-full bg-white text-slate-950 hover:bg-slate-100" onClick={(event) => handleButton(event, () => onApply(item))}>
            적용하기
          </Button>
          <Button type="button" size="sm" variant="secondary" className="w-full bg-slate-800 text-white hover:bg-slate-700" onClick={(event) => handleButton(event, () => onPreview(item))}>
            <Eye className="h-4 w-4" />
            미리보기
          </Button>
          {item.source === "saved" && (
            <div className="mt-2 flex w-full gap-2">
              <Button type="button" size="sm" variant="secondary" className="flex-1 bg-white/95 px-2 text-slate-800 hover:bg-white" onClick={(event) => handleButton(event, () => onEdit?.(item))}>
                <Pencil className="h-3.5 w-3.5" />
                편집
              </Button>
              <Button type="button" size="sm" variant="destructive" className="flex-1 px-2" onClick={(event) => handleButton(event, () => onDelete?.(item))}>
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </Button>
            </div>
          )}
        </div>
      </div>
      <h3 className="mt-3 text-sm font-bold leading-tight text-slate-950">{item.name}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</p>
    </article>
  );
}

function ApplyConfirmModal({ item, onCancel, onConfirm }: { item: TemplatePanelItem | null; onCancel: () => void; onConfirm: () => void }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/55 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-slate-950">템플릿 적용</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">현재 작업 중인 내용이 사라집니다. 계속하시겠습니까?</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>취소</Button>
          <Button type="button" onClick={onConfirm}>적용</Button>
        </div>
      </div>
    </div>
  );
}

function getPreviewPages(document: CanvasDocument): CanvasDocument[] {
  return getCanvasDocumentPages(document).map((page) => pageToDocument(document, page));
}

function TemplatePreviewModal({ item, onClose, onApply }: { item: TemplatePanelItem | null; onClose: () => void; onApply: (item: TemplatePanelItem) => void }) {
  const [pageIndex, setPageIndex] = useState(0);
  const pages = useMemo(() => (item ? getPreviewPages(item.document) : []), [item]);

  useEffect(() => {
    setPageIndex(0);
  }, [item?.id]);

  if (!item) return null;

  const activePage = pages[pageIndex] || item.document;
  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < pages.length - 1;

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-slate-950/95 text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{item.name}</h2>
          <p className="text-xs text-slate-300">{pageIndex + 1} / {pages.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => onApply(item)}>적용하기</Button>
          <Button type="button" variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={onClose}>닫기</Button>
          <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose} aria-label="닫기"><X className="h-5 w-5" /></Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 overflow-auto p-4">
        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-white hover:bg-white/10" disabled={!canGoPrev} onClick={() => setPageIndex((value) => Math.max(0, value - 1))} aria-label="이전 페이지">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-fit rounded bg-slate-200 p-4">
          <TemplateCanvasPreview document={activePage} scale={0.72} logoUrl={item.logoUrl} className="bg-white" />
        </div>
        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-white hover:bg-white/10" disabled={!canGoNext} onClick={() => setPageIndex((value) => Math.min(pages.length - 1, value + 1))} aria-label="다음 페이지">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export function TemplateSidebarPanel({ onNotice }: { onNotice?: (message: string) => void }) {
  const router = useRouter();
  const applyDocument = useEditorStore((state) => state.applyDocument);
  const currentDocument = useEditorStore((state) => state.canvasJson);
  const hasExistingElements = getCanvasDocumentPages(currentDocument).some((page) => page.elements.length > 0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FilterCategory>("all");
  const [savedTemplates, setSavedTemplates] = useState<ExamTemplate[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [pendingApply, setPendingApply] = useState<TemplatePanelItem | null>(null);
  const [previewItem, setPreviewItem] = useState<TemplatePanelItem | null>(null);

  async function loadSavedTemplates() {
    setLoadingSaved(true);
    try {
      setSavedTemplates(await api<ExamTemplate[]>("/api/templates"));
    } catch (error) {
      setSavedTemplates([]);
      onNotice?.(error instanceof Error ? error.message : "템플릿을 불러오지 못했습니다.");
    } finally {
      setLoadingSaved(false);
    }
  }

  useEffect(() => {
    loadSavedTemplates();
  }, []);

  const starterItems = useMemo<TemplatePanelItem[]>(
    () =>
      starterTemplates.map((template) => ({
        id: `starter-${template.id}`,
        name: template.name,
        description: template.description,
        category: template.category,
        document: template.canvasJson,
        source: "starter",
      })),
    []
  );

  const savedItems = useMemo<TemplatePanelItem[]>(
    () =>
      savedTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.academy_name ? `${template.academy_name}에서 저장한 템플릿` : "저장된 사용자 템플릿",
        category: classifySavedTemplate(template),
        document: template.canvas_json || legacyTemplateDocument(template),
        source: "saved",
        template,
        logoUrl: template.logo_url,
      })),
    [savedTemplates]
  );

  function matchesFilter(item: TemplatePanelItem) {
    const normalizedQuery = query.trim().toLowerCase();
    const categoryMatches = category === "all" || item.category === category;
    const queryMatches = !normalizedQuery || item.name.toLowerCase().includes(normalizedQuery);
    return categoryMatches && queryMatches;
  }

  const visibleStarters = starterItems.filter(matchesFilter);
  const visibleSaved = savedItems.filter(matchesFilter);

  function requestApply(item: TemplatePanelItem) {
    if (hasExistingElements) {
      setPendingApply(item);
      return;
    }
    applyTemplate(item);
  }

  function applyTemplate(item: TemplatePanelItem) {
    applyDocument(cloneDocument(item.document), { name: item.name });
    setPendingApply(null);
    setPreviewItem(null);
    onNotice?.("템플릿이 적용되었습니다");
  }

  async function deleteTemplate(item: TemplatePanelItem) {
    if (!item.template) return;
    if (!window.confirm(`'${item.name}' 템플릿을 삭제하시겠습니까?`)) return;
    try {
      await api(`/api/templates/${item.template.id}`, { method: "DELETE" });
      setSavedTemplates((templates) => templates.filter((template) => template.id !== item.template?.id));
      onNotice?.("템플릿이 삭제되었습니다");
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "템플릿 삭제에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="템플릿 검색" className="h-9 bg-white pl-9" aria-label="템플릿 검색" />
      </label>

      <div className="flex flex-wrap gap-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setCategory(tab.key)}
            className={`h-8 rounded-md px-2.5 text-xs font-semibold transition ${
              category === tab.key ? "bg-slate-950 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500">추천 템플릿</h3>
        <div className="grid grid-cols-1 gap-3">
          {visibleStarters.map((item) => (
            <TemplateCard key={item.id} item={item} onApply={requestApply} onPreview={setPreviewItem} />
          ))}
          {!visibleStarters.length && <div className="rounded-md border border-dashed bg-white p-4 text-center text-xs text-slate-500">조건에 맞는 추천 템플릿이 없습니다</div>}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-500">내 저장 템플릿</h3>
          {loadingSaved && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        {loadingSaved ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-[310px] animate-pulse rounded-md border bg-white p-3">
                <div className="mx-auto h-[226px] w-[160px] rounded bg-slate-100" />
                <div className="mt-3 h-4 w-2/3 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : savedTemplates.length === 0 ? (
          <div className="rounded-md border border-dashed bg-white p-6 text-center text-xs text-slate-500">저장된 템플릿이 없습니다</div>
        ) : visibleSaved.length === 0 ? (
          <div className="rounded-md border border-dashed bg-white p-6 text-center text-xs text-slate-500">조건에 맞는 저장 템플릿이 없습니다</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {visibleSaved.map((item) => (
              <TemplateCard
                key={item.id}
                item={item}
                onApply={requestApply}
                onPreview={setPreviewItem}
                onEdit={(selected) => router.push(`/templates/editor?id=${selected.template?.id}`)}
                onDelete={deleteTemplate}
              />
            ))}
          </div>
        )}
      </section>

      <ApplyConfirmModal item={pendingApply} onCancel={() => setPendingApply(null)} onConfirm={() => pendingApply && applyTemplate(pendingApply)} />
      <TemplatePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} onApply={requestApply} />
    </div>
  );
}
