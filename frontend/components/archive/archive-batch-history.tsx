"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Eye, FileText, Info, RotateCcw, Trash2, UploadCloud } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, Batch } from "@/lib/api";
import { rememberActiveBatch } from "@/lib/batch-progress";
import { cn } from "@/lib/utils";

function fileName(path: string | null) {
  if (!path) return "없음";
  return path.split(/[\\/]/).pop() || path;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: Batch["status"]) {
  return {
    pending: "대기",
    processing: "처리 중",
    done: "완료",
    error: "오류",
  }[status];
}

function sourceLabel(value?: string | null) {
  return {
    self_created: "직접 제작한 자료",
    academy_internal: "학원 내부 자료",
    licensed: "이용 허락을 받은 자료",
    public_domain_or_open: "공개 이용 가능 자료",
    personal_study_only: "개인 학습용 자료",
    unknown: "출처 확인 필요",
  }[value || ""] || "출처 확인 필요";
}

function statusClass(status: Batch["status"]) {
  return {
    pending: "border-white/10 bg-white/[0.06] text-slate-300",
    processing: "border-blue-400/25 bg-blue-400/12 text-blue-200",
    done: "border-violet-400/40 bg-violet-500/90 text-white",
    error: "border-red-400/25 bg-red-400/12 text-red-200",
  }[status];
}

function errorReason(batch: Batch) {
  return batch.failure_reason || (batch.status === "error" ? batch.progress_message : null) || "오류 원인을 확인하지 못했습니다.";
}

function BatchErrorPanel({ batch }: { batch: Batch }) {
  if (batch.status !== "error") return null;

  return (
    <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        처리 실패 원인
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs text-red-200/70">실패 단계</p>
          <p className="mt-1 leading-6">{batch.failure_stage || "확인되지 않음"}</p>
        </div>
        <div>
          <p className="text-xs text-red-200/70">원인</p>
          <p className="mt-1 leading-6">{errorReason(batch)}</p>
        </div>
        <div>
          <p className="text-xs text-red-200/70">대응</p>
          <p className="mt-1 leading-6">{batch.failure_hint || "다시 처리하거나 원본 파일과 서버 설정을 확인하세요."}</p>
        </div>
      </div>
      {batch.failed_at ? <p className="mt-3 text-xs text-red-200/60">실패 시각: {formatDate(batch.failed_at)}</p> : null}
    </div>
  );
}

