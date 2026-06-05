"use client";

import { Suspense, type KeyboardEvent, type MouseEvent, type PointerEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid3X3,
  List,
  Minus,
  Plus,
  Search,
  Send,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import { AddToSetModal } from "@/components/add-to-set-modal";
import { ExportModal } from "@/components/export-modal";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, Batch, KoreanReviewItemsResponse, KoreanReviewPassageItem, Problem } from "@/lib/api";
import {
  SubjectNode,
  buildSubjectTree,
  makeSubjectPathValue,
  normalizeSubjectValue,
  subjectDisplayLabel,
} from "@/lib/subjectHierarchy";
import { cn } from "@/lib/utils";

type ProblemPage = { items: Problem[]; total: number; page: number; limit: number; pages: number };
type Facets = { subjects: string[]; units: string[]; sources: string[]; visibilities?: string[]; origin_types?: string[] };
type DragBox = { left: number; top: number; width: number; height: number };
type ReviewFilter = "all" | "needs" | "reviewed";
type ViewMode = "grid" | "list";
type ProblemSort = "source_order" | "newest" | "oldest" | "number_asc" | "number_desc";
type BatchFolder = { id: string; name: string; batchIds: string[]; createdAt: string; parentId: string | null; order: number };
type BatchFolderContextMenu = { folderId: string; x: number; y: number } | null;
type BatchFolderDragState = {
  kind: "folder" | "batch";
  folderId: string;
  name: string;
  batchCount: number;
  problemCount: number;
  pointerId: number;
  grabX: number;
  grabY: number;
  previewWidth: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  isDragging: boolean;
};
type BatchFolderDropTarget = {
  parentId: string | null;
  beforeFolderId?: string;
  targetBatchId?: string;
  markerId: string;
  mode: "inside" | "before" | "root" | "batch";
};

const emptyProblemPage: ProblemPage = { items: [], total: 0, page: 1, limit: 24, pages: 1 };
const difficulties = ["하", "중", "상", "최상"];
const defaultReviewFilter: ReviewFilter = "all";
const viewModeStorageKey = "tena.problemBrowser.viewMode";
const customSubjectFiltersStorageKey = "tena.problemBrowser.customSubjects";
const batchFoldersStorageKey = "tena.problemBrowser.batchFolders";
const selectedProblemsStorageKey = "tena.problemBrowser.selectedIds";
const archiveDragHotspotOffset = { x: -32, y: -38 };
const reviewFilters: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "needs", label: "검토 필요" },
  { value: "reviewed", label: "검토 완료" },
];
const sortOptions: Array<{ value: ProblemSort; label: string }> = [
  { value: "source_order", label: "원문 순" },
  { value: "newest", label: "최근 등록" },
  { value: "oldest", label: "오래된 순" },
  { value: "number_asc", label: "번호 오름차순" },
  { value: "number_desc", label: "번호 내림차순" },
];

function readSubjectList(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map((value) => normalizeSubjectValue(String(value))).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeSubjectList(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...new Set(values.map(normalizeSubjectValue).filter(Boolean))]));
}

function readBatchFolders() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(batchFoldersStorageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((folder, index): BatchFolder | null => {
        if (!folder || typeof folder !== "object") return null;
        const name = String((folder as BatchFolder).name || "").trim();
        const id = String((folder as BatchFolder).id || "");
        const batchIds = Array.isArray((folder as BatchFolder).batchIds)
          ? [...new Set((folder as BatchFolder).batchIds.map((value) => String(value)).filter(Boolean))]
          : [];
        if (!id || !name) return null;
        const parentId = typeof (folder as BatchFolder).parentId === "string" && (folder as BatchFolder).parentId ? String((folder as BatchFolder).parentId) : null;
        const order = Number.isFinite(Number((folder as BatchFolder).order)) ? Number((folder as BatchFolder).order) : index;
        return { id, name, batchIds, createdAt: String((folder as BatchFolder).createdAt || new Date().toISOString()), parentId, order };
      })
      .filter((folder): folder is BatchFolder => Boolean(folder));
  } catch {
    return [];
  }
}

function writeBatchFolders(folders: BatchFolder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(batchFoldersStorageKey, JSON.stringify(folders));
}

