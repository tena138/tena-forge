"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Clock3, Copy, ExternalLink, FileDown, FilePlus2, History, Loader2, Pencil, RotateCcw, Save, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExamTemplate, TemplateVersion, api, duplicateTemplate, listTemplateVersions, restoreTemplateVersion } from "@/lib/api";
import { CanvasDocument, EMPTY_DOCUMENT, getCanvasDocumentPages } from "@/lib/editorTypes";
import { legacyTemplateDocument } from "@/lib/templateFallback";
import { useEditorStore } from "@/store/editorStore";

type SortMode = "latest" | "name" | "used";

type ProjectSidebarPanelProps = {
  onSave: () => Promise<ExamTemplate | null>;
  onSaveCopy: () => Promise<ExamTemplate | null>;
  onPreview: () => Promise<void> | void;
  onOpenExport: () => Promise<void> | void;
  onNotice?: (message: string) => void;
};

const usageKey = "tena-forge-template-usage";
const autoSaveKey = "tena-forge-project-autosave";

function cloneDocument(document: CanvasDocument): CanvasDocument {
  return JSON.parse(JSON.stringify(document));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function relativeTime(value?: string | null) {
  if (!value) return "-";
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "방금 전";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return formatDate(value);
}

function readUsage() {
  if (typeof window === "undefined") return {} as Record<string, number>;
  try {
    return JSON.parse(localStorage.getItem(usageKey) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function readAutoSave() {
  if (typeof window === "undefined") return { enabled: true, interval: 1, last: "" };
  try {
    const stored = JSON.parse(localStorage.getItem(autoSaveKey) || "{}") as { enabled?: boolean; interval?: number; last?: string };
    return { enabled: stored.enabled ?? true, interval: stored.interval || 1, last: stored.last || "" };
  } catch {
    return { enabled: true, interval: 1, last: "" };
  }
}

function writeAutoSave(settings: { enabled: boolean; interval: number; last: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(autoSaveKey, JSON.stringify(settings));
}

function TemplateMiniature({ document }: { document: CanvasDocument }) {
  const firstPage = getCanvasDocumentPages(document)[0];
  const scaleX = 40 / firstPage.page.width;
  const scaleY = 56 / firstPage.page.height;
  const elements = [...firstPage.elements].sort((a, b) => a.zIndex - b.zIndex).slice(0, 18);
  return (
    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-sm border bg-white shadow-sm" style={{ backgroundColor: firstPage.page.backgroundColor }}>
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
            borderRadius: element.type === "circle" ? "999px" : element.borderRadius ? Math.max(1, element.borderRadius * scaleX) : 0,
            opacity: element.opacity,
          }}
        />
      ))}
    </div>
  );
}