function BatchInfoPanel({ batch }: { batch: Batch }) {
  const progress = batch.status === "done" ? 100 : batch.progress_percent ?? null;
  const isActive = batch.status === "pending" || batch.status === "processing";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <Info className="h-4 w-4 text-violet-200" />
        처리 정보
      </div>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">자료 출처</p>
          <p className="mt-1 text-slate-200">{sourceLabel(batch.source_type)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">최근 단계</p>
          <p className="mt-1 text-slate-200">{batch.progress_message || "기록 없음"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">진행률</p>
          {isActive ? (
            <>
              <p className="mt-1 text-lg font-bold text-violet-100">{progress == null ? "계산 중" : `${progress}%`}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-violet-400 transition-all duration-500" style={{ width: `${progress ?? 0}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-slate-200">{batch.status === "done" ? "완료" : progress == null ? "중단됨" : `${progress}%에서 중단`}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">권리 확인</p>
          <p className="mt-1 text-slate-200">{batch.rights_confirmed ? "확인됨" : "미확인"}</p>
        </div>
      </div>
    </div>
  );
}

export function ArchiveBatchHistory({
  compact = false,
  refreshKey,
  activeBatchId,
  onActiveBatchSnapshot,
}: {
  compact?: boolean;
  refreshKey?: string | number | null;
  activeBatchId?: string | null;
  onActiveBatchSnapshot?: (batch: Batch | null) => void;
}) {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    try {
      const nextBatches = await api<Batch[]>("/api/batches");
      setBatches(nextBatches);
      if (activeBatchId) onActiveBatchSnapshot?.(nextBatches.find((batch) => batch.id === activeBatchId) || null);
      return nextBatches;
    } catch {
      setBatches([]);
      if (activeBatchId) onActiveBatchSnapshot?.(null);
      return [];
    }
  }, [activeBatchId, onActiveBatchSnapshot]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches, refreshKey]);

  useEffect(() => {
    if (!batches.some((batch) => batch.status === "pending" || batch.status === "processing")) return;
    const timer = window.setInterval(() => {
      void loadBatches();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [batches, loadBatches]);

  async function retryBatch(batch: Batch) {
    if (batch.status === "processing") return;
    const ok = window.confirm(`'${batch.name}' 배치를 다시 처리할까요? 기존 추출 문항은 삭제되고 다시 생성됩니다.`);
    if (!ok) return;
    setBusyId(batch.id);
    try {
      const response = await api<{ batch_id: string; status: Batch["status"] }>(`/api/batches/${batch.id}/retry`, { method: "POST" });
      rememberActiveBatch(response.batch_id);
      await loadBatches();
      router.push("/archive/new");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBatch(batch: Batch) {
    const ok = window.confirm(`'${batch.name}' 배치를 삭제할까요? 연결된 문항과 태그도 함께 삭제됩니다.`);
    if (!ok) return;
    setBusyId(batch.id);
    try {
      await api(`/api/batches/${batch.id}`, { method: "DELETE" });
      await loadBatches();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={cn("space-y-4", compact && "pt-1")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={compact ? "text-xl font-bold text-white" : "forge-section-title"}>아카이빙 기록</h2>
          <p className="mt-1 text-sm text-slate-400">업로드한 배치의 처리 상태, 생성 문항 수, 실패 원인을 확인합니다.</p>
        </div>
        {!compact ? (
          <Button onClick={() => router.push("/archive/new")}>
            <UploadCloud className="h-4 w-4" />
            새 자료 아카이빙
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4">
        {batches.map((batch) => (
          <Card key={batch.id} className="border-white/10 bg-black/35">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-white">{batch.name}</CardTitle>
                    <Badge variant="outline" className={cn("border", statusClass(batch.status))}>{statusLabel(batch.status)}</Badge>
                    {batch.review_count > 0 ? <Badge variant="warning">검토 {batch.review_count}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(batch.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={!batch.problem_count} onClick={() => router.push(`/problems/review?batch_id=${batch.id}`)}>
                    <ClipboardCheck className="h-4 w-4" />
                    배치 검토
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => router.push(`/problems?batch_id=${batch.id}`)}>
                    <Eye className="h-4 w-4" />
                    문항 보기
                  </Button>
                  <Button variant="outline" size="sm" disabled={batch.status === "processing" || busyId === batch.id} onClick={() => retryBatch(batch)}>
                    <RotateCcw className="h-4 w-4" />
                    재처리
                  </Button>
                  <Button variant="destructive" size="sm" disabled={busyId === batch.id} onClick={() => deleteBatch(batch)}>
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <BatchErrorPanel batch={batch} />
              <BatchInfoPanel batch={batch} />

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-100"><FileText className="h-4 w-4 text-violet-200" />문항 PDF</div>
                  <p className="mt-1 break-all text-sm text-slate-500">{fileName(batch.problem_pdf_filename)}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-100"><FileText className="h-4 w-4 text-violet-200" />해설 PDF</div>
                  <p className="mt-1 break-all text-sm text-slate-500">{fileName(batch.solution_pdf_filename)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-md bg-white/[0.045] p-3">
                  <p className="text-xs text-slate-500">전체 문항</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{batch.problem_count}</p>
                </div>
                <div className="rounded-md bg-white/[0.045] p-3">
                  <p className="text-xs text-slate-500">검토 필요</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{batch.review_count}</p>
                </div>
                <div className="rounded-md bg-white/[0.045] p-3">
                  <p className="text-xs text-slate-500">태그 완료</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{batch.tagged_count}</p>
                </div>
                <div className="rounded-md bg-white/[0.045] p-3">
                  <p className="text-xs text-slate-500">태그 미완료</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{batch.untagged_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!batches.length ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.035] py-14 text-center text-sm text-slate-400">
          아직 아카이빙 기록이 없습니다.
          <div className="mt-4">
            <Button onClick={() => router.push("/archive/new")}>자료 아카이빙 시작</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
