"use client";

import { Suspense, type PointerEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FolderPlus,
  Grid3X3,
  List,
  Search,
  Send,
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
import { api, Batch, Problem, sourceTypeLabel, sourceTypeOptions } from "@/lib/api";
import { cn } from "@/lib/utils";

type ProblemPage = { items: Problem[]; total: number; page: number; limit: number; pages: number };
type Facets = { subjects: string[]; units: string[]; problem_types: string[]; sources: string[]; source_types?: string[]; visibilities?: string[]; origin_types?: string[] };
type DragBox = { left: number; top: number; width: number; height: number };
type ReviewFilter = "all" | "needs" | "reviewed";
type ViewMode = "grid" | "list";
type ProblemSort = "source_order" | "newest" | "oldest" | "number_asc" | "number_desc";

const emptyProblemPage: ProblemPage = { items: [], total: 0, page: 1, limit: 24, pages: 1 };
const difficulties = ["하", "중", "상", "최상"];
const defaultReviewFilter: ReviewFilter = "reviewed";
const viewModeStorageKey = "tena.problemBrowser.viewMode";
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

function ProblemsBrowser() {
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const [data, setData] = useState<ProblemPage>({ items: [], total: 0, page: 1, limit: 24, pages: 1 });
  const [facets, setFacets] = useState<Facets>({ subjects: [], units: [], problem_types: [], sources: [], source_types: [], visibilities: [], origin_types: [] });
  const [batches, setBatches] = useState<Batch[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [unit, setUnit] = useState(() => searchParams.get("unit") || "");
  const [subjects, setSubjects] = useState<string[]>(() => searchParams.getAll("subject"));
  const [types, setTypes] = useState<string[]>(() => searchParams.getAll("problem_type"));
  const [selectedDiffs, setSelectedDiffs] = useState<string[]>(() => searchParams.getAll("difficulty"));
  const [selectedSourceTypes, setSelectedSourceTypes] = useState<string[]>(() => searchParams.getAll("source_type"));
  const [selectedBatchId, setSelectedBatchId] = useState(() => searchParams.get("batch_id") || "");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(() => readReviewFilter(searchParams.get("needs_review")));
  const [sort, setSort] = useState<ProblemSort>(() => readSort(searchParams.get("sort")));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(() => readPageParam(searchParams.get("page")));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedProblemCache, setSelectedProblemCache] = useState<Record<string, Problem>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [quickExportOpen, setQuickExportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [suppressClick, setSuppressClick] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    api<Facets>("/api/problems/facets").then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    api<Batch[]>("/api/batches").then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(viewModeStorageKey);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(viewModeStorageKey, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setUnit(searchParams.get("unit") || "");
    setSubjects(searchParams.getAll("subject"));
    setTypes(searchParams.getAll("problem_type"));
    setSelectedDiffs(searchParams.getAll("difficulty"));
    setSelectedSourceTypes(searchParams.getAll("source_type"));
    setSelectedBatchId(searchParams.get("batch_id") || "");
    setReviewFilter(readReviewFilter(searchParams.get("needs_review")));
    setSort(readSort(searchParams.get("sort")));
    setPage(readPageParam(searchParams.get("page")));
  }, [paramsKey]);

  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    const searchTerm = search.trim();
    if (searchTerm) params.set("search", searchTerm);
    if (unit.trim()) params.set("unit", unit.trim());
    if (reviewFilter === "needs") params.set("needs_review", "true");
    if (reviewFilter === "reviewed") params.set("needs_review", "false");
    if (sort !== "source_order") params.set("sort", sort);
    if (selectedBatchId) params.set("batch_id", selectedBatchId);
    subjects.forEach((value) => params.append("subject", value));
    types.forEach((value) => params.append("problem_type", value));
    selectedDiffs.forEach((value) => params.append("difficulty", value));
    selectedSourceTypes.forEach((value) => params.append("source_type", value));
    return params.toString();
  }, [reviewFilter, search, selectedBatchId, selectedDiffs, selectedSourceTypes, sort, subjects, types, unit]);

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

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (selectedBatchId) chips.push({ key: "batch", label: `배치: ${selectedBatch?.name || selectedBatchId.slice(0, 8)}`, onRemove: () => setSelectedBatchId("") });
    if (search.trim()) chips.push({ key: "search", label: `검색: ${search.trim()}`, onRemove: () => setSearch("") });
    if (unit.trim()) chips.push({ key: "unit", label: `단원: ${unit.trim()}`, onRemove: () => setUnit("") });
    subjects.forEach((value) => chips.push({ key: `subject-${value}`, label: `과목: ${value}`, onRemove: () => setSubjects(subjects.filter((item) => item !== value)) }));
    selectedDiffs.forEach((value) => chips.push({ key: `difficulty-${value}`, label: `난이도: ${value}`, onRemove: () => setSelectedDiffs(selectedDiffs.filter((item) => item !== value)) }));
    types.forEach((value) => chips.push({ key: `type-${value}`, label: `유형: ${value}`, onRemove: () => setTypes(types.filter((item) => item !== value)) }));
    selectedSourceTypes.forEach((value) => chips.push({ key: `source-${value}`, label: `출처: ${sourceTypeLabel(value)}`, onRemove: () => setSelectedSourceTypes(selectedSourceTypes.filter((item) => item !== value)) }));
    if (reviewFilter !== "all") chips.push({ key: "review", label: reviewFilter === "needs" ? "검토 필요" : "검토 완료", onRemove: () => setReviewFilter("all") });
    return chips;
  }, [reviewFilter, search, selectedBatch, selectedBatchId, selectedDiffs, selectedSourceTypes, subjects, types, unit]);

  function resetPageAnd(run: () => void) {
    setPage(1);
    run();
  }

  function toggle(value: string, list: string[], setList: (next: string[]) => void) {
    resetPageAnd(() => setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]));
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

  function renderProblemCard(problem: Problem) {
    const selected = selectedIds.includes(problem.id);
    const tone = difficultyTone(problem.tags?.difficulty);
    const accentColor = problemAccentColor(problem, tone.color);
    const showSubject = subjects.length === 0 && problem.tags?.subject;
    return (
      <article
        key={problem.id}
        ref={(element) => { cardRefs.current[problem.id] = element; }}
        className={cn(
          "group relative min-h-[215px] overflow-hidden rounded-lg border bg-card/80 transition-all hover:-translate-y-0.5 hover:border-[#7F77DD]/70 hover:shadow-[0_18px_45px_rgba(76,29,149,0.16)]",
          selected ? "border-[#7F77DD] bg-[#7F77DD]/10 shadow-[0_0_0_1px_rgba(127,119,221,0.24)]" : "border-white/10"
        )}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: accentColor }} />
        <label className="absolute left-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded border border-white/15 bg-black/30 backdrop-blur" onClick={stopInteractiveEvent} onPointerDown={stopInteractiveEvent}>
          <input
            className="h-4 w-4 accent-[#7F77DD]"
            type="checkbox"
            checked={selected}
            onChange={(event) => toggleProblemSelection(problem, event.target.checked)}
            aria-label={`${problem.problem_number}번 선택`}
          />
        </label>
        <Link
          className="flex h-full flex-col px-4 pb-4 pl-6 pt-3"
          href={`/problems/${problem.id}${detailContextQuery ? `?${detailContextQuery}` : ""}`}
          draggable={false}
          onClick={(event) => { if (suppressClick) event.preventDefault(); }}
        >
          <div className="flex items-start justify-between gap-3 pl-8">
            <div className="min-w-0">
              <div className="line-clamp-1 text-[11px] font-medium leading-4 text-muted-foreground">{sourceLabel(problem)}</div>
              <div className="mt-1 text-[13px] font-medium leading-5 text-slate-200">#{problem.problem_number}</div>
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
        </Link>
      </article>
    );
  }

  function renderProblemRow(problem: Problem) {
    const selected = selectedIds.includes(problem.id);
    const tone = difficultyTone(problem.tags?.difficulty);
    const accentColor = problemAccentColor(problem, tone.color);
    return (
      <article
        key={problem.id}
        ref={(element) => { cardRefs.current[problem.id] = element; }}
        className={cn(
          "relative overflow-hidden rounded-lg border bg-card/80 transition-colors hover:border-[#7F77DD]/70",
          selected ? "border-[#7F77DD] bg-[#7F77DD]/10" : "border-white/10"
        )}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: accentColor }} />
        <div className="grid min-h-[58px] grid-cols-[38px_70px_minmax(0,1fr)_auto_auto] items-center gap-3 py-2 pl-6 pr-4">
          <label className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/15 bg-black/20" onClick={stopInteractiveEvent} onPointerDown={stopInteractiveEvent}>
            <input
              className="h-4 w-4 accent-[#7F77DD]"
              type="checkbox"
              checked={selected}
              onChange={(event) => toggleProblemSelection(problem, event.target.checked)}
              aria-label={`${problem.problem_number}번 선택`}
            />
          </label>
          <Link href={`/problems/${problem.id}${detailContextQuery ? `?${detailContextQuery}` : ""}`} className="text-[13px] font-medium text-slate-200" onClick={(event) => { if (suppressClick) event.preventDefault(); }}>
            #{problem.problem_number}
          </Link>
          <Link href={`/problems/${problem.id}${detailContextQuery ? `?${detailContextQuery}` : ""}`} className="min-w-0" onClick={(event) => { if (suppressClick) event.preventDefault(); }}>
            <div className="mb-0.5 line-clamp-1 text-[11px] font-medium text-muted-foreground">{sourceLabel(problem)}</div>
            <MathText className="line-clamp-1 text-[14px] font-medium leading-[1.45] text-foreground" value={problem.problem_text} />
          </Link>
          <div className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
            {pageLabel(problem)} · {problemTypeLabel(problem)}{problem.has_visual ? " · 이미지" : ""}
          </div>
          <span className={cn("whitespace-nowrap rounded border px-2 py-1 text-[11px] font-semibold", tone.badge)}>{tone.label}</span>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      <section className="forge-panel rounded-lg p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">문항 브라우저</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.total.toLocaleString("ko-KR")}개 문항</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300">
              정렬
              <select
                className="bg-transparent text-sm font-semibold text-white outline-none"
                value={sort}
                onChange={(event) => resetPageAnd(() => setSort(event.target.value as ProblemSort))}
              >
                {sortOptions.map((option) => <option key={option.value} value={option.value} className="bg-[#111318] text-white">{option.label}</option>)}
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

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-card/80 px-2">
          <Search className="h-4 w-4 text-[#7F77DD]" />
          <Input
            className="border-0 bg-transparent focus-visible:ring-0"
            placeholder="본문, 번호, 정답, 태그, 출처 검색"
            value={search}
            onChange={(event) => resetPageAnd(() => setSearch(event.target.value))}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            필터 {filtersOpen ? "접기" : "펼치기"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", filtersOpen && "rotate-180")} />
          </button>
        </div>

        {filtersOpen ? (
          <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-black/15 p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">내가 올린 배치</label>
                {selectedBatchId ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-400 transition-colors hover:text-white"
                    onClick={() => resetPageAnd(() => setSelectedBatchId(""))}
                  >
                    선택 해제
                  </button>
                ) : null}
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-white/10 bg-card/50 p-2 [scrollbar-color:#2f3543_transparent] [scrollbar-width:thin]">
                {batches.length ? batches.map((batch) => {
                  const selected = selectedBatchId === batch.id;
                  const accentColor = normalizeHexColor(batch.accent_color) || "#64748b";
                  return (
                    <button
                      key={batch.id}
                      type="button"
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-3 rounded-[7px] border px-3 py-2 text-left transition-colors",
                        selected ? "border-[#7F77DD]/70 bg-[#7F77DD]/16 text-white" : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                      )}
                      onClick={() => resetPageAnd(() => setSelectedBatchId(selected ? "" : batch.id))}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{batch.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{batch.problem_count.toLocaleString("ko-KR")}문항 · {batch.status}</span>
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded border px-2 py-1 text-[11px] font-semibold", selected ? "border-violet-300/40 bg-violet-300/15 text-violet-100" : "border-white/10 bg-white/[0.04] text-slate-400")}>
                        {selected ? "선택됨" : "선택"}
                      </span>
                    </button>
                  );
                }) : <span className="block px-2 py-3 text-sm text-muted-foreground">업로드한 배치가 없습니다.</span>}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium">과목</label>
                <div className="flex max-h-24 flex-wrap gap-2 overflow-auto rounded-md border border-white/10 bg-card/50 p-2">
                  {facets.subjects.length ? facets.subjects.map((subject) => (
                    <button key={subject} className={cn("rounded-md border px-2 py-1 text-xs transition-colors", subjects.includes(subject) ? "border-[#7F77DD] bg-[#7F77DD] text-white" : "border-white/10 bg-card/70 hover:bg-accent")} onClick={() => toggle(subject, subjects, setSubjects)}>
                      {subject}
                    </button>
                  )) : <span className="text-sm text-muted-foreground">과목 태그 없음</span>}
                </div>
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

            <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <label className="text-sm font-medium">문항 유형</label>
                <div className="flex max-h-24 flex-wrap gap-2 overflow-auto rounded-md border border-white/10 bg-card/50 p-2">
                  {facets.problem_types.length ? facets.problem_types.map((type) => (
                    <button key={type} className={cn("rounded-md border px-2 py-1 text-xs transition-colors", types.includes(type) ? "border-[#7F77DD] bg-[#7F77DD] text-white" : "border-white/10 bg-card/70 hover:bg-accent")} onClick={() => toggle(type, types, setTypes)}>
                      {type}
                    </button>
                  )) : <span className="text-sm text-muted-foreground">유형 태그 없음</span>}
                </div>
              </div>

              <div className="space-y-2 xl:self-end">
                <label className="text-sm font-medium">검토 상태</label>
                <div className="flex rounded-md border border-white/10 bg-card/70 p-1">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">출처 유형</label>
              <div className="flex flex-wrap gap-2 rounded-md border border-white/10 bg-card/50 p-2">
                {sourceTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={cn("rounded-md border px-2 py-1 text-xs transition-colors", selectedSourceTypes.includes(option.value) ? "border-[#7F77DD] bg-[#7F77DD] text-white" : "border-white/10 bg-card/70 hover:bg-accent")}
                    onClick={() => toggle(option.value, selectedSourceTypes, setSelectedSourceTypes)}
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
          <div className={cn(viewMode === "grid" ? "grid gap-3 md:grid-cols-2 2xl:grid-cols-3" : "space-y-2")}>
            {data.items.map((problem) => viewMode === "grid" ? renderProblemCard(problem) : renderProblemRow(problem))}
          </div>
        </div>

        {!data.items.length && (
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
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[13px] font-medium text-slate-200">#{problem.problem_number}</div>
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