export function ProjectSidebarPanel({ onSave, onSaveCopy, onPreview, onOpenExport, onNotice }: ProjectSidebarPanelProps) {
  const router = useRouter();
  const document = useEditorStore((state) => state.canvasJson);
  const templateId = useEditorStore((state) => state.templateId);
  const templateName = useEditorStore((state) => state.templateName);
  const isDirty = useEditorStore((state) => state.isDirty);
  const setTemplateName = useEditorStore((state) => state.setTemplateName);
  const setDocument = useEditorStore((state) => state.setDocument);
  const setSidebarTab = useEditorStore((state) => state.setSidebarTab);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(templateName);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("latest");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamTemplate | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [autoSave, setAutoSave] = useState(readAutoSave);

  const currentTemplate = templates.find((template) => template.id === templateId) || null;
  const createdAt = currentTemplate?.created_at || document.updatedAt || new Date().toISOString();
  const updatedAt = currentTemplate?.updated_at || document.updatedAt || createdAt;
  const pageCount = getCanvasDocumentPages(document).length;
  const elementCount = getCanvasDocumentPages(document).reduce((count, page) => count + page.elements.length, 0);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await api<ExamTemplate[]>("/api/templates"));
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "템플릿 목록을 불러오지 못했습니다.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  const loadVersions = useCallback(async (id: string | null) => {
    if (!id) {
      setVersions([]);
      return;
    }
    try {
      setVersions(await listTemplateVersions(id));
    } catch {
      setVersions([]);
    }
  }, []);

  useEffect(() => {
    setNameDraft(templateName);
  }, [templateName]);

  useEffect(() => {
    setUsage(readUsage());
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadVersions(templateId);
  }, [loadVersions, templateId]);

  useEffect(() => {
    writeAutoSave(autoSave);
  }, [autoSave]);

  useEffect(() => {
    if (!autoSave.enabled) return;
    const interval = window.setInterval(async () => {
      if (!useEditorStore.getState().isDirty) return;
      try {
        await onSave();
        const last = new Date().toISOString();
        setAutoSave((settings) => ({ ...settings, last }));
        await loadTemplates();
        await loadVersions(useEditorStore.getState().templateId);
        onNotice?.("자동 저장되었습니다");
      } catch (error) {
        onNotice?.(error instanceof Error ? error.message : "자동 저장에 실패했습니다.");
      }
    }, autoSave.interval * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [autoSave.enabled, autoSave.interval, loadTemplates, loadVersions, onNotice, onSave]);

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates
      .filter((template) => !needle || template.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "ko-KR");
        if (sort === "used") return (usage[b.id] || 0) - (usage[a.id] || 0) || b.updated_at.localeCompare(a.updated_at);
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [query, sort, templates, usage]);

  function commitName() {
    const next = nameDraft.trim() || templateName;
    setTemplateName(next);
    setNameDraft(next);
    setEditingName(false);
  }

  async function saveCurrent() {
    setSaving(true);
    try {
      const saved = await onSave();
      await loadTemplates();
      await loadVersions(saved?.id || useEditorStore.getState().templateId);
      return saved;
    } finally {
      setSaving(false);
    }
  }

  async function saveCopy() {
    setSaving(true);
    try {
      const saved = await onSaveCopy();
      await loadTemplates();
      await loadVersions(saved?.id || useEditorStore.getState().templateId);
      onNotice?.("사본이 저장되었습니다");
      return saved;
    } finally {
      setSaving(false);
    }
  }

  function bumpUsage(id: string) {
    const next = { ...usage, [id]: (usage[id] || 0) + 1 };
    setUsage(next);
    if (typeof window !== "undefined") localStorage.setItem(usageKey, JSON.stringify(next));
  }

  async function openTemplate(template: ExamTemplate) {
    if (isDirty) await onSave();
    bumpUsage(template.id);
    router.push(`/templates/editor?id=${template.id}&returnTo=${encodeURIComponent("/templates/mine")}`);
  }

  async function duplicateSaved(template: ExamTemplate) {
    try {
      const duplicated = await duplicateTemplate(template.id);
      await loadTemplates();
      onNotice?.(`'${duplicated.name}' 사본을 만들었습니다`);
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "복제에 실패했습니다.");
    }
  }

  async function deleteSaved() {
    if (!deleteTarget) return;
    try {
      await api(`/api/templates/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await loadTemplates();
      onNotice?.("템플릿이 삭제되었습니다");
      if (deleteTarget.id === templateId) {
        const blank = cloneDocument(EMPTY_DOCUMENT);
        blank.updatedAt = new Date().toISOString();
        setDocument(blank, { id: null, name: "새 시각 템플릿", dirty: false });
        router.replace("/templates/editor?blank=1");
      }
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  async function restoreVersion(version: TemplateVersion) {
    if (!templateId) return;
    if (isDirty && !window.confirm("현재 작업 중인 내용이 사라질 수 있습니다. 이 버전으로 복원하시겠습니까?")) return;
    try {
      const restored = await restoreTemplateVersion(templateId, version.id);
      setDocument(restored.canvas_json || legacyTemplateDocument(restored), { id: restored.id, name: restored.name, dirty: false });
      await loadTemplates();
      await loadVersions(restored.id);
      onNotice?.("버전이 복원되었습니다");
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "버전 복원에 실패했습니다.");
    }
  }

  async function newTemplate() {
    if (isDirty) await onSave();
    if (typeof window !== "undefined") localStorage.removeItem("tena-forge-editor-draft:new");
    const blank = cloneDocument(EMPTY_DOCUMENT);
    blank.updatedAt = new Date().toISOString();
    setDocument(blank, { id: null, name: "새 시각 템플릿", dirty: false });
    setSidebarTab("elements");
    router.replace("/templates/editor?blank=1");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border bg-white p-3">
        <h3 className="mb-3 text-xs font-bold text-slate-600">현재 프로젝트 정보</h3>
        <div className="space-y-3 text-xs text-slate-600">
          <div>
            <div className="mb-1 font-semibold text-slate-500">템플릿 이름</div>
            {editingName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitName();
                  if (event.key === "Escape") {
                    setNameDraft(templateName);
                    setEditingName(false);
                  }
                }}
                className="h-8 bg-white text-sm font-semibold"
              />
            ) : (
              <button type="button" onClick={() => setEditingName(true)} className="flex w-full items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5 text-left text-sm font-bold text-slate-900 hover:bg-slate-100">
                <span className="min-w-0 truncate">{templateName}</span>
                <Pencil className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Info label="생성일" value={formatDate(createdAt)} />
            <Info label="마지막 수정" value={relativeTime(updatedAt)} />
            <Info label="요소 수" value={`${elementCount}개`} />
            <Info label="페이지 수" value={`${pageCount}페이지`} />
            <Info label="페이지 크기" value="A4 (210×297mm)" />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-md border bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={saveCurrent} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </Button>
          <Button type="button" variant="outline" onClick={saveCopy} disabled={saving}>
            <Copy className="h-4 w-4" />
            사본 저장
          </Button>
        </div>

        <div className="rounded-md border">
          <button type="button" onClick={() => setVersionsOpen((open) => !open)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-slate-600">
            <span className="flex items-center gap-2"><History className="h-4 w-4" />버전 기록</span>
            <ChevronDown className={`h-4 w-4 transition ${versionsOpen ? "" : "-rotate-90"}`} />
          </button>
          {versionsOpen && (
            <div className="max-h-48 overflow-auto border-t p-1">
              {!templateId ? (
                <div className="p-3 text-center text-xs text-slate-500">저장 후 버전 기록이 생성됩니다.</div>
              ) : versions.length ? (
                versions.map((version, index) => (
                  <div key={version.id} className={`group flex items-center gap-2 rounded-md px-2 py-2 text-xs ${index === 0 ? "bg-zinc-50 text-zinc-900" : "hover:bg-slate-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">v{version.version_number}</div>
                      <div className="text-[11px] text-slate-500">{formatDateTime(version.saved_at)} · 요소 {version.element_count}개</div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 opacity-0 group-hover:opacity-100" onClick={() => restoreVersion(version)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      복원
                    </Button>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-xs text-slate-500">저장된 버전이 없습니다.</div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-slate-50 p-3">
          <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
            자동 저장 활성화
            <input type="checkbox" checked={autoSave.enabled} onChange={(event) => setAutoSave((settings) => ({ ...settings, enabled: event.target.checked }))} />
          </label>
          <div className="mt-3 grid grid-cols-3 gap-1">
            {[1, 5, 10].map((minute) => (
              <button key={minute} type="button" onClick={() => setAutoSave((settings) => ({ ...settings, interval: minute }))} className={`h-8 rounded-md text-xs font-semibold ${autoSave.interval === minute ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
                {minute}분
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            마지막 자동 저장: {autoSave.last ? relativeTime(autoSave.last) : "-"}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-600">내 템플릿 목록</h3>
          <Button type="button" variant="outline" size="sm" onClick={newTemplate}>
            <FilePlus2 className="h-4 w-4" />
            새 템플릿
          </Button>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="템플릿 검색" className="h-9 bg-white pl-9" />
        </label>
        <div className="grid grid-cols-3 gap-1">
          {([
            ["latest", "최신순"],
            ["name", "이름순"],
            ["used", "자주 사용"],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSort(key)} className={`h-8 rounded-md text-xs font-semibold ${sort === key ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center rounded-md border bg-white p-6 text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />불러오는 중</div>
          ) : filteredTemplates.length ? (
            filteredTemplates.map((template) => {
              const active = template.id === templateId;
              const templateDocument = template.canvas_json || legacyTemplateDocument(template);
              return (
                <div key={template.id} className={`group flex items-center gap-3 rounded-md border bg-white p-2 transition ${active ? "border-zinc-500 ring-1 ring-zinc-200" : "hover:border-zinc-200"}`}>
                  <TemplateMiniature document={templateDocument} />
                  <button type="button" onClick={() => openTemplate(template)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-bold text-slate-900">{template.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{formatDate(template.updated_at)} · {usage[template.id] || 0}회</div>
                  </button>
                  <div className="hidden shrink-0 gap-1 group-hover:flex">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openTemplate(template)} aria-label="열기"><ExternalLink className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateSaved(template)} aria-label="복제"><Copy className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-600" onClick={() => setDeleteTarget(template)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed bg-white p-6 text-center text-xs text-slate-500">저장된 템플릿이 없습니다.</div>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded-md border bg-white p-3">
        <h3 className="text-xs font-bold text-slate-600">내보내기 빠른 실행</h3>
        <Button type="button" className="w-full" onClick={onOpenExport}>
          <FileDown className="h-4 w-4" />
          이 템플릿으로 내보내기
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={onPreview}>
          <Check className="h-4 w-4" />
          PDF 미리보기
        </Button>
      </section>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">템플릿 삭제</h2>
              <p className="mt-2 text-sm text-slate-600">'{deleteTarget?.name}' 템플릿을 삭제하시겠습니까?</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
              <Button type="button" variant="destructive" onClick={deleteSaved}>삭제</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="mt-1 truncate font-bold text-slate-800">{value}</div>
    </div>
  );
}
