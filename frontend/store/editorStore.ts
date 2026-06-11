import { produce } from "immer";
import { nanoid } from "nanoid";
import { create } from "zustand";

import {
  CanvasDocument,
  CanvasDocumentPage,
  CanvasElement,
  DEFAULT_PAGE,
  DrawingTool,
  EMPTY_DOCUMENT,
  Guide,
  InspectorTab,
  SidebarTab,
} from "@/lib/editorTypes";

function cloneDocument(document: CanvasDocument): CanvasDocument {
  return JSON.parse(JSON.stringify(document));
}

function clonePage(page = DEFAULT_PAGE) {
  return JSON.parse(JSON.stringify(page)) as CanvasDocument["page"];
}

function normalizeElements(elements: CanvasElement[] = []) {
  return [...elements]
    .flatMap((element) => {
      if (element.type !== "logo") return [element];
      if (!element.src) return [];
      return [{ ...element, type: "image" as const, name: element.name || "로고" }];
    })
    .map((element, index) => ({ ...element, zIndex: element.zIndex ?? index }));
}

function normalizePageEntry(page: Partial<CanvasDocumentPage>, index: number, fallback?: CanvasDocument): CanvasDocumentPage {
  return {
    id: page.id || `page-${index + 1}-${nanoid(6)}`,
    name: page.name || `페이지 ${index + 1}`,
    page: clonePage(page.page || fallback?.page || DEFAULT_PAGE),
    elements: normalizeElements(Array.isArray(page.elements) ? page.elements : fallback?.elements || []),
    updatedAt: page.updatedAt || fallback?.updatedAt || new Date().toISOString(),
  };
}

function uniquePageIds(pages: CanvasDocumentPage[]) {
  const seen = new Set<string>();
  return pages.map((page, index) => {
    if (!seen.has(page.id)) {
      seen.add(page.id);
      return page;
    }
    const id = `${page.id}-${index + 1}-${nanoid(4)}`;
    seen.add(id);
    return { ...page, id };
  });
}

function normalizeDocument(document: CanvasDocument): CanvasDocument {
  const cloned = cloneDocument(document);
  const rawPages = Array.isArray(cloned.pages) ? cloned.pages : [];
  const pages = uniquePageIds(
    rawPages.length
      ? rawPages.map((page, index) => normalizePageEntry(page, index, cloned))
      : [
          normalizePageEntry(
            {
              id: cloned.activePageId || "page-1",
              name: "페이지 1",
              page: cloned.page,
              elements: cloned.elements,
              updatedAt: cloned.updatedAt,
            },
            0,
            cloned
          ),
        ]
  );
  const activePageId = cloned.activePageId && pages.some((page) => page.id === cloned.activePageId) ? cloned.activePageId : pages[0].id;
  const activePage = pages.find((page) => page.id === activePageId) || pages[0];
  return {
    ...cloned,
    version: 1,
    pages,
    activePageId,
    page: clonePage(activePage.page),
    elements: normalizeElements(activePage.elements),
    updatedAt: cloned.updatedAt || new Date().toISOString(),
  };
}

function syncActivePage(document: CanvasDocument): CanvasDocument {
  const cloned = cloneDocument(document);
  const rawPages = Array.isArray(cloned.pages) && cloned.pages.length ? cloned.pages : [{ id: cloned.activePageId || "page-1", name: "페이지 1", page: cloned.page, elements: cloned.elements, updatedAt: cloned.updatedAt }];
  const pages = uniquePageIds(rawPages.map((page, index) => normalizePageEntry(page, index, cloned)));
  const activePageId = cloned.activePageId && pages.some((page) => page.id === cloned.activePageId) ? cloned.activePageId : pages[0].id;
  const updatedAt = cloned.updatedAt || new Date().toISOString();
  const syncedPages = pages.map((page) =>
    page.id === activePageId
      ? {
          ...page,
          page: clonePage(cloned.page),
          elements: normalizeElements(cloned.elements),
          updatedAt,
        }
      : page
  );
  const activePage = syncedPages.find((page) => page.id === activePageId) || syncedPages[0];
  return {
    ...cloned,
    pages: syncedPages,
    activePageId,
    page: clonePage(activePage.page),
    elements: normalizeElements(activePage.elements),
    updatedAt,
  };
}

