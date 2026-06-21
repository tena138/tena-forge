"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FileDown, FolderPlus, ShieldCheck, Store, Trash2 } from "lucide-react";

import { ExportModal } from "@/components/export-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, getDashboardAnnouncementAccess, ProblemSet, ProblemSetListItem, sourceTypeLabel, submitProblemSetToMarketplace } from "@/lib/api";
import { PROBLEM_SET_EXPORT_HISTORY_EVENT, ProblemSetExportHistoryItem, readProblemSetExportHistory, rememberProblemSetExport } from "@/lib/exportHistory";

function exportHistoryTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export default function ProblemSetsPage() {
  const router = useRouter();
  const [sets, setSets] = useState<ProblemSetListItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketTarget, setMarketTarget] = useState<ProblemSetListItem | null>(null);
  const [exportSet, setExportSet] = useState<ProblemSetListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProblemSetListItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [noUnauthorizedCopy, setNoUnauthorizedCopy] = useState(false);
  const [marketMessage, setMarketMessage] = useState("");
  const [canManageMarketplace, setCanManageMarketplace] = useState(false);
  const [exportHistory, setExportHistory] = useState<ProblemSetExportHistoryItem[]>([]);

  async function load() {
    api<ProblemSetListItem[]>("/api/problem-sets").then(setSets).catch(() => setSets([]));
  }

  useEffect(() => {
    load();
    getDashboardAnnouncementAccess()
      .then((access) => setCanManageMarketplace(access.can_manage))
      .catch(() => setCanManageMarketplace(false));
  }, []);

  useEffect(() => {
    const refresh = () => setExportHistory(readProblemSetExportHistory());
    refresh();
    window.addEventListener(PROBLEM_SET_EXPORT_HISTORY_EVENT, refresh);
    return () => window.removeEventListener(PROBLEM_SET_EXPORT_HISTORY_EVENT, refresh);
  }, []);

  async function createSet() {
    if (!name.trim()) return;
    const created = await api<ProblemSet>("/api/problem-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), problem_ids: [], source_type: "self_created", rights_confirmed: true })
    });
    setCreateOpen(false);
    setName("");
    router.push(`/problem-sets/${created.id}`);
  }

  async function confirmDeleteSet() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/api/problem-sets/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await load();
    } catch {
      setDeleteError("세트를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  function openMarketplaceModal(set: ProblemSetListItem) {
    if (!canManageMarketplace) return;
    setMarketTarget(set);
    setRightsConfirmed(false);
    setNoUnauthorizedCopy(false);
    setMarketMessage("");
    setMarketOpen(true);
  }

  async function submitMarketplace() {
    if (!marketTarget || !canManageMarketplace) return;
    try {
      const result = await submitProblemSetToMarketplace(marketTarget.id, {
        rights_confirmed: rightsConfirmed,
        no_unauthorized_copy: noUnauthorizedCopy,
        pricing_type: "free",
        license_type: "free_use",
        category: "problem_set",
      });
      setMarketMessage(`등록 검토 상태: ${result.status}`);
      await load();
    } catch (error) {
      setMarketMessage(error instanceof Error ? error.message : "마켓 등록 요청에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="forge-section-title">내 자료 세트</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}><FolderPlus className="h-4 w-4" />새 세트 만들기</Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-zinc-600" />
            최근 내보내기
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exportHistory.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {exportHistory.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="rounded-[8px] bg-zinc-100 p-3 text-left transition hover:bg-zinc-200"
                  onClick={() => item.problemSetId && router.push(`/problem-sets/${item.problemSetId}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950">{item.examTitle}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.problemSetName || "문항 세트"}</p>
                    </div>
                    {item.output && <Badge variant="outline">{item.output}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">{item.count}문항</Badge>
                    <Badge variant={item.includeSolution ? "success" : "secondary"}>{item.includeSolution ? "답안 포함" : "문제만"}</Badge>
                    {item.includeMissingSolutionMetadata ? <Badge variant="outline">원본 위치 포함</Badge> : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{exportHistoryTime(item.exportedAt)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] bg-zinc-100 p-5 text-sm text-muted-foreground">
              문항 세트를 내보내면 최근 기록이 여기에 자동으로 쌓입니다.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sets.map((set) => {
          const restricted = set.source_type === "personal_study_only" || set.source_type === "unknown";
          const eligible = canManageMarketplace && Boolean(set.can_publish_to_marketplace) && !restricted;
          return (
            <Card
              key={set.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer transition hover:bg-zinc-50"
              onClick={() => router.push(`/problem-sets/${set.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/problem-sets/${set.id}`);
                }
              }}
            >
              <CardHeader>
                <CardTitle>{set.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{new Date(set.created_at).toLocaleString("ko-KR")}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md bg-accent/50 p-3 text-sm"><b>{set.item_count}</b>개 문항</div>
                <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <Badge variant="outline">{sourceTypeLabel(set.source_type)}</Badge>
                  <Badge variant={set.rights_confirmed ? "success" : "warning"}>{set.rights_confirmed ? "권리 확인됨" : "권리 확인 필요"}</Badge>
                  {canManageMarketplace && <Badge variant={eligible ? "success" : "secondary"}>{eligible ? "마켓 등록 가능" : "비공개 유지"}</Badge>}
                </div>
                {canManageMarketplace && restricted && <p className="text-xs leading-5 text-zinc-600">이 자료는 공개 또는 마켓플레이스 등록이 제한된 출처 유형입니다.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={(event) => { event.stopPropagation(); setExportSet(set); }}><FileDown className="h-4 w-4" />내보내기</Button>
                  {canManageMarketplace && <Button size="sm" variant="outline" disabled={!eligible} onClick={(event) => { event.stopPropagation(); openMarketplaceModal(set); }}><Store className="h-4 w-4" />마켓 등록 준비</Button>}
                  <Button size="sm" variant="destructive" onClick={(event) => { event.stopPropagation(); setDeleteTarget(set); setDeleteError(""); }}><Trash2 className="h-4 w-4" />삭제</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!sets.length && (
        <div className="forge-panel rounded-lg py-16 text-center text-muted-foreground">
          아카이브된 문항을 묶어 시험지, 워크북, 단원별 문제 세트를 만들어보세요.
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">새 세트 만들기</h2>
            <Input placeholder="세트 이름" value={name} onChange={(event) => setName(event.target.value)} />
            <Button className="w-full" disabled={!name.trim()} onClick={createSet}>생성</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={marketOpen} onOpenChange={setMarketOpen}>
        <DialogContent className="max-w-lg bg-white text-zinc-950">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600"><ShieldCheck className="h-4 w-4" />마켓플레이스 등록 전 권리 확인</div>
              <h2 className="mt-2 text-xl font-bold text-zinc-950">{marketTarget?.name}</h2>
            </div>
            <p className="text-sm leading-6 text-zinc-600">
              마켓플레이스에 등록하는 자료는 직접 제작했거나 판매·배포할 권리를 보유한 자료여야 합니다. Tena Forge는 문항 아이디어나 유형의 소유권을 판정하지 않으며, 권리 분쟁 또는 신고가 발생할 경우 해당 자료의 노출·판매·이용을 제한할 수 있습니다.
            </p>
            <label className="flex items-start gap-3 rounded-[8px] bg-zinc-100 p-3 text-sm">
              <input className="mt-1" type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
              <span>본인은 이 자료를 직접 제작했거나 판매·배포할 권리를 보유하고 있음을 확인합니다.</span>
            </label>
            <label className="flex items-start gap-3 rounded-[8px] bg-zinc-100 p-3 text-sm">
              <input className="mt-1" type="checkbox" checked={noUnauthorizedCopy} onChange={(event) => setNoUnauthorizedCopy(event.target.checked)} />
              <span>타인의 교재, 강의자료, 해설, 이미지, 문항 세트 구성을 무단으로 복제하지 않았음을 확인합니다.</span>
            </label>
            <Button className="w-full" disabled={!rightsConfirmed || !noUnauthorizedCopy} onClick={submitMarketplace}>권리 확인 후 등록</Button>
            {marketMessage && <p className="rounded-[8px] bg-zinc-100 p-3 text-sm font-semibold text-zinc-700">{marketMessage}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <DialogContent className="max-w-md bg-white text-zinc-950">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black">세트 삭제</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {deleteTarget ? `'${deleteTarget.name}' 세트를 삭제합니다. 세트 구성은 복구할 수 없습니다.` : "세트를 삭제합니다."}
              </p>
            </div>
            {deleteError ? <p className="rounded-[8px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">{deleteError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                취소
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={confirmDeleteSet}>
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {exportSet && (
        <ExportModal
          open={!!exportSet}
          onOpenChange={(open) => !open && setExportSet(null)}
          source="set"
          problemSetId={exportSet.id}
          count={exportSet.item_count}
          onExported={(item) => {
            rememberProblemSetExport({ ...item, problemSetId: exportSet.id, problemSetName: exportSet.name });
            setExportHistory(readProblemSetExportHistory());
          }}
        />
      )}
    </div>
  );
}
