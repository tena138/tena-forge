"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ProblemSet, ProblemSetListItem, ProblemUsageHistoryItem, ProblemUsageHistoryResponse } from "@/lib/api";

function usageLabel(item: ProblemUsageHistoryItem) {
  if (item.usage_type === "export") {
    return item.export_title ? `시험지: ${item.export_title}` : "시험지 내보내기";
  }
  return item.problem_set_name ? `세트: ${item.problem_set_name}` : "세트 추가 기록";
}

export function AddToSetModal({
  open,
  onOpenChange,
  problemIds,
  onDone
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemIds: string[];
  onDone?: () => void;
}) {
  const [sets, setSets] = useState<ProblemSetListItem[]>([]);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [usageByProblem, setUsageByProblem] = useState<Record<string, ProblemUsageHistoryItem[]>>({});
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => {
    if (open) api<ProblemSetListItem[]>("/api/problem-sets").then(setSets).catch(() => setSets([]));
  }, [open]);

  useEffect(() => {
    if (!open || !problemIds.length) {
      setUsageByProblem({});
      setUsageLoading(false);
      return;
    }
    let cancelled = false;
    setUsageLoading(true);
    api<ProblemUsageHistoryResponse>("/api/problem-sets/usage-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_ids: problemIds }),
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
  }, [open, problemIds]);

  const filtered = useMemo(() => sets.filter((set) => set.name.toLowerCase().includes(query.toLowerCase())), [query, sets]);
  const usedProblemCount = useMemo(() => problemIds.filter((problemId) => (usageByProblem[problemId] || []).length > 0).length, [problemIds, usageByProblem]);
  const recentUsages = useMemo(
    () => problemIds.flatMap((problemId) => usageByProblem[problemId] || []).slice(0, 3),
    [problemIds, usageByProblem]
  );

  function setUsageCount(setId: string) {
    return problemIds.filter((problemId) =>
      (usageByProblem[problemId] || []).some((item) => item.usage_type === "problem_set" && item.problem_set_id === setId)
    ).length;
  }

  async function addToExisting(setId: string) {
    setSaving(true);
    try {
      await api<ProblemSet>(`/api/problem-sets/${setId}/items/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_ids: problemIds })
      });
      onOpenChange(false);
      onDone?.();
      window.alert("선택한 문항을 세트에 추가했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function createSet() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api<ProblemSet>("/api/problem-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), problem_ids: problemIds })
      });
      setNewName("");
      onOpenChange(false);
      onDone?.();
      window.alert("새 문제 세트를 만들었습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">세트에 추가</h2>
          </div>
          {(usageLoading || usedProblemCount > 0) && (
            <div className="rounded-md border border-zinc-400/25 bg-zinc-400/10 p-3 text-sm text-zinc-100">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={usedProblemCount ? "warning" : "secondary"}>{usageLoading ? "사용 이력 확인 중" : `사용 이력 ${usedProblemCount}문항`}</Badge>
                {usedProblemCount > 0 && <span>이미 다른 세트나 시험지에 쓰인 문항이 포함되어 있습니다.</span>}
              </div>
              {recentUsages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {recentUsages.map((item) => (
                    <Badge key={item.id} variant="outline">{usageLabel(item)}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border bg-card/80 px-2">
            <Search className="h-4 w-4 text-primary" />
            <Input className="border-0 bg-transparent focus-visible:ring-0" placeholder="세트 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="max-h-56 space-y-2 overflow-auto">
            {filtered.map((set) => {
              const overlapCount = setUsageCount(set.id);
              return (
                <button key={set.id} className="flex w-full items-center justify-between gap-3 rounded-md border bg-card/70 p-3 text-left hover:bg-accent" disabled={saving} onClick={() => addToExisting(set.id)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{set.name}</span>
                    {overlapCount > 0 && <span className="mt-1 block text-xs text-zinc-200">선택 문항 중 {overlapCount}개가 이 세트에 기록되어 있습니다.</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    {overlapCount > 0 && <Badge variant="warning">기록 {overlapCount}</Badge>}
                    {set.item_count}문항
                  </span>
                </button>
              );
            })}
            {!filtered.length && <p className="py-6 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>}
          </div>
          <div className="rounded-md border bg-accent/35 p-3">
            <label className="text-sm font-medium">새 세트 만들기</label>
            <div className="mt-2 flex gap-2">
              <Input placeholder="세트 이름" value={newName} onChange={(event) => setNewName(event.target.value)} />
              <Button disabled={!newName.trim() || saving} onClick={createSet}><Plus className="h-4 w-4" />생성</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
