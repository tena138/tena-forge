"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, BookOpenCheck, Eye, FileText, Info, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, Batch } from "@/lib/api";
import { rememberActiveBatch } from "@/lib/batch-progress";
import { formatKstDateTime } from "@/lib/datetime";
import { ClassCard, createPaperSession, getStudentManagementDashboard } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

function fileName(path: string | null) {
  if (!path) return "없음";
  return path.split(/[\\/]/).pop() || path;
}

function formatDate(value: string) {
  return formatKstDateTime(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localDateTimeInputValue(value = new Date()) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function statusLabel(status: Batch["status"]) {
  return {
    pending: "대기",
    processing: "처리 중",
    done: "완료",
    error: "오류",
  }[status];
}

function statusBadgeStyle(status: Batch["status"]): CSSProperties {
  return {
    pending: { backgroundColor: "#f4f4f5", color: "#27272a", boxShadow: "inset 0 0 0 1px #e4e4e7" },
    processing: { backgroundColor: "#7c3aed", color: "#ffffff", boxShadow: "inset 0 0 0 1px #6d28d9" },
    done: { backgroundColor: "#09090b", color: "#ffffff", boxShadow: "inset 0 0 0 1px #18181b" },
    error: { backgroundColor: "#fef2f2", color: "#b91c1c", boxShadow: "inset 0 0 0 1px #fecaca" },
  }[status];
}

function StatusBadge({ status }: { status: Batch["status"] }) {
  return (
    <span className="inline-flex h-6 items-center rounded-[6px] px-2 text-xs font-black leading-none" style={statusBadgeStyle(status)}>
      {statusLabel(status)}
    </span>
  );
}

function errorReason(batch: Batch) {
  return batch.failure_reason || (batch.status === "error" ? batch.progress_message : null) || "오류 원인을 확인하지 못했습니다.";
}

function BatchErrorPanel({ batch }: { batch: Batch }) {
  if (batch.status !== "error") return null;

  return (
    <div className="rounded-[10px] bg-zinc-100 p-4 text-sm text-zinc-800">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        처리 실패 원인
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold text-zinc-500">실패 단계</p>
          <p className="mt-1 leading-6">{batch.failure_stage || "확인되지 않음"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-500">원인</p>
          <p className="mt-1 leading-6">{errorReason(batch)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-500">대응</p>
          <p className="mt-1 leading-6">{batch.failure_hint || "다시 처리하거나 원본 파일과 서버 설정을 확인하세요."}</p>
        </div>
      </div>
      {batch.failed_at ? <p className="mt-3 text-xs font-semibold text-zinc-500">실패 시각: {formatDate(batch.failed_at)}</p> : null}
    </div>
  );
}

function BatchInfoPanel({ batch }: { batch: Batch }) {
  const progress = batch.status === "done" ? 100 : batch.progress_percent ?? null;
  const isActive = batch.status === "pending" || batch.status === "processing";
  return (
    <>
      <div className="rounded-[9px] bg-zinc-100 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Info className="h-4 w-4 text-zinc-700" />
          처리 정보
        </div>
        <p className="mt-2 text-xs font-semibold text-zinc-500">최근 단계</p>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-800">{batch.progress_message || "기록 없음"}</p>
      </div>
      <div className="rounded-[9px] bg-zinc-100 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Info className="h-4 w-4 text-zinc-700" />
          진행률
        </div>
        {isActive ? (
          <>
            <p className="mt-2 text-lg font-bold leading-none text-zinc-950">{progress == null ? "계산 중" : `${progress}%`}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full rounded-full bg-black transition-all duration-500" style={{ width: `${progress ?? 0}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm font-semibold text-zinc-800">{batch.status === "done" ? "완료" : progress == null ? "중단됨" : `${progress}%에서 중단`}</p>
        )}
      </div>
    </>
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignBatch, setAssignBatch] = useState<Batch | null>(null);
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState(() => localDateTimeInputValue());
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignNotice, setAssignNotice] = useState("");

  const fetchActiveBatch = useCallback(async () => {
    if (!activeBatchId) return null;
    try {
      return await api<Batch>(`/api/batches/${activeBatchId}`);
    } catch {
      return null;
    }
  }, [activeBatchId]);

  const loadBatches = useCallback(async () => {
    try {
      const nextBatches = await api<Batch[]>("/api/batches");
      setLoadError(null);
      const activeFromList = activeBatchId ? nextBatches.find((batch) => batch.id === activeBatchId) || null : null;
      const activeDirect = activeBatchId && !activeFromList ? await fetchActiveBatch() : null;
      const mergedBatches = activeDirect ? [activeDirect, ...nextBatches.filter((batch) => batch.id !== activeDirect.id)] : nextBatches;
      setBatches(mergedBatches);
      if (activeBatchId) onActiveBatchSnapshot?.(activeFromList || activeDirect || null);
      return mergedBatches;
    } catch {
      setLoadError("아카이빙 기록을 불러오지 못했습니다. 잠시 후 다시 시도하거나 로그인 상태를 확인해 주세요.");
      const activeDirect = await fetchActiveBatch();
      const fallbackBatches = activeDirect ? [activeDirect] : [];
      setBatches(fallbackBatches);
      if (activeBatchId) onActiveBatchSnapshot?.(activeDirect);
      return fallbackBatches;
    }
  }, [activeBatchId, fetchActiveBatch, onActiveBatchSnapshot]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches, refreshKey]);

  useEffect(() => {
    getStudentManagementDashboard()
      .then((dashboard) => setClasses(dashboard.classes || []))
      .catch(() => setClasses([]));
  }, []);

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

  async function cancelBatch(batch: Batch) {
    if (batch.status !== "pending" && batch.status !== "processing") return;
    const ok = window.confirm(`'${batch.name}' 배치 추출을 중단할까요? 지금까지 생성된 캐시와 일부 문항은 삭제됩니다.`);
    if (!ok) return;
    setBusyId(batch.id);
    try {
      const updated = await api<Batch>(`/api/batches/${batch.id}/cancel`, { method: "POST" });
      setBatches((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      if (activeBatchId === updated.id) onActiveBatchSnapshot?.(updated);
      await loadBatches();
    } finally {
      setBusyId(null);
    }
  }

  async function reprocessSolutions(batch: Batch) {
    if (!batch.problem_count || !batch.solution_pdf_filename || batch.status === "pending" || batch.status === "processing" || busyId === batch.id) return;
    const ok = window.confirm(`'${batch.name}' 배치의 답안 PDF만 다시 추출할까요? 기존 문항은 유지하고 정답만 새로 매칭합니다.`);
    if (!ok) return;
    setBusyId(batch.id);
    try {
      const response = await api<{ batch_id: string; status: Batch["status"] }>(`/api/batches/${batch.id}/reprocess-solutions`, { method: "POST" });
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

  function openAssignModal(batch: Batch) {
    setAssignBatch(batch);
    setAssignError("");
    setAssignNotice("");
    setSelectedClassIds([]);
    setSelectedStudentIds([]);
    setScheduledAt(localDateTimeInputValue());
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((current) => (current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]));
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) => (current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]));
  }

  async function assignSelectedBatch() {
    if (!assignBatch || assigning) return;
    if (!selectedClassIds.length && !selectedStudentIds.length) {
      setAssignError("할당할 클래스 또는 학생을 선택해주세요.");
      return;
    }
    setAssigning(true);
    setAssignError("");
    try {
      await createPaperSession({
        title: assignBatch.name,
        description: "교재 배치 할당: 학생별 오답 및 복습 관리를 위해 생성되었습니다.",
        source_batch_id: assignBatch.id,
        session_type: "homework",
        class_ids: selectedClassIds,
        student_membership_ids: selectedStudentIds,
        scheduled_at: scheduledAt ? `${scheduledAt}:00` : null,
        status: "scheduled",
        create_calendar_events: true,
      });
      setAssignNotice("클래스/학생에게 할당했습니다. 학생 캘린더에서 문항별 결과 입력이 가능합니다.");
      setAssignBatch(null);
    } catch {
      setAssignError("배치를 할당하지 못했습니다. 선택한 학생과 배치 문항을 확인해주세요.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <section className={cn("space-y-4", compact && "pt-1")}>
      {!compact ? (
        <div className="flex justify-end">
          <Button onClick={() => router.push("/archive/new")}>
            <UploadCloud className="h-4 w-4" />
            새 자료 아카이빙
          </Button>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-[10px] bg-zinc-100 p-4 text-sm font-semibold text-zinc-700">
          {loadError}
        </div>
      ) : null}

      {assignNotice ? (
        <div className="rounded-[10px] bg-zinc-100 p-4 text-sm font-semibold text-zinc-700">
          {assignNotice}
        </div>
      ) : null}

      <div className="grid gap-4">
        {batches.map((batch) => (
          <Card key={batch.id} className="bg-white">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-zinc-950">{batch.name}</CardTitle>
                    <StatusBadge status={batch.status} />
                    {batch.review_count > 0 ? <Badge variant="warning">검토 {batch.review_count}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{formatDate(batch.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button variant="outline" size="sm" disabled={!batch.problem_count} onClick={() => router.push(`/problems?batch_id=${batch.id}`)}>
                    <Eye className="h-4 w-4" />
                    문항 보기
                  </Button>
                  {batch.solution_pdf_filename && batch.problem_count > 0 ? (
                    <Button variant="outline" size="sm" disabled={batch.status === "pending" || batch.status === "processing" || busyId === batch.id} onClick={() => reprocessSolutions(batch)}>
                      <FileText className="h-4 w-4" />
                      답안만 재처리
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batch.status !== "done" || !batch.problem_count}
                    onClick={() => openAssignModal(batch)}
                  >
                    <BookOpenCheck className="h-4 w-4" />
                    클래스/학생에게 할당
                  </Button>
                  <Button variant="outline" size="sm" disabled={batch.status === "processing" || busyId === batch.id} onClick={() => retryBatch(batch)}>
                    <RotateCcw className="h-4 w-4" />
                    재처리
                  </Button>
                  {batch.status === "pending" || batch.status === "processing" ? (
                    <Button variant="outline" size="sm" disabled={busyId === batch.id} onClick={() => cancelBatch(batch)}>
                      <Ban className="h-4 w-4" />
                      중단
                    </Button>
                  ) : null}
                  <Button variant="destructive" size="sm" disabled={busyId === batch.id} onClick={() => deleteBatch(batch)}>
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <BatchErrorPanel batch={batch} />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <BatchInfoPanel batch={batch} />
                <div className="rounded-[9px] bg-zinc-100 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><FileText className="h-4 w-4 text-zinc-700" />입력 PDF</div>
                  <p className="mt-1 break-all text-sm text-zinc-500">{fileName(batch.problem_pdf_filename)}</p>
                </div>
                {batch.solution_pdf_filename ? (
                  <div className="rounded-[9px] bg-zinc-100 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><FileText className="h-4 w-4 text-zinc-700" />레거시 답안 PDF</div>
                    <p className="mt-1 break-all text-sm text-zinc-500">{fileName(batch.solution_pdf_filename)}</p>
                  </div>
                ) : (
                  <div className="rounded-[9px] bg-zinc-100 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><Info className="h-4 w-4 text-zinc-700" />정답 감지</div>
                    <p className="mt-1 text-sm text-zinc-500">입력 PDF 안에서 본문, 정답, 해설 페이지를 함께 감지합니다.</p>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-[9px] bg-zinc-100 p-3">
                  <p className="text-xs font-semibold text-zinc-500">전체 문항</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-950">{batch.problem_count}</p>
                </div>
                <div className="rounded-[9px] bg-zinc-100 p-3">
                  <p className="text-xs font-semibold text-zinc-500">검토 필요</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-950">{batch.review_count}</p>
                </div>
                <div className="rounded-[9px] bg-zinc-100 p-3">
                  <p className="text-xs font-semibold text-zinc-500">태그 완료</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-950">{batch.tagged_count}</p>
                </div>
                <div className="rounded-[9px] bg-zinc-100 p-3">
                  <p className="text-xs font-semibold text-zinc-500">태그 미완료</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-950">{batch.untagged_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!batches.length && !loadError ? (
        <div className="rounded-[10px] bg-white py-14 text-center text-sm font-semibold text-zinc-500">
          아직 아카이빙 기록이 없습니다.
          <div className="mt-4">
            <Button onClick={() => router.push("/archive/new")}>자료 아카이빙 시작</Button>
          </div>
        </div>
      ) : null}
      {assignBatch ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-[14px] bg-white text-zinc-950 shadow-[0_24px_80px_rgba(15,15,15,0.22)]">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Batch Assignment</p>
                <h2 className="mt-1 text-xl font-black text-zinc-950">클래스/학생에게 할당</h2>
                <p className="mt-1 text-sm text-zinc-500">{assignBatch.name} · {assignBatch.problem_count}문항</p>
              </div>
              <button
                type="button"
                onClick={() => setAssignBatch(null)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 hover:text-zinc-950"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <label className="block text-sm font-bold text-zinc-700">
                할당 날짜
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="mt-2 h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:bg-white focus:ring-2 focus:ring-black/10"
                />
              </label>

              <div className="mt-5 space-y-3">
                {classes.map((classRow) => (
                  <div key={classRow.id} className="rounded-[10px] bg-zinc-50 p-3">
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span>
                        <span className="block font-bold text-zinc-950">{classRow.name}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{classRow.students.length}명</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(classRow.id)}
                        onChange={() => toggleClass(classRow.id)}
                        className="h-5 w-5 accent-black"
                      />
                    </label>
                    {classRow.students.length ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {classRow.students.map((student) => (
                          <label key={student.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[8px] bg-white px-3 py-2 transition hover:bg-zinc-100">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-zinc-950">{student.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-zinc-500">{student.grade_level || "-"} · 오답 {student.unresolved_wrong_count}</span>
                            </span>
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.includes(student.id)}
                              onChange={() => toggleStudent(student.id)}
                              className="h-4 w-4 shrink-0 accent-black"
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!classes.length ? (
                  <div className="rounded-lg bg-zinc-100 p-4 text-sm text-zinc-500">표시할 클래스가 없습니다.</div>
                ) : null}
              </div>

              {assignError ? <p className="mt-4 rounded-lg bg-zinc-100 p-3 text-sm font-semibold text-zinc-700">{assignError}</p> : null}
            </div>
            <div className="flex flex-col gap-2 p-5 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setAssignBatch(null)}>취소</Button>
              <Button type="button" onClick={assignSelectedBatch} disabled={assigning || (!selectedClassIds.length && !selectedStudentIds.length)}>
                <BookOpenCheck className="h-4 w-4" />
                {assigning ? "할당 중" : "할당하기"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
