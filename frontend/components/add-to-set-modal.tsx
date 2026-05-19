"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ProblemSet, ProblemSetListItem } from "@/lib/api";

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

  useEffect(() => {
    if (open) api<ProblemSetListItem[]>("/api/problem-sets").then(setSets).catch(() => setSets([]));
  }, [open]);

  const filtered = useMemo(() => sets.filter((set) => set.name.toLowerCase().includes(query.toLowerCase())), [query, sets]);

  async function addToExisting(setId: string) {
    setSaving(true);
    for (const problemId of problemIds) {
      await api<ProblemSet>(`/api/problem-sets/${setId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_id: problemId })
      });
    }
    setSaving(false);
    onOpenChange(false);
    onDone?.();
    window.alert("선택한 문항을 세트에 추가했습니다.");
  }

  async function createSet() {
    if (!newName.trim()) return;
    setSaving(true);
    await api<ProblemSet>("/api/problem-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), problem_ids: problemIds })
    });
    setSaving(false);
    setNewName("");
    onOpenChange(false);
    onDone?.();
    window.alert("새 문제 세트를 만들었습니다.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">세트에 추가</h2>
            <p className="mt-1 text-sm text-muted-foreground">선택한 {problemIds.length}개 문항을 기존 세트에 추가하거나 새 세트로 저장합니다.</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card/80 px-2">
            <Search className="h-4 w-4 text-primary" />
            <Input className="border-0 bg-transparent focus-visible:ring-0" placeholder="세트 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="max-h-56 space-y-2 overflow-auto">
            {filtered.map((set) => (
              <button key={set.id} className="flex w-full items-center justify-between rounded-md border bg-card/70 p-3 text-left hover:bg-accent" disabled={saving} onClick={() => addToExisting(set.id)}>
                <span className="font-medium">{set.name}</span>
                <span className="text-sm text-muted-foreground">{set.item_count}문항</span>
              </button>
            ))}
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
