"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { closestCenter, DndContext, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock, FileDown, GripVertical, Plus, Save, Search, Trash2 } from "lucide-react";

import { ExportModal } from "@/components/export-modal";
import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, Problem, ProblemSet, ProblemSetItem, ProblemUsageHistoryItem, ProblemUsageHistoryResponse } from "@/lib/api";
import { PROBLEM_SET_EXPORT_HISTORY_EVENT, ProblemSetExportHistoryItem, readProblemSetExportHistory, rememberProblemSetExport } from "@/lib/exportHistory";

type ProblemPage = { items: Problem[]; total: number; page: number; limit: number; pages: number };
type Facets = { subjects: string[]; units: string[]; problem_types: string[]; sources: string[] };
const PICKER_PAGE_LIMIT = 96;

const difficulties = ["하", "중", "상", "최상"];

function exportHistoryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

function usageLabel(item: ProblemUsageHistoryItem) {
  if (item.usage_type === "export") {
    return item.export_title ? `시험지: ${item.export_title}` : "시험지 내보내기";
  }
  return item.problem_set_name ? `세트: ${item.problem_set_name}` : "세트 추가 기록";
}

function SortableRow({ item, returnHref, onRemove }: { item: ProblemSetItem; returnHref: string; onRemove: (problemId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.problem_id });
  const problemNumber = item.problem.problem_number;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="relative flex items-start gap-3 rounded-lg border bg-card/90 p-3 pr-24 shadow-sm">
      <button className="text-muted-foreground" {...attributes} {...listeners} aria-label="순서 이동">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{item.problem.tags?.source || `${item.problem.problem_number}번`}</span>
          <Badge variant="secondary">{item.problem.tags?.subject || "과목 미지정"}</Badge>
          {item.problem.tags?.unit && <Badge variant="outline">{item.problem.tags.unit}</Badge>}
        </div>
        <MathText className="mt-1 text-sm text-muted-foreground" clamp value={item.problem.problem_text.slice(0, 180)} />
      </div>
      <Button className="absolute right-12 top-3" size="icon" variant="ghost" onClick={() => onRemove(item.problem_id)} aria-label="세트에서 문항 제거">
        <Trash2 className="h-4 w-4" />
      </Button>
      <Link
        href={`/problems/${item.problem_id}?returnTo=${encodeURIComponent(returnHref)}`}
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/20 text-slate-300 transition hover:border-[#d4d4d8]/60 hover:bg-[#d4d4d8]/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4d4d8]/70"
        draggable={false}
        aria-label={`${problemNumber}번 상세 보기`}
        title="문항 상세보기"
      >
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function toggleValue(value: string, list: string[], setList: (next: string[]) => void) {
  setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
}

function ProblemPickerModal({
  open,
  onOpenChange,
  currentSetId,
  existingIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSetId: string;
  existingIds: string[];
  onAdd: (problemIds: string[]) => Promise<void>;
}) {
  const [data, setData] = useState<ProblemPage>({ items: [], total: 0, page: 1, limit: PICKER_PAGE_LIMIT, pages: 1 });
  const [facets, setFacets] = useState<Facets>({ subjects: [], units: [], problem_types: [], sources: [] });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<string[]>([]);
  const [needsReview, setNeedsReview] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usageByProblem, setUsageByProblem] = useState<Record<string, ProblemUsageHistoryItem[]>>({});
  const [usageLoading, setUsageLoading] = useState(false);

  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  function buildQuery(nextPage = page, limit = PICKER_PAGE_LIMIT) {
    const params = new URLSearchParams({ page: String(nextPage), limit: String(limit) });
    if (search.trim()) params.set("search", search.trim());
    if (unit.trim()) params.set("unit", unit.trim());
    if (needsReview) params.set("needs_review", "true");
    subjects.forEach((subject) => params.append("subject", subject));
    types.forEach((type) => params.append("problem_type", type));
    diffs.forEach((difficulty) => params.append("difficulty", difficulty));
    return params.toString();
  }

  async function loadProblems(nextPage = page) {
    setLoading(true);
    try {
      const nextData = await api<ProblemPage>(`/api/problems?${buildQuery(nextPage)}`);
      setData(nextData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    api<Facets>("/api/problems/facets").then(setFacets).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    loadProblems(page).catch(() => setData({ items: [], total: 0, page: 1, limit: PICKER_PAGE_LIMIT, pages: 1 }));
  }, [open, page, search, unit, needsReview, subjects, types, diffs]);

  useEffect(() => {
    if (!open || !data.items.length) {
      setUsageByProblem({});
      setUsageLoading(false);
      return;
    }
    let cancelled = false;
    setUsageLoading(true);
    api<ProblemUsageHistoryResponse>("/api/problem-sets/usage-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem_ids: data.items.map((problem) => problem.id),
        exclude_problem_set_id: currentSetId,
      }),
    })
      .then((result) => {
        if (!cancelled) setUsageByProblem(result.histories || {});
      })
      .catch(() => {
        if (!cancelled) setUsageByProblem({});
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, data.items, currentSetId]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setSearch("");
    setUnit("");
    setSubjects([]);
    setTypes([]);
    setDiffs([]);
    setNeedsReview(false);
    setSelectedIds([]);
  }, [open]);

  function resetFilters() {
    setPage(1);
    setSearch("");
    setUnit("");
    setSubjects([]);
    setTypes([]);
    setDiffs([]);
    setNeedsReview(false);
  }

  function toggle(problemId: string) {
    if (existing.has(problemId)) return;
    setSelectedIds((current) => (current.includes(problemId) ? current.filter((id) => id !== problemId) : [...current, problemId]));
  }

  function selectCurrentPage() {
    const ids = data.items.filter((problem) => !existing.has(problem.id)).map((problem) => problem.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
  }

  async function addSelected() {
    if (!selectedIds.length) return;
    setSaving(true);
    try {
      await onAdd(selectedIds);
      setSelectedIds([]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function addAllMatching() {
    setSaving(true);
    try {
      const collected: string[] = [];
      const totalPages = Math.max(1, Math.ceil(data.total / 100));
      for (let nextPage = 1; nextPage <= totalPages; nextPage += 1) {
        const pageData = await api<ProblemPage>(`/api/problems?${buildQuery(nextPage, 100)}`);
        pageData.items.forEach((problem) => {
          if (!existing.has(problem.id)) collected.push(problem.id);
        });
      }
      const unique = Array.from(new Set(collected));
      if (unique.length) await onAdd(unique);
      setSelectedIds([]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const availableOnPage = data.items.filter((problem) => !existing.has(problem.id)).length;
  const usedOnPage = data.items.filter((problem) => (usageByProblem[problem.id] || []).length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!h-[88vh] !max-h-[88vh] !w-[96vw] !max-w-[1500px] !overflow-hidden !p-0">
        <div className="flex h-full min-h-0 flex-col gap-3 p-5">
          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">문항 추가</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                검색과 태그로 후보를 좁힌 뒤 현재 화면 또는 조건 전체를 한 번에 추가합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={selectCurrentPage} disabled={!availableOnPage || saving}>
                현재 화면 선택
              </Button>
              <Button variant="outline" onClick={addAllMatching} disabled={!data.total || saving}>
                조건 전체 추가
              </Button>
              <Button disabled={!selectedIds.length || saving} onClick={addSelected}>
                <Plus className="h-4 w-4" />선택 {selectedIds.length}개 추가
              </Button>
            </div>
          </div>

          <div className="grid shrink-0 gap-3 xl:grid-cols-[1.2fr_0.8fr_auto]">
            <div className="flex items-center gap-2 rounded-md border bg-card/80 px-2">
              <Search className="h-4 w-4 text-primary" />
              <Input
                className="border-0 bg-transparent focus-visible:ring-0"
                placeholder="문항 내용, 답, 출처 검색"
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
              />
            </div>
            <Input
              value={unit}
              onChange={(event) => {
                setPage(1);
                setUnit(event.target.value);
              }}
              placeholder="단원 검색"
            />
            <Button variant="outline" onClick={resetFilters}>필터 초기화</Button>
          </div>

          <div className="grid shrink-0 gap-3 xl:grid-cols-3">
            <FilterChips title="과목" options={facets.subjects} values={subjects} onToggle={(value) => { setPage(1); toggleValue(value, subjects, setSubjects); }} />
            <FilterChips title="난이도" options={difficulties} values={diffs} onToggle={(value) => { setPage(1); toggleValue(value, diffs, setDiffs); }} />
            <FilterChips title="문항 유형" options={facets.problem_types} values={types} onToggle={(value) => { setPage(1); toggleValue(value, types, setTypes); }} />
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border bg-card/60 px-3 py-2 text-sm">
            <span>
              조건 결과 {data.total.toLocaleString("ko-KR")}개 / 현재 화면 {data.items.length}개 / 선택 {selectedIds.length}개
              {usageLoading ? " / 사용 이력 확인 중" : usedOnPage > 0 ? ` / 사용 이력 ${usedOnPage}개` : ""}
            </span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={needsReview}
                onChange={(event) => {
                  setPage(1);
                  setNeedsReview(event.target.checked);
                }}
              />
              검토 필요만
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-black/10">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">문항을 불러오는 중입니다.</div>
            ) : data.items.length ? (
              <div className="grid gap-2 p-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {data.items.map((problem) => {
                  const alreadyAdded = existing.has(problem.id);
                  const selected = selectedIds.includes(problem.id);
                  const histories = usageByProblem[problem.id] || [];
                  const latestHistory = histories[0];
                  return (
                    <button
                      key={problem.id}
                      className={`flex min-h-[96px] w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "bg-card/70 hover:bg-accent"} ${alreadyAdded ? "opacity-55" : ""}`}
                      disabled={saving || alreadyAdded}
                      onClick={() => toggle(problem.id)}
                    >
                      <input className="mt-1 h-4 w-4" type="checkbox" checked={selected || alreadyAdded} disabled={alreadyAdded} readOnly />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{problem.tags?.source || `${problem.problem_number}번`}</span>
                          <Badge variant="secondary">{problem.tags?.subject || "과목 미지정"}</Badge>
                          <Badge variant="outline">{problem.tags?.unit || "단원 미지정"}</Badge>
                          <Badge variant="outline">{problem.tags?.difficulty || "난이도 미지정"}</Badge>
                          {alreadyAdded && <Badge variant="success">이미 추가됨</Badge>}
                          {histories.length > 0 && <Badge variant="warning">사용 이력 {histories.length}</Badge>}
                        </div>
                        {latestHistory && <p className="mt-1 truncate text-xs text-zinc-200">최근 {usageLabel(latestHistory)}</p>}
                        <MathText className="mt-1 text-sm text-muted-foreground" clamp value={problem.problem_text} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">조건에 맞는 문항이 없습니다.</div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t pt-3">
            <Button variant="outline" size="sm" disabled={page <= 1 || saving} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft className="h-4 w-4" />이전
            </Button>
            <span className="text-sm text-muted-foreground">{data.page} / {data.pages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.pages || saving} onClick={() => setPage((value) => value + 1)}>
              다음<ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChips({ title, options, values, onToggle }: { title: string; options: string[]; values: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="flex max-h-24 flex-wrap gap-2 overflow-auto rounded-md border bg-card/50 p-2">
        {options.length ? options.map((option) => (
          <button
            key={option}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${values.includes(option) ? "border-primary bg-primary text-primary-foreground" : "bg-card/70 hover:bg-accent"}`}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        )) : <span className="text-sm text-muted-foreground">태그 없음</span>}
      </div>
    </div>
  );
}

export default function ProblemSetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [problemSet, setProblemSet] = useState<ProblemSet | null>(null);
  const [name, setName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportHistory, setExportHistory] = useState<ProblemSetExportHistoryItem[]>([]);

  async function load() {
    const data = await api<ProblemSet>(`/api/problem-sets/${params.id}`);
    setProblemSet(data);
    setName(data.name);
  }

  useEffect(() => {
    load().catch(() => router.push("/problem-sets"));
  }, [params.id]);

  useEffect(() => {
    const refresh = () => setExportHistory(readProblemSetExportHistory(params.id));
    refresh();
    window.addEventListener(PROBLEM_SET_EXPORT_HISTORY_EVENT, refresh);
    return () => window.removeEventListener(PROBLEM_SET_EXPORT_HISTORY_EVENT, refresh);
  }, [params.id]);

  const ids = useMemo(() => problemSet?.items.map((item) => item.problem_id) || [], [problemSet]);
  const itemCount = problemSet?.items.length || 0;
  const problemSetReturnHref = `/problem-sets/${params.id}`;

  async function saveName() {
    if (!problemSet || !name.trim()) return;
    const updated = await api<ProblemSet>(`/api/problem-sets/${problemSet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setProblemSet(updated);
  }

  async function reorder(event: DragEndEvent) {
    if (!problemSet || event.active.id === event.over?.id || !event.over) return;
    const oldIndex = ids.indexOf(String(event.active.id));
    const newIndex = ids.indexOf(String(event.over.id));
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    const updated = await api<ProblemSet>(`/api/problem-sets/${problemSet.id}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_problem_ids: nextIds }),
    });
    setProblemSet(updated);
  }

  async function remove(problemId: string) {
    if (!problemSet) return;
    await api(`/api/problem-sets/${problemSet.id}/items/${problemId}`, { method: "DELETE" });
    await load();
  }

  async function addProblems(problemIds: string[]) {
    if (!problemSet || !problemIds.length) return;
    const updated = await api<ProblemSet>(`/api/problem-sets/${problemSet.id}/items/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_ids: problemIds }),
    });
    setProblemSet(updated);
  }

  if (!problemSet) return <div className="py-20 text-center text-muted-foreground">세트를 불러오는 중입니다.</div>;

  return (
    <div className="space-y-5 pb-24">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-muted-foreground">
              총 <strong className="text-white">{itemCount.toLocaleString("ko-KR")}</strong>문항
            </div>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
            <Button disabled={!name.trim() || name === problemSet.name} onClick={saveName}>
              <Save className="h-4 w-4" />저장
            </Button>
          </div>
          <DndContext collisionDetection={closestCenter} onDragEnd={reorder}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {problemSet.items.map((item) => <SortableRow key={item.id} item={item} returnHref={problemSetReturnHref} onRemove={remove} />)}
              </div>
            </SortableContext>
          </DndContext>
          {!problemSet.items.length && <div className="py-12 text-center text-muted-foreground">아직 세트에 문항이 없습니다.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-200" />
              <h2 className="text-base font-semibold text-white">최근 내보내기</h2>
            </div>
            <span className="text-xs text-muted-foreground">최근 {exportHistory.length}건</span>
          </div>
          {exportHistory.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {exportHistory.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{item.examTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{exportHistoryTime(item.exportedAt)}</p>
                    </div>
                    {item.output && <Badge variant="outline">{item.output}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{item.count}문항</Badge>
                    {item.templateTitle && <Badge variant="outline">{item.templateTitle}</Badge>}
                    <Badge variant={item.includeSolution ? "success" : "secondary"}>{item.includeSolution ? "답안 포함" : "문제만"}</Badge>
                    {item.includeMissingSolutionMetadata ? <Badge variant="outline">원본 위치 포함</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm text-muted-foreground">
              이 세트를 내보내면 여기에 자동으로 기록됩니다.
            </div>
          )}
        </CardContent>
      </Card>

      <ProblemPickerModal open={addOpen} onOpenChange={setAddOpen} currentSetId={problemSet.id} existingIds={ids} onAdd={addProblems} />
      <ExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        source="set"
        problemSetId={problemSet.id}
        count={problemSet.items.length}
        onExported={(item) => {
          rememberProblemSetExport({ ...item, problemSetId: problemSet.id, problemSetName: problemSet.name });
          setExportHistory(readProblemSetExportHistory(problemSet.id));
        }}
      />
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 sm:flex-row">
        <Button className="h-12 shadow-[0_18px_50px_rgba(0,0,0,0.34)]" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />문항 추가
        </Button>
        <Button className="h-12 shadow-[0_18px_50px_rgba(255,255,255,0.34)]" onClick={() => setExportOpen(true)}>
          <FileDown className="h-4 w-4" />내보내기
        </Button>
      </div>
    </div>
  );
}