function sortBatchFolders(folders: BatchFolder[]) {
  return [...folders].sort((left, right) => {
    const orderDelta = (left.order || 0) - (right.order || 0);
    if (orderDelta) return orderDelta;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function folderDepth(folder: BatchFolder, folders: BatchFolder[]) {
  let depth = 0;
  let parentId = folder.parentId;
  const seen = new Set<string>([folder.id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = folders.find((item) => item.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId;
  }
  return Math.min(depth, 4);
}

function isFolderDescendant(folderId: string, possibleAncestorId: string, folders: BatchFolder[]) {
  let current = folders.find((folder) => folder.id === folderId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === possibleAncestorId) return true;
    seen.add(current.id);
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function flattenBatchFolderTree(folders: BatchFolder[]) {
  const byParent = new Map<string, BatchFolder[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId || "root";
    byParent.set(parentKey, [...(byParent.get(parentKey) || []), folder]);
  }
  for (const [key, items] of byParent) byParent.set(key, sortBatchFolders(items));
  const output: BatchFolder[] = [];
  const visit = (parentId: string | null, seen: Set<string>) => {
    for (const folder of byParent.get(parentId || "root") || []) {
      if (seen.has(folder.id)) continue;
      output.push(folder);
      visit(folder.id, new Set([...seen, folder.id]));
    }
  };
  visit(null, new Set());
  for (const folder of sortBatchFolders(folders)) {
    if (!output.some((item) => item.id === folder.id)) output.push({ ...folder, parentId: null });
  }
  return output;
}

function readSelectedProblemIds() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(selectedProblemsStorageKey) || "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.map((value) => String(value)).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function writeSelectedProblemIds(ids: string[]) {
  if (typeof window === "undefined") return;
  if (!ids.length) {
    window.sessionStorage.removeItem(selectedProblemsStorageKey);
    return;
  }
  window.sessionStorage.setItem(selectedProblemsStorageKey, JSON.stringify([...new Set(ids)]));
}

function readPageParam(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function readReviewFilter(value: string | null): ReviewFilter {
  if (value === "true") return "needs";
  if (value === "false") return "reviewed";
  return defaultReviewFilter;
}

function readSort(value: string | null): ProblemSort {
  return sortOptions.some((option) => option.value === value) ? (value as ProblemSort) : "source_order";
}

function difficultyTone(value?: string | null) {
  const normalized = (value || "").trim();
  if (normalized === "하") return { label: "하", color: "#34d399", badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" };
  if (normalized === "중") return { label: "중", color: "#fbbf24", badge: "border-amber-300/25 bg-amber-400/10 text-amber-100" };
  if (normalized === "상") return { label: "상", color: "#fb7185", badge: "border-rose-300/25 bg-rose-400/10 text-rose-100" };
  if (normalized === "최상") return { label: "최상", color: "#ef4444", badge: "border-red-300/25 bg-red-500/12 text-red-100" };
  return { label: "미지정", color: "#64748b", badge: "border-slate-400/20 bg-slate-400/10 text-slate-300" };
}

function normalizeHexColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function problemAccentColor(problem: Problem, fallback: string) {
  return normalizeHexColor(problem.batch_accent_color) || fallback;
}

function pageLabel(problem: Problem) {
  return problem.review_page_number ? `${problem.review_page_number}p` : "페이지 미상";
}

function problemTypeLabel(problem: Problem) {
  return problem.tags?.problem_type || "유형 미지정";
}

function sourceLabel(problem: Problem) {
  return problem.tags?.source || problem.source_label || "출처 없음";
}

function stopInteractiveEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

function ProblemSubjectFolderBoard({
  nodes,
  selectedSubjects,
  onToggleSubject,
  onAddSubject,
}: {
  nodes: SubjectNode[];
  selectedSubjects: string[];
  onToggleSubject: (subject: string) => void;
  onAddSubject: (subject: string) => void;
}) {
  const [openParent, setOpenParent] = useState("");
  const [newRoot, setNewRoot] = useState("");
  const [newChild, setNewChild] = useState("");

  useEffect(() => {
    if (!nodes.length) {
      setOpenParent("");
      return;
    }
    if (!openParent || !nodes.some((node) => (node.value || node.label) === openParent)) {
      setOpenParent(nodes[0].value || nodes[0].label);
    }
  }, [nodes, openParent]);

  function addRoot() {
    const subject = normalizeSubjectValue(newRoot);
    if (!subject) return;
    onAddSubject(subject);
    setOpenParent(subject);
    setNewRoot("");
  }

  function addChild(parent: SubjectNode) {
    const subject = normalizeSubjectValue(makeSubjectPathValue(parent.value || parent.label, newChild));
    if (!subject) return;
    onAddSubject(subject);
    setOpenParent(parent.value || parent.label);
    setNewChild("");
  }

  return (
    <div className="overflow-x-auto pb-1 [scrollbar-color:#2f3543_transparent] [scrollbar-width:thin]">
      <div className="flex min-w-max gap-3">
        {nodes.map((node) => {
          const nodeKey = node.value || node.label;
          const isOpen = openParent === nodeKey;
          const parentSelected = Boolean(node.value && selectedSubjects.includes(node.value));
          const parentRowVisible = parentSelected || !node.children?.length;
          return (
            <div key={nodeKey} className="w-52 shrink-0 rounded-md border border-white/10 bg-black/15 p-2">
              <button
                type="button"
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-xs font-bold transition-colors",
                  isOpen ? "border-[#7F77DD] bg-[#7F77DD]/18 text-white" : "border-white/10 bg-card/70 text-slate-300 hover:bg-accent"
                )}
                onClick={() => setOpenParent(isOpen ? "" : nodeKey)}
              >
                <span className="truncate">{node.label}</span>
              </button>
              {isOpen ? (
                <div className="mt-2 space-y-1.5">
                  {parentRowVisible && node.value ? (
                    <ProblemSubjectRow
                      label={node.label}
                      value={node.value}
                      selected={selectedSubjects.includes(node.value)}
                      onToggle={onToggleSubject}
                    />
                  ) : null}
                  {node.children?.map((child) => {
                    const value = normalizeSubjectValue(child.value || child.label);
                    return (
                      <ProblemSubjectRow
                        key={value}
                        label={child.label}
                        value={value}
                        selected={selectedSubjects.includes(value)}
                        onToggle={onToggleSubject}
                      />
                    );
                  })}
                  <div className="flex items-center gap-1 rounded-md border border-dashed border-white/12 bg-white/[0.025] p-1.5">
                    <span className="px-1 text-sm font-bold text-slate-400">+</span>
                    <Input
                      className="h-8 min-w-0 border-white/10 bg-black/25 text-xs"
                      value={newChild}
                      onChange={(event) => setNewChild(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addChild(node);
                        }
                      }}
                      placeholder="하위항목"
                    />
                    <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => addChild(node)}>+</Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="w-52 shrink-0 rounded-md border border-dashed border-white/15 bg-black/15 p-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-white/10 bg-card/70 px-2 text-xs font-bold text-slate-300">
            <span className="text-sm">+</span>
            <span>상위항목</span>
          </div>
          <div className="mt-2 flex gap-1">
            <Input
              className="h-8 min-w-0 border-white/10 bg-black/25 text-xs"
              value={newRoot}
              onChange={(event) => setNewRoot(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addRoot();
                }
              }}
              placeholder="상위항목"
            />
            <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={addRoot}>+</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProblemSubjectRow({
  label,
  value,
  selected,
  onToggle,
}: {
  label: string;
  value: string;
  selected: boolean;
  onToggle: (subject: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn("flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors", selected ? "border-[#7F77DD] bg-[#7F77DD] text-white" : "border-white/10 bg-card/70 hover:bg-accent")}
      onClick={() => onToggle(value)}
    >
      <span className="text-slate-500">-</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function ProblemsBrowser() {
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [data, setData] = useState<ProblemPage>({ items: [], total: 0, page: 1, limit: 24, pages: 1 });
  const [facets, setFacets] = useState<Facets>({ subjects: [], units: [], sources: [], visibilities: [], origin_types: [] });
  const [batches, setBatches] = useState<Batch[]>([]);
  const [koreanPassages, setKoreanPassages] = useState<KoreanReviewPassageItem[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [unit, setUnit] = useState(() => searchParams.get("unit") || "");
  const [subjects, setSubjects] = useState<string[]>(() => searchParams.getAll("subject"));
  const [customSubjectFilters, setCustomSubjectFilters] = useState<string[]>([]);
  const [selectedDiffs, setSelectedDiffs] = useState<string[]>(() => searchParams.getAll("difficulty"));
  const [selectedBatchId, setSelectedBatchId] = useState(() => searchParams.get("batch_id") || "");
  const [selectedBatchFolderId, setSelectedBatchFolderId] = useState(() => searchParams.get("batch_folder_id") || "");
  const [batchFolders, setBatchFolders] = useState<BatchFolder[]>([]);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [batchFolderContextMenu, setBatchFolderContextMenu] = useState<BatchFolderContextMenu>(null);
  const [batchFolderDrag, setBatchFolderDrag] = useState<BatchFolderDragState | null>(null);
  const batchFolderDragRef = useRef<BatchFolderDragState | null>(null);
  const folderDragSuppressClickRef = useRef(false);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  const [folderDropMode, setFolderDropMode] = useState<BatchFolderDropTarget["mode"] | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(() => readReviewFilter(searchParams.get("needs_review")));
  const [sort, setSort] = useState<ProblemSort>(() => readSort(searchParams.get("sort")));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(() => readPageParam(searchParams.get("page")));
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readSelectedProblemIds());
  const [selectedProblemCache, setSelectedProblemCache] = useState<Record<string, Problem>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [quickExportOpen, setQuickExportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState("");
  const [duplicateNotice, setDuplicateNotice] = useState("");
  const [randomCount, setRandomCount] = useState("10");
  const [randomSelecting, setRandomSelecting] = useState(false);
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [suppressClick, setSuppressClick] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const loadRequestRef = useRef(0);
  const activeBatchFolderDragKey = batchFolderDrag ? `${batchFolderDrag.folderId}:${batchFolderDrag.pointerId}` : "";

  function setBatchFolderDragState(nextDrag: BatchFolderDragState | null) {
    batchFolderDragRef.current = nextDrag;
    setBatchFolderDrag(nextDrag);
  }

  useEffect(() => {
    api<Facets>("/api/problems/facets").then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    api<Batch[]>("/api/batches").then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(viewModeStorageKey);
    if (saved === "grid" || saved === "list") setViewMode(saved);
    setCustomSubjectFilters(readSubjectList(customSubjectFiltersStorageKey));
    setBatchFolders(readBatchFolders());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(viewModeStorageKey, viewMode);
  }, [viewMode]);

  useEffect(() => {
    writeSelectedProblemIds(selectedIds);
  }, [selectedIds]);

  useEffect(() => {
    if (!selectedIds.length && duplicateNotice.includes("랜덤 추출")) {
      setDuplicateNotice("");
    }
  }, [duplicateNotice, selectedIds.length]);

  useEffect(() => {
    if (!batchFolderDrag?.isDragging) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [batchFolderDrag?.isDragging]);

  useEffect(() => {
    if (!activeBatchFolderDragKey) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const current = batchFolderDragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5;
      const nextDrag = { ...current, x: event.clientX, y: event.clientY, isDragging: current.isDragging || moved };
      setBatchFolderDragState(nextDrag);
      if (!nextDrag.isDragging) return;
      event.preventDefault();
      setResolvedFolderDropTarget(resolveBatchFolderDropTarget(event.clientX + archiveDragHotspotOffset.x, event.clientY + archiveDragHotspotOffset.y, current.folderId, current.kind));
    };

    const finishDrag = (event: globalThis.PointerEvent) => {
      const current = batchFolderDragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (current.isDragging) {
        event.preventDefault();
        const target = resolveBatchFolderDropTarget(event.clientX + archiveDragHotspotOffset.x, event.clientY + archiveDragHotspotOffset.y, current.folderId, current.kind);
        if (target) applyBatchExplorerDrop(current, target);
        folderDragSuppressClickRef.current = true;
        window.setTimeout(() => {
          folderDragSuppressClickRef.current = false;
        }, 0);
      }
      setBatchFolderDragState(null);
      setFolderDropTargetId(null);
      setFolderDropMode(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag, { passive: false });
    window.addEventListener("pointercancel", finishDrag, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
    // Keep the pointer listeners stable while live drag coordinates update through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatchFolderDragKey, batchFolders]);

  useEffect(() => {
    if (!batchFolderContextMenu) return;
    const closeMenu = () => setBatchFolderContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [batchFolderContextMenu]);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setUnit(searchParams.get("unit") || "");
    setSubjects(searchParams.getAll("subject"));
    setSelectedDiffs(searchParams.getAll("difficulty"));
    setSelectedBatchId(searchParams.get("batch_id") || "");
    setSelectedBatchFolderId(searchParams.get("batch_folder_id") || "");
    setReviewFilter(readReviewFilter(searchParams.get("needs_review")));
    setSort(readSort(searchParams.get("sort")));
    setPage(readPageParam(searchParams.get("page")));
  }, [paramsKey]);

  const selectedBatchFolder = useMemo(() => batchFolders.find((folder) => folder.id === selectedBatchFolderId) || null, [batchFolders, selectedBatchFolderId]);
  const visibleBatchFolders = useMemo(() => flattenBatchFolderTree(batchFolders), [batchFolders]);
  const assignedBatchIds = useMemo(() => new Set(batchFolders.flatMap((folder) => folder.batchIds)), [batchFolders]);
  const displayedBatches = useMemo(() => {
    if (selectedBatchFolder) return batches.filter((batch) => selectedBatchFolder.batchIds.includes(batch.id));
    return batches.filter((batch) => !assignedBatchIds.has(batch.id));
  }, [assignedBatchIds, batches, selectedBatchFolder]);
  const selectedFolderBatchIds = useMemo(() => selectedBatchFolder?.batchIds.filter((batchId) => batches.some((batch) => batch.id === batchId)) || [], [batches, selectedBatchFolder]);
  const contextMenuBatchFolder = useMemo(() => batchFolders.find((folder) => folder.id === batchFolderContextMenu?.folderId) || null, [batchFolderContextMenu, batchFolders]);

  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    const searchTerm = search.trim();
    if (searchTerm) params.set("search", searchTerm);
    if (unit.trim()) params.set("unit", unit.trim());
    if (reviewFilter === "needs") params.set("needs_review", "true");
    if (reviewFilter === "reviewed") params.set("needs_review", "false");
    if (sort !== "source_order") params.set("sort", sort);
    if (selectedBatchFolderId) params.set("batch_folder_id", selectedBatchFolderId);
    if (selectedFolderBatchIds.length) {
      selectedFolderBatchIds.forEach((batchId) => params.append("batch_ids", batchId));
    } else if (selectedBatchFolderId) {
      params.append("batch_ids", "00000000-0000-0000-0000-000000000000");
    } else if (selectedBatchId) {
      params.set("batch_id", selectedBatchId);
    }
    subjects.forEach((value) => params.append("subject", value));
    selectedDiffs.forEach((value) => params.append("difficulty", value));
    return params.toString();
  }, [reviewFilter, search, selectedBatchFolderId, selectedBatchId, selectedDiffs, selectedFolderBatchIds, sort, subjects, unit]);

  const query = useMemo(() => {
    const params = new URLSearchParams(filterQuery);
    params.set("page", String(page));
    params.set("limit", "24");
    return params.toString();
  }, [filterQuery, page]);

  const detailContextQuery = useMemo(() => {
    const params = new URLSearchParams(filterQuery);
    if (page > 1) params.set("page", String(page));
    return params.toString();
  }, [filterQuery, page]);

  async function loadProblems(requestQuery = query) {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    try {
      const nextData = await api<ProblemPage>(`/api/problems?${requestQuery}`);
      if (requestId === loadRequestRef.current) setData(nextData);
      return nextData;
    } catch (error) {
      if (requestId === loadRequestRef.current) setData(emptyProblemPage);
      throw error;
    }
  }

  useEffect(() => {
    loadProblems(query).catch(() => undefined);
  }, [query]);

  useEffect(() => {
    if (!data.items.length) return;
    setSelectedProblemCache((current) => {
      let changed = false;
      const next = { ...current };
      for (const problem of data.items) {
        if (next[problem.id] !== problem) {
          next[problem.id] = problem;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [data.items]);

  const selectedProblems = useMemo(
    () => selectedIds.map((id) => selectedProblemCache[id]).filter((problem): problem is Problem => Boolean(problem)),
    [selectedIds, selectedProblemCache]
  );

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) || null, [batches, selectedBatchId]);
  const subjectTree = useMemo(() => buildSubjectTree([...facets.subjects, ...customSubjectFilters, ...subjects]), [customSubjectFilters, facets.subjects, subjects]);
  const visibleKoreanPassages = useMemo(
    () => koreanPassages.filter((passage) => reviewFilter === "all" || (reviewFilter === "needs" ? passage.needs_review : !passage.needs_review)),
    [koreanPassages, reviewFilter],
  );

  useEffect(() => {
    const isLanguageBatch = selectedBatch?.subject_engine === "korean" || selectedBatch?.subject_engine === "english";
    if (!selectedBatchId || selectedBatchFolderId || !isLanguageBatch) {
      setKoreanPassages([]);
      return;
    }
    let cancelled = false;
    api<KoreanReviewItemsResponse>(`/api/batches/${selectedBatchId}/korean/review-items`)
      .then((response) => {
        if (cancelled) return;
        setKoreanPassages(response.items.filter((item): item is KoreanReviewPassageItem => item.item_type === "passage"));
      })
      .catch(() => {
        if (!cancelled) setKoreanPassages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatch?.subject_engine, selectedBatchFolderId, selectedBatchId]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (selectedBatchFolderId) chips.push({ key: "batch-folder", label: `폴더: ${selectedBatchFolder?.name || "배치 폴더"}`, onRemove: () => setSelectedBatchFolderId("") });
    if (!selectedBatchFolderId && selectedBatchId) chips.push({ key: "batch", label: `배치: ${selectedBatch?.name || selectedBatchId.slice(0, 8)}`, onRemove: () => setSelectedBatchId("") });
    if (search.trim()) chips.push({ key: "search", label: `검색: ${search.trim()}`, onRemove: () => setSearch("") });
    if (unit.trim()) chips.push({ key: "unit", label: `단원: ${unit.trim()}`, onRemove: () => setUnit("") });
    subjects.forEach((value) => chips.push({ key: `subject-${value}`, label: `과목: ${subjectDisplayLabel(value)}`, onRemove: () => setSubjects(subjects.filter((item) => item !== value)) }));
    selectedDiffs.forEach((value) => chips.push({ key: `difficulty-${value}`, label: `난이도: ${value}`, onRemove: () => setSelectedDiffs(selectedDiffs.filter((item) => item !== value)) }));
    if (reviewFilter !== "all") chips.push({ key: "review", label: reviewFilter === "needs" ? "검토 필요" : "검토 완료", onRemove: () => setReviewFilter("all") });
    return chips;
  }, [reviewFilter, search, selectedBatch, selectedBatchFolder, selectedBatchFolderId, selectedBatchId, selectedDiffs, subjects, unit]);

  function resetPageAnd(run: () => void) {
    loadRequestRef.current += 1;
    setPage(1);
    run();
  }

  function toggle(value: string, list: string[], setList: (next: string[]) => void) {
    resetPageAnd(() => setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]));
  }

  function toggleSubjectValue(value: string) {
    const subject = normalizeSubjectValue(value);
    if (!subject) return;
    resetPageAnd(() => setSubjects(subjects.includes(subject) ? subjects.filter((item) => item !== subject) : [...subjects, subject]));
  }

  function addCustomSubjectFilter(subjectValue: string) {
    const subject = normalizeSubjectValue(subjectValue);
    if (!subject) return;
    resetPageAnd(() => {
      setSubjects(subjects.includes(subject) ? subjects : [...subjects, subject]);
      setCustomSubjectFilters((current) => {
        const next = current.includes(subject) ? current : [...current, subject];
        writeSubjectList(customSubjectFiltersStorageKey, next);
        return next;
      });
    });
  }

  function persistBatchFolders(nextFolders: BatchFolder[]) {
    setBatchFolders(nextFolders);
    writeBatchFolders(nextFolders);
  }

  function selectAllBatches() {
    resetPageAnd(() => {
      setSelectedBatchId("");
      setSelectedBatchFolderId("");
    });
  }

  function selectBatch(batchId: string) {
    resetPageAnd(() => {
      setSelectedBatchFolderId("");
      setSelectedBatchId(selectedBatchId === batchId ? "" : batchId);
    });
  }

  function selectBatchFolder(folderId: string) {
    resetPageAnd(() => {
      setSelectedBatchId("");
      setSelectedBatchFolderId(selectedBatchFolderId === folderId ? "" : folderId);
    });
  }

  function createBatchFolder() {
    const name = folderNameDraft.trim();
    if (!name) return;
    const folder: BatchFolder = {
      id: `folder-${Date.now()}`,
      name,
      batchIds: selectedBatchId ? [selectedBatchId] : [],
      createdAt: new Date().toISOString(),
      parentId: selectedBatchFolderId || null,
      order: batchFolders.filter((item) => (item.parentId || null) === (selectedBatchFolderId || null)).length,
    };
    persistBatchFolders([...batchFolders, folder]);
    setFolderNameDraft("");
    resetPageAnd(() => {
      setSelectedBatchId("");
      setSelectedBatchFolderId(folder.id);
    });
  }

  function deleteBatchFolder(folderId: string) {
    const childIds = new Set(batchFolders.filter((folder) => folder.parentId === folderId).map((folder) => folder.id));
    persistBatchFolders(batchFolders.filter((folder) => folder.id !== folderId).map((folder) => (childIds.has(folder.id) ? { ...folder, parentId: null } : folder)));
    setBatchFolderContextMenu(null);
    if (selectedBatchFolderId === folderId) {
      resetPageAnd(() => setSelectedBatchFolderId(""));
    }
  }

  function clearBatchFolder(folderId: string) {
    persistBatchFolders(batchFolders.map((folder) => (folder.id === folderId ? { ...folder, batchIds: [] } : folder)));
    setBatchFolderContextMenu(null);
    if (selectedBatchFolderId === folderId) {
      resetPageAnd(() => setSelectedBatchFolderId(folderId));
    }
  }

  function handleBatchFolderContextMenu(event: MouseEvent, folderId: string) {
    event.preventDefault();
    setBatchFolderContextMenu({ folderId, x: event.clientX, y: event.clientY });
  }

  function moveBatchFolder(folderId: string, targetParentId: string | null, beforeFolderId?: string) {
    if (folderId === targetParentId) return;
    if (targetParentId && isFolderDescendant(targetParentId, folderId, batchFolders)) return;
    const moving = batchFolders.find((folder) => folder.id === folderId);
    if (!moving) return;
    const normalizedParentId = targetParentId || null;
    const siblings = sortBatchFolders(batchFolders.filter((folder) => folder.id !== folderId && (folder.parentId || null) === normalizedParentId));
    const insertIndex = beforeFolderId ? Math.max(0, siblings.findIndex((folder) => folder.id === beforeFolderId)) : siblings.length;
    const nextSiblings = [...siblings.slice(0, insertIndex), { ...moving, parentId: normalizedParentId }, ...siblings.slice(insertIndex)];
    const orderById = new Map(nextSiblings.map((folder, index) => [folder.id, index]));
    persistBatchFolders(batchFolders.map((folder) => {
      if (folder.id === folderId) return { ...folder, parentId: normalizedParentId, order: orderById.get(folder.id) ?? 0 };
      if ((folder.parentId || null) === normalizedParentId && orderById.has(folder.id)) return { ...folder, order: orderById.get(folder.id) ?? folder.order };
      return folder;
    }));
  }

  function moveBatchToRoot(batchId: string) {
    persistBatchFolders(batchFolders.map((folder) => ({ ...folder, batchIds: folder.batchIds.filter((id) => id !== batchId) })));
  }

  function moveBatchToFolder(batchId: string, folderId: string) {
    persistBatchFolders(batchFolders.map((folder) => {
      const batchIds = folder.batchIds.filter((id) => id !== batchId);
      if (folder.id !== folderId) return { ...folder, batchIds };
      return { ...folder, batchIds: [...batchIds, batchId] };
    }));
  }

  function moveBatchToBatchTarget(batchId: string, targetBatchId: string) {
    if (batchId === targetBatchId) return;
    const targetOwner = batchFolders.find((folder) => folder.batchIds.includes(targetBatchId));
    if (targetOwner) {
      moveBatchToFolder(batchId, targetOwner.id);
      return;
    }
    const targetBatch = batches.find((batch) => batch.id === targetBatchId);
    const draggedBatch = batches.find((batch) => batch.id === batchId);
    if (!targetBatch || !draggedBatch) return;
    const parentId = selectedBatchFolderId || null;
    const newFolder: BatchFolder = {
      id: `folder-${Date.now()}`,
      name: targetBatch.name,
      batchIds: [targetBatchId, batchId],
      createdAt: new Date().toISOString(),
      parentId,
      order: batchFolders.filter((folder) => (folder.parentId || null) === parentId).length,
    };
    const cleanedFolders = batchFolders.map((folder) => ({ ...folder, batchIds: folder.batchIds.filter((id) => id !== batchId && id !== targetBatchId) }));
    persistBatchFolders([...cleanedFolders, newFolder]);
  }

  function moveFolderToBatchTarget(folderId: string, targetBatchId: string) {
    const targetOwner = batchFolders.find((folder) => folder.batchIds.includes(targetBatchId));
    if (targetOwner) {
      moveBatchFolder(folderId, targetOwner.id);
      return;
    }
    const targetBatch = batches.find((batch) => batch.id === targetBatchId);
    if (!targetBatch) return;
    const parentId = selectedBatchFolderId || null;
    const newFolderId = `folder-${Date.now()}`;
    const newFolder: BatchFolder = {
      id: newFolderId,
      name: targetBatch.name,
      batchIds: [targetBatchId],
      createdAt: new Date().toISOString(),
      parentId,
      order: batchFolders.filter((folder) => (folder.parentId || null) === parentId).length,
    };
    const cleanedFolders = batchFolders.map((folder) => {
      if (folder.id === folderId) return { ...folder, parentId: newFolderId };
      return { ...folder, batchIds: folder.batchIds.filter((id) => id !== targetBatchId) };
    });
    persistBatchFolders([...cleanedFolders, newFolder]);
  }

  function applyBatchExplorerDrop(drag: BatchFolderDragState, target: BatchFolderDropTarget) {
    if (drag.kind === "folder") {
      if (target.mode === "batch" && target.targetBatchId) {
        moveFolderToBatchTarget(drag.folderId, target.targetBatchId);
        return;
      }
      moveBatchFolder(drag.folderId, target.parentId, target.beforeFolderId);
      return;
    }
    if (target.mode === "root") {
      moveBatchToRoot(drag.folderId);
      return;
    }
    if (target.mode === "batch" && target.targetBatchId) {
      moveBatchToBatchTarget(drag.folderId, target.targetBatchId);
      return;
    }
    if (target.parentId) moveBatchToFolder(drag.folderId, target.parentId);
  }

  function resolveBatchFolderDropTarget(clientX: number, clientY: number, draggedId: string, draggedKind: BatchFolderDragState["kind"]): BatchFolderDropTarget | null {
    if (typeof document === "undefined") return null;
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const folderElement = element?.closest("[data-batch-folder-id]") as HTMLElement | null;
    if (folderElement) {
      const targetId = folderElement.dataset.batchFolderId || "";
      if (!targetId) return null;
      if (draggedKind === "batch") return { parentId: targetId, markerId: targetId, mode: "inside" };
      if (targetId === draggedId || isFolderDescendant(targetId, draggedId, batchFolders)) return null;
      const targetFolder = batchFolders.find((folder) => folder.id === targetId);
      if (!targetFolder) return null;
      const rect = folderElement.getBoundingClientRect();
      const dropBefore = clientY - rect.top < rect.height * 0.28;
      if (dropBefore) {
        return { parentId: targetFolder.parentId || null, beforeFolderId: targetId, markerId: targetId, mode: "before" };
      }
      return { parentId: targetId, markerId: targetId, mode: "inside" };
    }
    const batchElement = element?.closest("[data-batch-card-id]") as HTMLElement | null;
    if (batchElement) {
      const targetBatchId = batchElement.dataset.batchCardId || "";
      if (!targetBatchId || (draggedKind === "batch" && targetBatchId === draggedId)) return null;
      return { parentId: null, targetBatchId, markerId: `batch:${targetBatchId}`, mode: "batch" };
    }
    if (element?.closest("[data-batch-folder-root]") || element?.closest("[data-batch-folder-grid]")) {
      return { parentId: null, markerId: "root", mode: "root" };
    }
    return null;
  }

  function setResolvedFolderDropTarget(target: BatchFolderDropTarget | null) {
    setFolderDropTargetId(target?.markerId || null);
    setFolderDropMode(target?.mode || null);
  }

  function beginBatchFolderPointerDrag(event: PointerEvent<HTMLButtonElement>, folder: BatchFolder, batchCount: number, problemCount: number) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-folder-action]")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const previewWidth = Math.min(Math.max(rect.width, 220), 320);
    const grabRatio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const grabY = Math.max(12, Math.min(rect.height - 12, event.clientY - rect.top));
    setBatchFolderDragState({
      kind: "folder",
      folderId: folder.id,
      name: folder.name,
      batchCount,
      problemCount,
      pointerId: event.pointerId,
      grabX: Math.max(24, Math.min(previewWidth - 24, grabRatio * previewWidth)),
      grabY,
      previewWidth,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      isDragging: false,
    });
    setResolvedFolderDropTarget(null);
  }

  function beginBatchPointerDrag(event: PointerEvent<HTMLButtonElement>, batch: Batch) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-folder-action]")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const previewWidth = Math.min(Math.max(rect.width, 220), 320);
    const grabRatio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const grabY = Math.max(12, Math.min(rect.height - 12, event.clientY - rect.top));
    setBatchFolderDragState({
      kind: "batch",
      folderId: batch.id,
      name: batch.name,
      batchCount: 1,
      problemCount: batch.problem_count,
      pointerId: event.pointerId,
      grabX: Math.max(24, Math.min(previewWidth - 24, grabRatio * previewWidth)),
      grabY,
      previewWidth,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      isDragging: false,
    });
    setResolvedFolderDropTarget(null);
  }

  function toggleBatchInSelectedFolder(batchId: string) {
    if (!selectedBatchFolder) return;
    const nextFolders = batchFolders.map((folder) => {
      if (folder.id !== selectedBatchFolder.id) return folder;
      const hasBatch = folder.batchIds.includes(batchId);
      return {
        ...folder,
        batchIds: hasBatch ? folder.batchIds.filter((id) => id !== batchId) : [...folder.batchIds, batchId],
      };
    });
    persistBatchFolders(nextFolders);
  }

  function toggleProblemSelection(problem: Problem, checked?: boolean) {
    setSelectedProblemCache((current) => (current[problem.id] ? current : { ...current, [problem.id]: problem }));
    setSelectedIds((current) => {
      const problemId = problem.id;
      const shouldSelect = checked ?? !current.includes(problemId);
      if (shouldSelect) return current.includes(problemId) ? current : [...current, problemId];
      return current.filter((id) => id !== problemId);
    });
  }

  function handleProblemBlockClick(problem: Problem) {
    if (suppressClick) return;
    toggleProblemSelection(problem);
  }

  function handleProblemBlockKeyDown(event: KeyboardEvent<HTMLElement>, problem: Problem) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleProblemBlockClick(problem);
  }

  async function deleteSelectedProblems() {
    if (!selectedIds.length || deleting) return;
    const ok = window.confirm(`선택한 문항 ${selectedIds.length}개를 삭제할까요? 문항 세트에서도 함께 빠집니다.`);
    if (!ok) return;
    setDeleting(true);
    try {
      const response = await api<{ deleted_count: number }>("/api/problems/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_ids: selectedIds }),
      });
      const deletedIds = new Set(selectedIds);
      setData((current) => ({
        ...current,
        items: current.items.filter((problem) => !deletedIds.has(problem.id)),
        total: Math.max(0, current.total - response.deleted_count),
      }));
      setSelectedIds([]);
      setSelectedProblemCache((current) => {
        const next = { ...current };
        deletedIds.forEach((id) => delete next[id]);
        return next;
      });
      await loadProblems();
    } catch {
      window.alert("선택한 문항을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
    }
  }

  async function duplicateProblem(problem: Problem) {
    if (duplicatingId) return;
    setDuplicatingId(problem.id);
    setDuplicateNotice("");
    try {
      const duplicated = await api<Problem>(`/api/problems/${problem.id}/duplicate`, { method: "POST" });
      setSelectedProblemCache((current) => ({ ...current, [duplicated.id]: duplicated }));
      setDuplicateNotice("문항을 복제했습니다.");
      await loadProblems();
    } catch {
      window.alert("문항을 복제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDuplicatingId("");
    }
  }

  async function selectRandomProblems() {
    if (randomSelecting) return;
    const count = Math.max(1, Math.min(500, Number.parseInt(randomCount, 10) || 0));
    if (!count) {
      window.alert("랜덤 추출할 문항 개수를 입력해주세요.");
      return;
    }
    setRandomSelecting(true);
    setDuplicateNotice("");
    try {
      const params = new URLSearchParams(filterQuery);
      params.set("count", String(count));
      const response = await api<{ items: Problem[]; total: number; requested: number }>(`/api/problems/random?${params.toString()}`);
      if (!response.items.length) {
        window.alert("현재 검색 조건에 맞는 문항이 없습니다.");
        return;
      }
      setSelectedProblemCache((current) => {
        const next = { ...current };
        for (const problem of response.items) next[problem.id] = problem;
        return next;
      });
      setSelectedIds(response.items.map((problem) => problem.id));
      setDuplicateNotice(`${response.items.length}개 문항을 랜덤 추출했습니다.`);
    } catch {
      window.alert("문항을 랜덤 추출하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setRandomSelecting(false);
    }
  }

  function selectCardsInBox(box: DragBox) {
    const list = listRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const selectionRect = {
      left: listRect.left + box.left,
      right: listRect.left + box.left + box.width,
      top: listRect.top + box.top,
      bottom: listRect.top + box.top + box.height
    };
    const nextIds = data.items
      .filter((problem) => {
        const element = cardRefs.current[problem.id];
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.left < selectionRect.right && rect.right > selectionRect.left && rect.top < selectionRect.bottom && rect.bottom > selectionRect.top;
      })
      .map((problem) => problem.id);
    const visibleIds = new Set(data.items.map((problem) => problem.id));
    setSelectedIds((current) => {
      const preservedIds = current.filter((id) => !visibleIds.has(id));
      return [...preservedIds, ...nextIds];
    });
  }

  function updateDragBox(currentX: number, currentY: number) {
    const list = listRef.current;
    const start = dragStartRef.current;
    if (!list || !start) return;
    const rect = list.getBoundingClientRect();
    const startX = start.x - rect.left;
    const startY = start.y - rect.top;
    const endX = currentX - rect.left;
    const endY = currentY - rect.top;
    const left = Math.max(0, Math.min(startX, endX));
    const top = Math.max(0, Math.min(startY, endY));
    const right = Math.min(rect.width, Math.max(startX, endX));
    const bottom = Math.min(rect.height, Math.max(startY, endY));
    const box = { left, top, width: right - left, height: bottom - top };
    setDragBox(box);
    selectCardsInBox(box);
  }

  function startDragSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    setDragBox(null);
    setIsDragSelecting(false);
  }

  function moveDragSelection(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 8 && !isDragSelecting) return;
    if (!isDragSelecting) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragSelecting(true);
      setSuppressClick(true);
    }
    updateDragBox(event.clientX, event.clientY);
  }

  function endDragSelection(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;
    if (isDragSelecting) {
      updateDragBox(event.clientX, event.clientY);
      window.setTimeout(() => setSuppressClick(false), 0);
    }
    dragStartRef.current = null;
    setIsDragSelecting(false);
    setDragBox(null);
  }

  function renderKoreanPassageCard(passage: KoreanReviewPassageItem) {
    return (
      <article key={passage.id} className="rounded-lg border border-sky-300/20 bg-sky-400/[0.045] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/70">Korean Passage</div>
            <h3 className="mt-1 line-clamp-1 text-sm font-bold text-slate-100">
              {passage.passage_title || passage.passage_instruction || "국어 지문"}
            </h3>
          </div>
          <span className={cn("shrink-0 rounded border px-2 py-1 text-[11px] font-semibold", passage.needs_review ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100")}>
            {passage.needs_review ? "검토 필요" : "검토 완료"}
          </span>
        </div>
        <MathText className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300" value={passage.passage_text || "지문 본문이 비어 있습니다."} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
          {passage.review_page_number ? <span>{passage.review_page_number}p</span> : null}
          <span>{passage.linked_questions.length.toLocaleString("ko-KR")}문항 연결</span>
          {passage.passage_type ? <span>{passage.passage_type}</span> : null}
        </div>
      </article>
    );
  }

  function renderProblemCard(problem: Problem) {
    const selected = selectedIds.includes(problem.id);
    const tone = difficultyTone(problem.tags?.difficulty);
    const accentColor = problemAccentColor(problem, tone.color);
    const showSubject = subjects.length === 0 && problem.tags?.subject;
    const detailHref = `/problems/${problem.id}${detailContextQuery ? `?${detailContextQuery}` : ""}`;
    return (
      <article
        key={problem.id}
        ref={(element) => { cardRefs.current[problem.id] = element; }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${problem.problem_number}번 문항 ${selected ? "선택 해제" : "선택"}`}
        onClick={() => handleProblemBlockClick(problem)}
        onKeyDown={(event) => handleProblemBlockKeyDown(event, problem)}
        className={cn(
          "group relative min-h-[215px] cursor-pointer overflow-hidden rounded-lg border bg-card/80 transition-all hover:-translate-y-0.5 hover:border-[#7F77DD]/70 hover:shadow-[0_18px_45px_rgba(76,29,149,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F77DD]/70",
          selected ? "border-[#7F77DD] bg-[#7F77DD]/10 shadow-[0_0_0_1px_rgba(127,119,221,0.24)]" : "border-white/10"
        )}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: accentColor }} />
        <Link
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/30 text-slate-300 backdrop-blur transition hover:border-[#7F77DD]/60 hover:bg-[#7F77DD]/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F77DD]/70"
          href={detailHref}
          draggable={false}
          onPointerDown={stopInteractiveEvent}
          onClick={(event) => {
            stopInteractiveEvent(event);
            if (suppressClick) event.preventDefault();
          }}
          aria-label={`${problem.problem_number}번 상세 보기`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          className="absolute right-3 top-12 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/30 text-slate-300 backdrop-blur transition hover:border-[#7F77DD]/60 hover:bg-[#7F77DD]/15 hover:text-white disabled:cursor-wait disabled:opacity-60"
          onPointerDown={stopInteractiveEvent}
          onClick={(event) => {
            stopInteractiveEvent(event);
            void duplicateProblem(problem);
          }}
          disabled={duplicatingId === problem.id}
          aria-label={`${problem.problem_number}번 문항 복제`}
          title="문항 복제"
        >
          <Copy className="h-4 w-4" />
        </button>
        <div className="flex h-full flex-col px-4 pb-4 pl-6 pr-12 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="line-clamp-1 text-[11px] font-medium leading-4 text-muted-foreground">{sourceLabel(problem)}</div>
            </div>
            {!problem.tags?.difficulty ? <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold", tone.badge)}>미지정</span> : null}
          </div>

          <MathText className="mt-3 line-clamp-4 text-[14px] font-medium leading-[1.55] text-foreground" value={problem.problem_text} />

          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-[11px] font-medium text-muted-foreground">
            {showSubject ? <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-slate-300">{problem.tags?.subject}</span> : null}
            <span>{pageLabel(problem)}</span>
            <span className="text-slate-600">·</span>
            <span>{problemTypeLabel(problem)}</span>
            {problem.has_visual ? (
              <>
                <span className="text-slate-600">·</span>
                <span>이미지 포함</span>
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderProblemRow(problem: Problem) {
    const selected = selectedIds.includes(problem.id);
    const tone = difficultyTone(problem.tags?.difficulty);
    const accentColor = problemAccentColor(problem, tone.color);
    const detailHref = `/problems/${problem.id}${detailContextQuery ? `?${detailContextQuery}` : ""}`;
    return (
      <article
        key={problem.id}
        ref={(element) => { cardRefs.current[problem.id] = element; }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${problem.problem_number}번 문항 ${selected ? "선택 해제" : "선택"}`}
        onClick={() => handleProblemBlockClick(problem)}
        onKeyDown={(event) => handleProblemBlockKeyDown(event, problem)}
        className={cn(
          "relative cursor-pointer overflow-hidden rounded-lg border bg-card/80 transition-colors hover:border-[#7F77DD]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F77DD]/70",
          selected ? "border-[#7F77DD] bg-[#7F77DD]/10" : "border-white/10"
        )}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: accentColor }} />
        <div className="grid min-h-[66px] grid-cols-[minmax(0,1fr)_auto_auto_36px_36px] items-start gap-3 py-3 pl-6 pr-3">
          <div className="min-w-0">
            <div className="mb-0.5 line-clamp-1 text-[11px] font-medium text-muted-foreground">{sourceLabel(problem)}</div>
            <MathText className="line-clamp-1 text-[14px] font-medium leading-[1.45] text-foreground" value={problem.problem_text} />
          </div>
          <div className="whitespace-nowrap pt-1 text-[11px] font-medium text-muted-foreground">
            {pageLabel(problem)} · {problemTypeLabel(problem)}{problem.has_visual ? " · 이미지" : ""}
          </div>
          <span className={cn("whitespace-nowrap rounded border px-2 py-1 text-[11px] font-semibold", tone.badge)}>{tone.label}</span>
          <Link
            href={detailHref}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/20 text-slate-300 transition hover:border-[#7F77DD]/60 hover:bg-[#7F77DD]/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F77DD]/70"
            draggable={false}
            onPointerDown={stopInteractiveEvent}
            onClick={(event) => {
              stopInteractiveEvent(event);
              if (suppressClick) event.preventDefault();
            }}
            aria-label={`${problem.problem_number}번 상세 보기`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/20 text-slate-300 transition hover:border-[#7F77DD]/60 hover:bg-[#7F77DD]/15 hover:text-white disabled:cursor-wait disabled:opacity-60"
            onPointerDown={stopInteractiveEvent}
            onClick={(event) => {
              stopInteractiveEvent(event);
              void duplicateProblem(problem);
            }}
            disabled={duplicatingId === problem.id}
            aria-label={`${problem.problem_number}번 문항 복제`}
            title="문항 복제"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      <section className="forge-panel rounded-lg p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_auto] xl:items-center">
          <div className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-card/80 px-3 xl:max-w-4xl">
            <Search className="h-4 w-4 shrink-0 text-[#7F77DD]" />
            <Input
              className="min-w-0 border-0 bg-transparent px-0 text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
              placeholder="본문, 번호, 정답, 태그, 출처 검색"
              value={search}
              onChange={(event) => resetPageAnd(() => setSearch(event.target.value))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm">
              <span className="text-muted-foreground">문항</span>
              <span className="font-semibold text-foreground">{data.total.toLocaleString("ko-KR")}개</span>
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300">
              정렬
              <select
                className="bg-transparent text-sm font-semibold text-foreground outline-none"
                value={sort}
                onChange={(event) => resetPageAnd(() => setSort(event.target.value as ProblemSort))}
              >
                {sortOptions.map((option) => <option key={option.value} value={option.value} className="bg-background text-foreground">{option.label}</option>)}
              </select>
            </label>
            <div className="flex h-9 rounded-md border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                className={cn("inline-flex items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors", viewMode === "grid" ? "bg-[#7F77DD] text-white" : "text-muted-foreground hover:bg-white/[0.06] hover:text-white")}
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="h-3.5 w-3.5" />격자
              </button>
              <button
                type="button"
                className={cn("inline-flex items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors", viewMode === "list" ? "bg-[#7F77DD] text-white" : "text-muted-foreground hover:bg-white/[0.06] hover:text-white")}
                onClick={() => setViewMode("list")}
              >
                <List className="h-3.5 w-3.5" />목록
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {duplicateNotice ? (
            <span className="inline-flex h-7 items-center rounded-md border border-emerald-300/25 bg-emerald-400/10 px-2 text-xs font-semibold text-emerald-100">
              {duplicateNotice}
            </span>
          ) : null}
          {activeFilterChips.length ? activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#7F77DD]/25 bg-[#7F77DD]/10 px-2 text-xs font-semibold text-violet-100 transition-colors hover:bg-[#7F77DD]/15"
              onClick={() => resetPageAnd(chip.onRemove)}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          )) : <span className="text-xs text-muted-foreground">적용된 필터 없음</span>}
          <div className="ml-auto flex h-8 items-center overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
            <label className="flex h-full items-center gap-1.5 border-r border-white/10 px-2 text-xs font-semibold text-slate-300">
              랜덤
              <Input
                type="number"
                min={1}
                max={500}
                value={randomCount}
                onChange={(event) => setRandomCount(event.target.value)}
                className="h-6 w-14 border-white/10 bg-black/20 px-1.5 text-center text-xs font-bold"
                aria-label="랜덤 추출 문항 개수"
              />
              개
            </label>
            <button
              type="button"
              className="inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={selectRandomProblems}
              disabled={randomSelecting || !data.total}
            >
              <Shuffle className="h-3.5 w-3.5" />
              추출
            </button>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            필터 {filtersOpen ? "접기" : "펼치기"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", filtersOpen && "rotate-180")} />
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-card/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Batch folders</div>
              <h2 className="mt-1 text-sm font-bold text-foreground">문항 아카이브 폴더</h2>
            </div>
            <div className="flex min-w-[16rem] flex-1 items-center gap-2 sm:flex-none">
              <Input
                className="h-9 min-w-0 border-white/10 bg-black/20 text-sm"
                value={folderNameDraft}
                onChange={(event) => setFolderNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createBatchFolder();
                  }
                }}
                placeholder="새 폴더 이름"
              />
              <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={createBatchFolder}>
                <FolderPlus className="h-4 w-4" />새 폴더
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]" data-batch-folder-grid="true">
            <button
              type="button"
              data-batch-folder-root="true"
              className={cn(
                "flex min-h-[82px] items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                !selectedBatchId && !selectedBatchFolderId ? "border-[#7F77DD]/70 bg-[#7F77DD]/16 text-white" : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                folderDropTargetId === "root" && "border-sky-300/70 bg-sky-400/12"
              )}
              onClick={selectAllBatches}
            >
              <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-[#9b8cff]" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">전체 문항</span>
                <span className="mt-1 block text-xs text-muted-foreground">{data.total.toLocaleString("ko-KR")}개 표시</span>
              </span>
            </button>

            {visibleBatchFolders.map((folder) => {
              const selected = selectedBatchFolderId === folder.id;
              const folderBatches = folder.batchIds.map((batchId) => batches.find((batch) => batch.id === batchId)).filter((batch): batch is Batch => Boolean(batch));
              const problemCount = folderBatches.reduce((sum, batch) => sum + batch.problem_count, 0);
              const depth = folderDepth(folder, batchFolders);
              const dropping = folderDropTargetId === folder.id;
              const draggingThisFolder = batchFolderDrag?.kind === "folder" && batchFolderDrag.folderId === folder.id && batchFolderDrag.isDragging;
              return (
                <button
                  key={folder.id}
                  type="button"
                  data-batch-folder-id={folder.id}
                  className={cn(
                    "group flex min-h-[82px] cursor-grab items-start gap-3 rounded-lg border p-3 text-left transition-colors active:cursor-grabbing",
                    selected ? "border-[#7F77DD]/70 bg-[#7F77DD]/16 text-white" : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                    draggingThisFolder && "scale-[0.98] opacity-35",
                    dropping && folderDropMode === "inside" && "border-sky-300/70 bg-sky-400/12",
                    dropping && folderDropMode === "before" && "border-sky-300/70 shadow-[inset_0_4px_0_rgba(125,211,252,0.85)]"
                  )}
                  style={{ marginLeft: depth ? `${depth * 18}px` : undefined }}
                  onClick={(event) => {
                    if (folderDragSuppressClickRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    selectBatchFolder(folder.id);
                  }}
                  onContextMenu={(event) => handleBatchFolderContextMenu(event, folder.id)}
                  onPointerDown={(event) => beginBatchFolderPointerDrag(event, folder, folderBatches.length, problemCount)}
                >
                  <Folder className="mt-0.5 h-5 w-5 shrink-0 text-[#8be9ff]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{folder.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{folderBatches.length}개 배치 · {problemCount.toLocaleString("ko-KR")}문항</span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    data-folder-action
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 text-slate-400 opacity-0 transition hover:text-white group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteBatchFolder(folder.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      deleteBatchFolder(folder.id);
                    }}
                    aria-label={`${folder.name} 폴더 삭제`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}

            {displayedBatches.map((batch) => {
              const selected = selectedBatchId === batch.id && !selectedBatchFolderId;
              const inSelectedFolder = selectedBatchFolder?.batchIds.includes(batch.id) || false;
              const accentColor = normalizeHexColor(batch.accent_color) || "#64748b";
              const droppingBatch = folderDropTargetId === `batch:${batch.id}`;
              const draggingThisBatch = batchFolderDrag?.kind === "batch" && batchFolderDrag.folderId === batch.id && batchFolderDrag.isDragging;
              return (
                <button
                  key={batch.id}
                  type="button"
                  data-batch-card-id={batch.id}
                  className={cn(
                    "group flex min-h-[82px] cursor-grab items-start gap-3 rounded-lg border p-3 text-left transition-colors active:cursor-grabbing",
                    selected ? "border-[#7F77DD]/70 bg-[#7F77DD]/16 text-white" : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                    draggingThisBatch && "scale-[0.98] opacity-35",
                    droppingBatch && folderDropMode === "batch" && "border-sky-300/70 bg-sky-400/12"
                  )}
                  onClick={(event) => {
                    if (folderDragSuppressClickRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    selectBatch(batch.id);
                  }}
                  onPointerDown={(event) => beginBatchPointerDrag(event, batch)}
                >
                  <span className="relative mt-0.5 shrink-0">
                    <Folder className="h-5 w-5" style={{ color: accentColor }} />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#111022]" style={{ backgroundColor: accentColor }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{batch.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{batch.problem_count.toLocaleString("ko-KR")}문항</span>
                  </span>
                  {selectedBatchFolder ? (
                    <span
                      role="button"
                      tabIndex={0}
                      data-folder-action
                      className={cn(
                        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition",
                        inSelectedFolder ? "border-rose-300/25 bg-rose-500/10 text-rose-100" : "border-white/10 bg-black/20 text-slate-300 opacity-0 group-hover:opacity-100"
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleBatchInSelectedFolder(batch.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        toggleBatchInSelectedFolder(batch.id);
                      }}
                      aria-label={`${batch.name} ${inSelectedFolder ? "폴더에서 제거" : "폴더에 추가"}`}
                    >
                      {inSelectedFolder ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {batchFolderDrag?.isDragging ? (
          <div
            className="pointer-events-none fixed z-[120]"
            style={{
              left: batchFolderDrag.x + archiveDragHotspotOffset.x - batchFolderDrag.grabX,
              top: batchFolderDrag.y + archiveDragHotspotOffset.y - batchFolderDrag.grabY,
              width: batchFolderDrag.previewWidth,
            }}
          >
            <div className="w-full rounded-xl border border-sky-300/55 bg-[#111022]/95 p-3 text-left text-slate-100 shadow-[0_22px_65px_rgba(0,0,0,0.52)] backdrop-blur">
              <div className="flex items-start gap-3">
                <Folder className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{batchFolderDrag.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {batchFolderDrag.batchCount.toLocaleString("ko-KR")}개 배치 · {batchFolderDrag.problemCount.toLocaleString("ko-KR")}문항
                  </div>
                </div>
              </div>
              {folderDropMode ? (
                <div className="mt-2 rounded-md border border-sky-300/20 bg-sky-400/10 px-2 py-1 text-[11px] font-semibold text-sky-100">
                  {folderDropMode === "inside" ? "폴더 안에 넣기" : folderDropMode === "before" ? "이 위치로 이동" : "최상위로 이동"}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {batchFolderContextMenu && contextMenuBatchFolder ? (
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-lg border border-white/10 bg-[#111022]/98 p-1 shadow-[0_18px_45px_rgba(0,0,0,0.38)] backdrop-blur"
            style={{ left: batchFolderContextMenu.x, top: batchFolderContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => {
                selectBatchFolder(contextMenuBatchFolder.id);
                setBatchFolderContextMenu(null);
              }}
            >
              <FolderOpen className="h-4 w-4 text-[#9b8cff]" />
              열기
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => clearBatchFolder(contextMenuBatchFolder.id)}
            >
              <Minus className="h-4 w-4 text-slate-400" />
              폴더 비우기
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-rose-100 transition hover:bg-rose-500/10"
              onClick={() => deleteBatchFolder(contextMenuBatchFolder.id)}
            >
              <Trash2 className="h-4 w-4" />
              폴더 삭제
            </button>
          </div>
        ) : null}

        {filtersOpen ? (
          <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-black/15 p-3">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium">과목</label>
                <ProblemSubjectFolderBoard
                  nodes={subjectTree}
                  selectedSubjects={subjects}
                  onToggleSubject={toggleSubjectValue}
                  onAddSubject={addCustomSubjectFilter}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">난이도</label>
                <div className="flex flex-wrap gap-2 rounded-md border border-white/10 bg-card/50 p-2">
                  {difficulties.map((difficulty) => {
                    const tone = difficultyTone(difficulty);
                    return (
                      <label key={difficulty} className={cn("flex items-center gap-2 rounded-md border px-2 py-1 text-sm", selectedDiffs.includes(difficulty) ? tone.badge : "border-white/10 bg-card/70")}>
                        <input type="checkbox" checked={selectedDiffs.includes(difficulty)} onChange={() => toggle(difficulty, selectedDiffs, setSelectedDiffs)} />
                        {difficulty}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">단원</label>
                <Input
                  value={unit}
                  onChange={(event) => resetPageAnd(() => setUnit(event.target.value))}
                  placeholder="단원 검색"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">검토 상태</label>
              <div className="flex w-fit rounded-md border border-white/10 bg-card/70 p-1">
                {reviewFilters.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn("rounded px-3 py-1.5 text-sm font-medium transition-colors", reviewFilter === option.value ? "bg-[#7F77DD] text-white shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                    onClick={() => resetPageAnd(() => setReviewFilter(option.value))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {selectedIds.length > 0 ? (
        <div className="sticky top-[121px] z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#7F77DD]/30 bg-[#111022]/95 px-4 py-3 shadow-[0_18px_45px_rgba(30,22,64,0.32)] backdrop-blur lg:top-[65px]">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-100">
            <CheckSquare className="h-4 w-4 text-[#7F77DD]" />
            {selectedIds.length}개 선택됨
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setAddModalOpen(true)}><FolderPlus className="h-4 w-4" />세트에 담기</Button>
            <Button size="sm" variant="outline" onClick={() => setQuickExportOpen(true)}><Send className="h-4 w-4" />바로 내보내기</Button>
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4" />미리보기</Button>
            <Button size="sm" variant="destructive" disabled={deleting} onClick={deleteSelectedProblems}><Trash2 className="h-4 w-4" />삭제</Button>
            <button type="button" className="px-2 text-sm font-semibold text-slate-400 hover:text-white" onClick={() => setSelectedIds([])}>선택 해제</button>
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        <div
          ref={listRef}
          className="relative select-none lg:-ml-24 lg:pl-24"
          onPointerDown={startDragSelection}
          onPointerMove={moveDragSelection}
          onPointerUp={endDragSelection}
          onPointerCancel={endDragSelection}
        >
          {dragBox && (
            <div
              className="pointer-events-none absolute z-20 rounded-md border border-[#7F77DD] bg-[#7F77DD]/15"
              style={{ left: dragBox.left, top: dragBox.top, width: dragBox.width, height: dragBox.height }}
            />
          )}
          {visibleKoreanPassages.length ? (
            <div className="mb-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visibleKoreanPassages.map(renderKoreanPassageCard)}
            </div>
          ) : null}
          <div className={cn(viewMode === "grid" ? "grid gap-3 md:grid-cols-2 2xl:grid-cols-3" : "space-y-2")}>
            {data.items.map((problem) => viewMode === "grid" ? renderProblemCard(problem) : renderProblemRow(problem))}
          </div>
        </div>

        {!data.items.length && !visibleKoreanPassages.length && (
          <div className="forge-panel rounded-lg py-16 text-center text-muted-foreground">
            조건에 맞는 문항이 없습니다.
            <div className="mt-4"><Link href="/upload"><Button>PDF 업로드</Button></Link></div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ChevronLeft className="h-4 w-4" />이전
          </Button>
          <span className="text-sm text-muted-foreground">{data.page} / {data.pages}</span>
          <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>
            다음<ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <AddToSetModal open={addModalOpen} onOpenChange={setAddModalOpen} problemIds={selectedIds} />
      <ExportModal
        open={quickExportOpen}
        onOpenChange={setQuickExportOpen}
        source="selection"
        problemIds={selectedIds}
        count={selectedIds.length}
      />
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl bg-[#0b0d12] text-slate-100">
          <div>
            <h2 className="text-lg font-semibold">선택 문항 미리보기</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selectedIds.length}개 문항</p>
          </div>
          <div className="mt-4 max-h-[68vh] space-y-3 overflow-auto pr-1">
            {selectedProblems.map((problem) => {
              const tone = difficultyTone(problem.tags?.difficulty);
              const accentColor = problemAccentColor(problem, tone.color);
              return (
                <article key={problem.id} className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-4 pl-5">
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: accentColor }} />
                  <div className="mb-2 flex items-center justify-end gap-3">
                    <span className={cn("rounded border px-2 py-1 text-[11px] font-semibold", tone.badge)}>{tone.label}</span>
                  </div>
                  <MathText className="text-[14px] leading-[1.55] text-foreground" value={problem.problem_text} />
                  <div className="mt-3 text-[11px] font-medium text-muted-foreground">{sourceLabel(problem)} · {pageLabel(problem)} · {problemTypeLabel(problem)}</div>
                </article>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProblemsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted-foreground">문항을 불러오는 중입니다.</div>}>
      <ProblemsBrowser />
    </Suspense>
  );
}
