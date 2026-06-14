"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoutineAction, RoutineMessage } from "@/lib/studentManagement";
import { listRoutineActions, refreshRoutineAi, sendRoutineAction, updateRoutineMessage } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

function routineTypeLabel(type: string) {
  if (type === "grade_report") return "채점 리포트";
  if (type === "class_feedback") return "수업 피드백";
  if (type === "counseling_share") return "상담 공유";
  return "루틴";
}

function routineStatusLabel(status: string) {
  if (status === "sent") return "전송됨";
  if (status === "reviewing") return "검토 중";
  if (status === "suggested") return "제안";
  return status || "제안";
}

function routineStatusTone(status: string) {
  if (status === "sent") return "border-emerald-400/20 bg-emerald-500/15 text-emerald-100";
  if (status === "reviewing") return "border-violet-300/20 bg-violet-500/15 text-violet-100";
  return "border-sky-300/20 bg-sky-500/15 text-sky-100";
}

function routineChannelLabel(channel: string) {
  return channel === "student_notification" ? "학생앱 알림" : channel;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  if (candidate.message === "Network Error") return fallback;
  return candidate.message || fallback;
}

export function RoutineQueue() {
  const [routines, setRoutines] = useState<RoutineAction[]>([]);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [routineBusyId, setRoutineBusyId] = useState("");
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [routineMessageDrafts, setRoutineMessageDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedRoutineId) || routines[0] || null,
    [routines, selectedRoutineId]
  );
  const pendingRoutineCount = useMemo(() => routines.filter((routine) => routine.status !== "sent").length, [routines]);

  const syncRoutineDrafts = useCallback((items: RoutineAction[]) => {
    setRoutineMessageDrafts((current) => {
      const next = { ...current };
      for (const routine of items) {
        for (const message of routine.messages || []) {
          next[message.id] = message.message_body;
        }
      }
      return next;
    });
  }, []);

  function upsertRoutine(updated: RoutineAction) {
    setRoutines((current) => {
      const exists = current.some((routine) => routine.id === updated.id);
      return exists ? current.map((routine) => (routine.id === updated.id ? updated : routine)) : [updated, ...current];
    });
    syncRoutineDrafts([updated]);
    setSelectedRoutineId(updated.id);
  }

  const loadRoutines = useCallback(async () => {
    setRoutineLoading(true);
    try {
      const items = await listRoutineActions();
      setRoutines(items);
      syncRoutineDrafts(items);
      setSelectedRoutineId((current) => (current && items.some((routine) => routine.id === current) ? current : items[0]?.id || ""));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 제안을 불러오지 못했습니다."));
    } finally {
      setRoutineLoading(false);
    }
  }, [syncRoutineDrafts]);

  async function regenerateRoutine(routine: RoutineAction) {
    setRoutineBusyId(routine.id);
    try {
      upsertRoutine(await refreshRoutineAi(routine.id));
      setMessage("AI가 루틴 문구를 다시 생성했습니다.");
    } catch (error) {
      setMessage(errorMessage(error, "AI 루틴 문구를 다시 생성하지 못했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function persistRoutineMessage(routine: RoutineAction, message: RoutineMessage, body?: string) {
    const nextBody = (body ?? routineMessageDrafts[message.id] ?? message.message_body).trim();
    if (!nextBody || nextBody === message.message_body) return;
    setRoutineBusyId(message.id);
    try {
      upsertRoutine(await updateRoutineMessage(routine.id, message.id, { message_body: nextBody }));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 메시지를 저장하지 못했습니다."));
      setRoutineMessageDrafts((current) => ({ ...current, [message.id]: message.message_body }));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function toggleRoutineMessage(routine: RoutineAction, message: RoutineMessage) {
    const nextStatus = message.status === "excluded" ? "pending" : "excluded";
    setRoutineBusyId(message.id);
    try {
      upsertRoutine(await updateRoutineMessage(routine.id, message.id, { status: nextStatus }));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 메시지 상태를 바꾸지 못했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function sendRoutine(routine: RoutineAction) {
    for (const message of routine.messages || []) {
      const draft = routineMessageDrafts[message.id];
      if (message.status !== "excluded" && draft !== undefined && draft.trim() && draft.trim() !== message.message_body) {
        await persistRoutineMessage(routine, message, draft);
      }
    }
    setRoutineBusyId(routine.id);
    try {
      const sent = await sendRoutineAction(routine.id);
      upsertRoutine(sent);
      setMessage(`${sent.sendable_count}건의 루틴 알림을 전송했습니다.`);
    } catch (error) {
      setMessage(errorMessage(error, "루틴 알림 전송에 실패했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  useEffect(() => {
    void loadRoutines();
  }, [loadRoutines]);

  return (
    <div className="space-y-6">
      {message ? (
        <div className="flex items-center justify-between rounded-lg border border-violet-300/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage("")} className="rounded p-1 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <header className="flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <BellRing className="h-4 w-4" />
            Co-Agent
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">루틴</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            채점 리포트, 수업 피드백, 상담 공유처럼 오늘 처리할 전송 후보를 모아 검토합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-amber-300/20 bg-amber-400/10 text-amber-100">대기 {pendingRoutineCount}건</Badge>
          <Button type="button" size="sm" variant="outline" onClick={() => loadRoutines()} disabled={routineLoading}>
            {routineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            새로고침
          </Button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <div className="space-y-3">
          {routineLoading && !routines.length ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              루틴 제안을 불러오는 중입니다.
            </div>
          ) : null}
          {!routineLoading && !routines.length ? (
            <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">지금 검토할 루틴 제안이 없습니다.</div>
          ) : null}
          {routines.map((routine) => (
            <button
              key={routine.id}
              type="button"
              onClick={() => setSelectedRoutineId(routine.id)}
              className={cn(
                "w-full rounded-lg border p-4 text-left transition",
                selectedRoutine?.id === routine.id ? "border-amber-300/50 bg-amber-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("border", routineStatusTone(routine.status))}>{routineStatusLabel(routine.status)}</Badge>
                    <span className="text-xs font-semibold text-slate-500">{routineTypeLabel(routine.routine_type)}</span>
                  </div>
                  <p className="mt-2 truncate text-base font-black text-white">{routine.title}</p>
                </div>
                <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs font-bold text-slate-300">{routine.sendable_count}/{routine.message_count}</span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">{routine.summary || "AI 제안 요약이 없습니다."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{routineChannelLabel(routine.channel)}</span>
                <span>{formatDate(routine.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.035]">
          {selectedRoutine ? (
            <div className="space-y-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("border", routineStatusTone(selectedRoutine.status))}>{routineStatusLabel(selectedRoutine.status)}</Badge>
                    <Badge variant="outline">{routineChannelLabel(selectedRoutine.channel)}</Badge>
                  </div>
                  <h2 className="mt-3 text-xl font-black text-white">{selectedRoutine.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{selectedRoutine.summary}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => regenerateRoutine(selectedRoutine)} disabled={routineBusyId === selectedRoutine.id || selectedRoutine.status === "sent"}>
                    {routineBusyId === selectedRoutine.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    다시 생성
                  </Button>
                  <Button type="button" size="sm" onClick={() => sendRoutine(selectedRoutine)} disabled={routineBusyId === selectedRoutine.id || selectedRoutine.status === "sent" || !selectedRoutine.sendable_count}>
                    {routineBusyId === selectedRoutine.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    일괄 전송
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {selectedRoutine.messages.map((routineMessage) => {
                  const excluded = routineMessage.status === "excluded";
                  return (
                    <div key={routineMessage.id} className={cn("rounded-lg border p-3", excluded ? "border-white/10 bg-black/20 opacity-70" : "border-white/10 bg-black/15")}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-white">{routineMessage.student_name}</p>
                          <p className="text-xs text-slate-500">{routineMessage.class_name || "클래스 없음"} · {routineMessage.delivery_status === "sent" ? "전송됨" : excluded ? "제외됨" : "대기"}</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => toggleRoutineMessage(selectedRoutine, routineMessage)} disabled={routineBusyId === routineMessage.id || selectedRoutine.status === "sent"}>
                          {excluded ? "포함" : "제외"}
                        </Button>
                      </div>
                      <textarea
                        className="min-h-28 w-full rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-amber-300/50 disabled:opacity-60"
                        value={routineMessageDrafts[routineMessage.id] ?? routineMessage.message_body}
                        onChange={(event) => setRoutineMessageDrafts((current) => ({ ...current, [routineMessage.id]: event.target.value }))}
                        onBlur={() => persistRoutineMessage(selectedRoutine, routineMessage)}
                        disabled={excluded || selectedRoutine.status === "sent"}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-500">왼쪽에서 루틴 제안을 선택하세요.</div>
          )}
        </div>
      </section>
    </div>
  );
}