function commitHistory(draft: EditorStore) {
  const next = cloneDocument(syncActivePage({ ...draft.canvasJson, updatedAt: new Date().toISOString() }));
  const history = draft.history.slice(0, draft.historyIndex + 1);
  const actionHistory = draft.actionHistory.slice(0, draft.historyIndex + 1);
  history.push(next);
  actionHistory.push({ id: nanoid(), name: draft.pendingActionName || "작업", timestamp: new Date().toISOString() });
  while (history.length > 100) {
    history.shift();
    actionHistory.shift();
  }
  draft.history = history;
  draft.actionHistory = actionHistory;
  draft.historyIndex = history.length - 1;
  draft.canvasJson = next;
  draft.isDirty = true;
  draft.pendingActionName = null;
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributionAxis = "horizontal" | "vertical";
export type LayerDirection = "front" | "forward" | "backward" | "back";

export type HistoryEntry = {
  id: string;
  name: string;
  timestamp: string;
};

export type EditorStore = {
  templateId: string | null;
  templateName: string;
  isDirty: boolean;
  isSaving: boolean;
  canvasJson: CanvasDocument;
  history: CanvasDocument[];
  actionHistory: HistoryEntry[];
  historyIndex: number;
  selectedIds: string[];
  hoveredId: string | null;
  isEditing: boolean;
  editingElementId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  activeSidebarTab: SidebarTab;
  activeInspectorTab: InspectorTab;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  showGuides: boolean;
  guides: Guide[];
  clipboard: CanvasElement[];
  activeDrawingTool: DrawingTool;
  penStrokeWidth: number;
  penColor: string;
  penSmooth: boolean;
  pendingActionName: string | null;
  setDocument: (document: CanvasDocument, meta?: { id?: string | null; name?: string; dirty?: boolean }) => void;
  applyDocument: (document: CanvasDocument, meta?: { id?: string | null; name?: string; dirty?: boolean }) => void;
  setTemplateName: (name: string) => void;
  setActivePage: (id: string) => void;
  addPage: () => void;
  duplicatePage: (id?: string) => void;
  deletePage: (id?: string) => void;
  renamePage: (id: string, name: string) => void;
  setSaving: (saving: boolean) => void;
  markSaved: (id?: string | null) => void;
  addElement: (element: CanvasElement, options?: { edit?: boolean }) => void;
  updateElement: (id: string, partial: Partial<CanvasElement>) => void;
  updateElements: (ids: string[], partial: Partial<CanvasElement>) => void;
  replaceElements: (elements: CanvasElement[], actionName?: string, selectedIds?: string[]) => void;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;
  reorderLayer: (id: string, direction: LayerDirection) => void;
  groupElements: (ids: string[]) => void;
  ungroupElement: (id: string) => void;
  lockElements: (ids: string[], locked: boolean) => void;
  setVisibility: (ids: string[], visible: boolean) => void;
  alignElements: (ids: string[], alignment: Alignment) => void;
  distributeElements: (ids: string[], axis: DistributionAxis) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;
  setZoom: (zoom: number) => void;
  pan: (dx: number, dy: number) => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  copyToClipboard: () => void;
  pasteFromClipboard: () => void;
  setGuide: (guide: Guide) => void;
  deleteGuide: (id: string) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleRulers: () => void;
  toggleGuides: () => void;
  setGridSize: (size: number) => void;
  setPage: (partial: Partial<CanvasDocument["page"]>) => void;
  setDrawingTool: (tool: DrawingTool) => void;
  setPenOptions: (options: Partial<Pick<EditorStore, "penStrokeWidth" | "penColor" | "penSmooth">>) => void;
  clearGuides: () => void;
  setActionName: (name: string) => void;
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  templateId: null,
  templateName: "새 시각 템플릿",
  isDirty: false,
  isSaving: false,
  canvasJson: EMPTY_DOCUMENT,
  history: [EMPTY_DOCUMENT],
  actionHistory: [{ id: nanoid(), name: "문서 열기", timestamp: new Date().toISOString() }],
  historyIndex: 0,
  selectedIds: [],
  hoveredId: null,
  isEditing: false,
  editingElementId: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  activeSidebarTab: "elements",
  activeInspectorTab: "properties",
  showGrid: false,
  snapToGrid: false,
  gridSize: 10,
  showRulers: true,
  showGuides: true,
  guides: [],
  clipboard: [],
  activeDrawingTool: "select",
  penStrokeWidth: 3,
  penColor: "#111827",
  penSmooth: true,
  pendingActionName: null,
  setDocument: (document, meta) =>
    set((state) =>
      produce(state, (draft) => {
        const normalized = normalizeDocument(document);
        draft.canvasJson = normalized;
        draft.history = [cloneDocument(normalized)];
        draft.actionHistory = [{ id: nanoid(), name: meta?.dirty ? "문서 복원" : "문서 열기", timestamp: new Date().toISOString() }];
        draft.historyIndex = 0;
        draft.templateId = meta?.id ?? null;
        draft.templateName = meta?.name ?? draft.templateName;
        draft.isDirty = meta?.dirty ?? false;
        draft.selectedIds = [];
        draft.isEditing = false;
        draft.editingElementId = null;
        draft.showGrid = false;
        draft.snapToGrid = false;
      })
    ),
  applyDocument: (document, meta) =>
    set((state) =>
      produce(state, (draft) => {
        const normalized = normalizeDocument(document);
        const next = cloneDocument({ ...normalized, updatedAt: new Date().toISOString() });
        const history = draft.history.slice(0, draft.historyIndex + 1);
        const actionHistory = draft.actionHistory.slice(0, draft.historyIndex + 1);
        history.push(next);
        actionHistory.push({ id: nanoid(), name: "템플릿 적용", timestamp: new Date().toISOString() });
        while (history.length > 100) {
          history.shift();
          actionHistory.shift();
        }
        draft.canvasJson = next;
        draft.history = history;
        draft.actionHistory = actionHistory;
        draft.historyIndex = history.length - 1;
        if (Object.prototype.hasOwnProperty.call(meta || {}, "id")) draft.templateId = meta?.id ?? null;
        if (meta?.name) draft.templateName = meta.name;
        draft.isDirty = meta?.dirty ?? true;
        draft.selectedIds = [];
        draft.isEditing = false;
        draft.editingElementId = null;
        draft.showGrid = false;
        draft.snapToGrid = false;
      })
    ),
  setTemplateName: (name) =>
    set((state) =>
      produce(state, (draft) => {
        draft.templateName = name;
        draft.isDirty = true;
      })
    ),
  setActivePage: (id) =>
    set((state) =>
      produce(state, (draft) => {
        const synced = syncActivePage(draft.canvasJson);
        const target = synced.pages?.find((page) => page.id === id);
        if (!target) return;
        draft.canvasJson = {
          ...synced,
          activePageId: target.id,
          page: clonePage(target.page),
          elements: normalizeElements(target.elements),
        };
        draft.selectedIds = [];
        draft.isEditing = false;
        draft.editingElementId = null;
      })
    ),
  addPage: () =>
    set((state) =>
      produce(state, (draft) => {
        const synced = syncActivePage(draft.canvasJson);
        const pages = synced.pages || [];
        const activeIndex = Math.max(0, pages.findIndex((page) => page.id === synced.activePageId));
        const newPage: CanvasDocumentPage = {
          id: `page-${pages.length + 1}-${nanoid(6)}`,
          name: `페이지 ${pages.length + 1}`,
          page: clonePage(synced.page),
          elements: [],
          updatedAt: new Date().toISOString(),
        };
        const nextPages = [...pages];
        nextPages.splice(activeIndex + 1, 0, newPage);
        draft.canvasJson = {
          ...synced,
          pages: nextPages,
          activePageId: newPage.id,
          page: clonePage(newPage.page),
          elements: [],
        };
        draft.selectedIds = [];
        draft.isEditing = false;
        draft.editingElementId = null;
        draft.pendingActionName = "페이지 추가";
        commitHistory(draft);
      })
    ),
  duplicatePage: (id) =>
    set((state) =>
      produce(state, (draft) => {
        const synced = syncActivePage(draft.canvasJson);
        const pages = synced.pages || [];
        const sourceIndex = Math.max(0, pages.findIndex((page) => page.id === (id || synced.activePageId)));
        const source = pages[sourceIndex] || pages[0];
        if (!source) return;
        const idMap = new Map(source.elements.map((element) => [element.id, nanoid()]));
        const copied: CanvasDocumentPage = {
          ...JSON.parse(JSON.stringify(source)),
          id: `page-${pages.length + 1}-${nanoid(6)}`,
          name: `${source.name} 복사`,
          elements: source.elements.map((element) => ({
            ...element,
            id: idMap.get(element.id) || nanoid(),
            groupId: element.groupId ? idMap.get(element.groupId) || null : element.groupId,
            children: element.children?.map((childId) => idMap.get(childId) || childId),
          })),
          updatedAt: new Date().toISOString(),
        };
        const nextPages = [...pages];
        nextPages.splice(sourceIndex + 1, 0, copied);
        draft.canvasJson = {
          ...synced,
          pages: nextPages,
          activePageId: copied.id,
          page: clonePage(copied.page),
          elements: normalizeElements(copied.elements),
        };
        draft.selectedIds = [];
        draft.isEditing = false;
        draft.editingElementId = null;
        draft.pendingActionName = "페이지 복제";
        commitHistory(draft);
      })
    ),
  deletePage: (id) =>
    set((state) =>
      produce(state, (draft) => {
        const synced = syncActivePage(draft.canvasJson);
        const pages = synced.pages || [];
        if (pages.length <= 1) return;
        const targetId = id || synced.activePageId || pages[0].id;
        const targetIndex = pages.findIndex((page) => page.id === targetId);
        if (targetIndex < 0) return;
        const nextPages = pages.filter((page) => page.id !== targetId);
        const nextActive = targetId === synced.activePageId ? nextPages[Math.min(targetIndex, nextPages.length - 1)] : nextPages.find((page) => page.id === synced.activePageId) || nextPages[0];
        draft.canvasJson = {
          ...synced,
          pages: nextPages,
          activePageId: nextActive.id,
          page: clonePage(nextActive.page),
          elements: normalizeElements(nextActive.elements),
        };
        draft.selectedIds = [];
        draft.isEditing = false;
        draft.editingElementId = null;
        draft.pendingActionName = "페이지 삭제";
        commitHistory(draft);
      })
    ),
  renamePage: (id, name) =>
    set((state) =>
      produce(state, (draft) => {
        const synced = syncActivePage(draft.canvasJson);
        draft.canvasJson = {
          ...synced,
          pages: (synced.pages || []).map((page) => (page.id === id ? { ...page, name: name || "페이지" } : page)),
        };
        draft.isDirty = true;
      })
    ),
  setSaving: (saving) => set({ isSaving: saving }),
  markSaved: (id) =>
    set((state) =>
      produce(state, (draft) => {
        draft.templateId = id ?? draft.templateId;
        draft.isDirty = false;
        draft.isSaving = false;
      })
    ),
  addElement: (element, options) =>
    set((state) =>
      produce(state, (draft) => {
        const zIndex = Math.max(-1, ...draft.canvasJson.elements.map((item) => item.zIndex)) + 1;
        draft.canvasJson.elements.push({ ...element, zIndex });
        draft.selectedIds = [element.id];
        draft.isEditing = Boolean(options?.edit);
        draft.editingElementId = options?.edit ? element.id : null;
        draft.pendingActionName = options?.edit ? "텍스트 추가" : draft.pendingActionName || "요소 추가";
        commitHistory(draft);
      })
    ),
  updateElement: (id, partial) => get().updateElements([id], partial),
  updateElements: (ids, partial) =>
    set((state) =>
      produce(state, (draft) => {
        draft.canvasJson.elements = draft.canvasJson.elements.map((element) => (ids.includes(element.id) ? { ...element, ...partial } : element));
        draft.pendingActionName = draft.pendingActionName || ("x" in partial || "y" in partial ? "요소 이동" : "요소 수정");
        commitHistory(draft);
      })
    ),
  replaceElements: (elements, actionName, selectedIds) =>
    set((state) =>
      produce(state, (draft) => {
        draft.canvasJson.elements = elements.map((element, index) => ({ ...element, zIndex: element.zIndex ?? index }));
        if (selectedIds) draft.selectedIds = selectedIds;
        draft.pendingActionName = actionName || "요소 수정";
        commitHistory(draft);
      })
    ),
  deleteElements: (ids) =>
    set((state) =>
      produce(state, (draft) => {
        draft.canvasJson.elements = draft.canvasJson.elements.filter((element) => !ids.includes(element.id) && !ids.includes(element.groupId || ""));
        draft.selectedIds = draft.selectedIds.filter((id) => !ids.includes(id));
        draft.pendingActionName = "요소 삭제";
        commitHistory(draft);
      })
    ),
  duplicateElements: (ids) =>
    set((state) =>
      produce(state, (draft) => {
        const copies = draft.canvasJson.elements
          .filter((element) => ids.includes(element.id))
          .map((element) => ({ ...element, id: nanoid(), name: `${element.name} 복사`, x: element.x + 24, y: element.y + 24, locked: false, zIndex: draft.canvasJson.elements.length + 1 }));
        draft.canvasJson.elements.push(...copies);
        draft.selectedIds = copies.map((element) => element.id);
        draft.pendingActionName = "요소 복제";
        commitHistory(draft);
      })
    ),
  reorderLayer: (id, direction) =>
    set((state) =>
      produce(state, (draft) => {
        const sorted = [...draft.canvasJson.elements].sort((a, b) => a.zIndex - b.zIndex);
        const index = sorted.findIndex((element) => element.id === id);
        if (index < 0) return;
        const [item] = sorted.splice(index, 1);
        const target =
          direction === "front" ? sorted.length : direction === "back" ? 0 : direction === "forward" ? Math.min(index + 1, sorted.length) : Math.max(index - 1, 0);
        sorted.splice(target, 0, item);
        draft.canvasJson.elements = sorted.map((element, zIndex) => ({ ...element, zIndex }));
        draft.pendingActionName = "레이어 순서 변경";
        commitHistory(draft);
      })
    ),
  groupElements: (ids) =>
    set((state) =>
      produce(state, (draft) => {
        if (ids.length < 2) return;
        const selected = draft.canvasJson.elements.filter((element) => ids.includes(element.id));
        const minX = Math.min(...selected.map((element) => element.x));
        const minY = Math.min(...selected.map((element) => element.y));
        const maxX = Math.max(...selected.map((element) => element.x + element.width));
        const maxY = Math.max(...selected.map((element) => element.y + element.height));
        const groupId = nanoid();
        draft.canvasJson.elements = draft.canvasJson.elements.map((element) => (ids.includes(element.id) ? { ...element, groupId } : element));
        draft.canvasJson.elements.push({
          id: groupId,
          type: "group",
          name: "그룹",
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: Math.max(...draft.canvasJson.elements.map((element) => element.zIndex)) + 1,
          children: ids,
        });
        draft.selectedIds = [groupId];
        draft.pendingActionName = "그룹 만들기";
        commitHistory(draft);
      })
    ),
  ungroupElement: (id) =>
    set((state) =>
      produce(state, (draft) => {
        draft.canvasJson.elements = draft.canvasJson.elements.filter((element) => element.id !== id).map((element) => (element.groupId === id ? { ...element, groupId: null } : element));
        draft.selectedIds = [];
        draft.pendingActionName = "그룹 해제";
        commitHistory(draft);
      })
    ),
  lockElements: (ids, locked) => get().updateElements(ids, { locked }),
  setVisibility: (ids, visible) => get().updateElements(ids, { visible }),
  alignElements: (ids, alignment) =>
    set((state) =>
      produce(state, (draft) => {
        const selected = draft.canvasJson.elements.filter((element) => ids.includes(element.id));
        if (selected.length < 2) return;
        const minX = Math.min(...selected.map((element) => element.x));
        const minY = Math.min(...selected.map((element) => element.y));
        const maxX = Math.max(...selected.map((element) => element.x + element.width));
        const maxY = Math.max(...selected.map((element) => element.y + element.height));
        draft.canvasJson.elements = draft.canvasJson.elements.map((element) => {
          if (!ids.includes(element.id)) return element;
          if (alignment === "left") return { ...element, x: minX };
          if (alignment === "center") return { ...element, x: minX + (maxX - minX - element.width) / 2 };
          if (alignment === "right") return { ...element, x: maxX - element.width };
          if (alignment === "top") return { ...element, y: minY };
          if (alignment === "middle") return { ...element, y: minY + (maxY - minY - element.height) / 2 };
          return { ...element, y: maxY - element.height };
        });
        draft.pendingActionName = "요소 정렬";
        commitHistory(draft);
      })
    ),
  distributeElements: (ids, axis) =>
    set((state) =>
      produce(state, (draft) => {
        const selected = draft.canvasJson.elements.filter((element) => ids.includes(element.id)).sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
        if (selected.length < 3) return;
        const first = selected[0];
        const last = selected[selected.length - 1];
        const span = axis === "horizontal" ? last.x - first.x : last.y - first.y;
        const step = span / (selected.length - 1);
        selected.forEach((element, index) => {
          const target = draft.canvasJson.elements.find((item) => item.id === element.id);
          if (target) {
            if (axis === "horizontal") target.x = first.x + step * index;
            else target.y = first.y + step * index;
          }
        });
        draft.pendingActionName = "간격 배분";
        commitHistory(draft);
      })
    ),
  pushHistory: () =>
    set((state) =>
      produce(state, (draft) => {
        commitHistory(draft);
      })
    ),
  undo: () =>
    set((state) =>
      produce(state, (draft) => {
        if (draft.historyIndex <= 0) return;
        draft.historyIndex -= 1;
        draft.canvasJson = cloneDocument(draft.history[draft.historyIndex]);
        draft.isDirty = true;
        draft.isEditing = false;
        draft.editingElementId = null;
      })
    ),
  redo: () =>
    set((state) =>
      produce(state, (draft) => {
        if (draft.historyIndex >= draft.history.length - 1) return;
        draft.historyIndex += 1;
        draft.canvasJson = cloneDocument(draft.history[draft.historyIndex]);
        draft.isDirty = true;
        draft.isEditing = false;
        draft.editingElementId = null;
      })
    ),
  jumpToHistory: (index) =>
    set((state) =>
      produce(state, (draft) => {
        const nextIndex = Math.max(0, Math.min(index, draft.history.length - 1));
        draft.historyIndex = nextIndex;
        draft.canvasJson = cloneDocument(draft.history[nextIndex]);
        draft.isDirty = true;
        draft.isEditing = false;
        draft.editingElementId = null;
      })
    ),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
  pan: (dx, dy) => set((state) => ({ panX: state.panX + dx, panY: state.panY + dy })),
  setSelection: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [], isEditing: false, editingElementId: null }),
  copyToClipboard: () => set((state) => ({ clipboard: state.canvasJson.elements.filter((element) => state.selectedIds.includes(element.id)).map((element) => ({ ...element })) })),
  pasteFromClipboard: () =>
    set((state) =>
      produce(state, (draft) => {
        if (!draft.clipboard.length) return;
        const copies = draft.clipboard.map((element) => ({ ...element, id: nanoid(), x: element.x + 32, y: element.y + 32, name: `${element.name} 붙여넣기` }));
        draft.canvasJson.elements.push(...copies);
        draft.selectedIds = copies.map((element) => element.id);
        commitHistory(draft);
      })
    ),
  setGuide: (guide) =>
    set((state) =>
      produce(state, (draft) => {
        const index = draft.guides.findIndex((item) => item.id === guide.id);
        if (index >= 0) draft.guides[index] = guide;
        else draft.guides.push(guide);
        draft.isDirty = true;
      })
    ),
  deleteGuide: (id) => set((state) => ({ guides: state.guides.filter((guide) => guide.id !== id), isDirty: true })),
  clearGuides: () => set({ guides: [], isDirty: true }),
  setSidebarTab: (tab) => set({ activeSidebarTab: tab }),
  setInspectorTab: (tab) => set({ activeInspectorTab: tab }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
  toggleGuides: () => set((state) => ({ showGuides: !state.showGuides })),
  setGridSize: (size) => set({ gridSize: Math.max(4, Math.min(40, size)), isDirty: true }),
  setPage: (partial) =>
    set((state) =>
      produce(state, (draft) => {
        draft.canvasJson.page = { ...draft.canvasJson.page, ...partial };
        draft.pendingActionName = "페이지 설정";
        commitHistory(draft);
      })
    ),
  setDrawingTool: (tool) => set({ activeDrawingTool: tool }),
  setPenOptions: (options) => set(options),
  setActionName: (name) => set({ pendingActionName: name }),
}));
