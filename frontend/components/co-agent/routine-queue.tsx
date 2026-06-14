"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BellRing,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FileUp,
  FolderKanban,
  GraduationCap,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CoAgentAction, CoAgentNextActions } from "@/lib/coAgent";
import { getCoAgentNextActions } from "@/lib/coAgent";
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

function categoryLabel(category: string) {
  if (category === "extract") return "추출";
  if (category === "archive") return "보관";
  if (category === "sets") return "세트";
  if (category === "classes") return "클래스";
  if (category === "sessions") return "시험";
  if (category === "routine") return "루틴";
  return "추천";
}

function categoryTone(category: string) {
  if (category === "extract") return "border-violet-300/20 bg-violet-500/15 text-violet-100";
  if (category === "archive") return "border-sky-300/20 bg-sky-500/15 text-sky-100";
  if (category === "sets") return "border-fuchsia-300/20 bg-fuchsia-500/15 text-fuchsia-100";
  if (category === "classes") return "border-emerald-300/20 bg-emerald-500/15 text-emerald-100";
  if (category === "sessions") return "border-cyan-300/20 bg-cyan-500/15 text-cyan-100";
  if (category === "routine") return "border-amber-300/20 bg-amber-400/15 text-amber-100";
  return "border-white/10 bg-white/[0.06] text-slate-200";
}

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon =
    category === "extract"
      ? FileUp
      : category === "archive"
        ? Archive
        : category === "sets"
          ? FolderKanban
          : category === "classes"
            ? UsersRound
            : category === "sessions"
              ? ClipboardList
              : category === "routine"
                ? BellRing
                : Sparkles;
  return <Icon className={className} />;
}

const statLabels: Record<string, string> = {
  batches: "추출",
  problems: "문항",
  review_problems: "검토 필요",
  problem_sets: "세트",
  classes: "클래스",
  students: "학생",
  paper_sessions: "시험",
  pending_grading_results: "채점 대기",
  pending_routines: "루틴 대기",
};

function RecommendationCard({ action }: { action: CoAgentAction }) {
  return (
    <article className="rounded-lg border border-white/10 bg-black/15 p-4 transition hover:border-amber-300/35 hover:bg-amber-400/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 rounded-md border p-2", categoryTone(action.category))}>
            <CategoryIcon category={action.category} className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border", categoryTone(action.category))}>{categoryLabel(action.category)}</Badge>
              <span className="text-xs font-bold text-slate-500">{action.confidence === "high" ? "높은 확신" : "중간 확신"}</span>
            </div>
            <h2 className="mt-2 text-lg font-black text-white">{action.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{action.summary}</p>
          </div>
        </div>
        <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-black text-slate-300">{action.priority}</span>
      </div>
      <p className="mt-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">{action.reason}</p>
      {action.signals.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {action.signals.map((signal) => (
            <span key={signal} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-slate-400">
              {signal}
            </span>
          ))}
        </div>
      ) : null}
      <Link
        href={action.href}
        className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-[7px] border border-amber-300/35 bg-amber-300/12 px-3 text-sm font-bold text-amber-50 transition hover:bg-amber-300/18"
      >
        {action.cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

export function RoutineQueue() {
  const [guidance, setGuidance] = useState<CoAgentNextActions | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
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
  const displayedStats = useMemo(() => {
    const stats = guidance?.stats || {};
    return Object.entries(statLabels).map(([key, label]) => ({ key, label, value: stats[key] ?? 0 }));
  }, [guidance]);

  const syncRoutineDrafts = useCallback((items: RoutineAction[]) => {
    setRoutineMessageDrafts((current) => {
      const next = { ...current };
      for (const routine of items) {
        for (const routineMessage of routine.messages || []) {
          next[routineMessage.id] = routineMessage.message_body;
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

  const loadGuidance = useCallback(async () => {
    setGuidanceLoading(true);
    try {
      setGuidance(await getCoAgentNextActions());
    } catch (error) {
      setMessage(errorMessage(error, "다음 추천 행동을 불러오지 못했습니다."));
    } finally {
      setGuidanceLoading(false);
    }
  }, []);

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

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([loadGuidance(), loadRoutines()]);
  }, [loadGuidance, loadRoutines]);

  async function regenerateRoutine(routine: RoutineAction) {
    setRoutineBusyId(routine.id);
    try {
      upsertRoutine(await refreshRoutineAi(routine.id));
      setMessage("AI가 루틴 문구를 다시 생성했습니다.");
      void loadGuidance();
    } catch (error) {
      setMessage(errorMessage(error, "AI 루틴 문구를 다시 생성하지 못했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function persistRoutineMessage(routine: RoutineAction, routineMessage: RoutineMessage, body?: string) {
    const nextBody = (body ?? routineMessageDrafts[routineMessage.id] ?? routineMessage.message_body).trim();
    if (!nextBody || nextBody === routineMessage.message_body) return;
    setRoutineBusyId(routineMessage.id);
    try {
      upsertRoutine(await updateRoutineMessage(routine.id, routineMessage.id, { message_body: nextBody }));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 메시지를 저장하지 못했습니다."));
      setRoutineMessageDrafts((current) => ({ ...current, [routineMessage.id]: routineMessage.message_body }));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function toggleRoutineMessage(routine: RoutineAction, routineMessage: RoutineMessage) {
    const nextStatus = routineMessage.status === "excluded" ? "pending" : "excluded";
    setRoutineBusyId(routineMessage.id);
    try {
      upsertRoutine(await updateRoutineMessage(routine.id, routineMessage.id, { status: nextStatus }));
      void loadGuidance();
    } catch (error) {
      setMessage(errorMessage(error, "루틴 메시지 상태를 바꾸지 못했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function sendRoutine(routine: RoutineAction) {
    for (const routineMessage of routine.messages || []) {
      const draft = routineMessageDrafts[routineMessage.id];
      if (routineMessage.status !== "excluded" && draft !== undefined && draft.trim() && draft.trim() !== routineMessage.message_body) {
        await persistRoutineMessage(routine, routineMessage, draft);
      }
    }
    setRoutineBusyId(routine.id);
    try {
      const sent = await sendRoutineAction(routine.id);
      upsertRoutine(sent);
      setMessage(`${sent.sendable_count}건의 루틴 알림을 전송했습니다.`);
      void loadGuidance();
    } catch (error) {
      setMessage(errorMessage(error, "루틴 알림 전송에 실패했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

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

      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <Bot className="h-4 w-4" />
            Co-Agent
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">운영 코에이전트</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            현재 사용 상태를 읽고 Tena Forge 안에서 이어갈 다음 행동을 추천합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-amber-300/20 bg-amber-400/10 text-amber-100">추천 {guidance?.actions.length ?? 0}건</Badge>
          <Badge className="border border-white/10 bg-white/[0.04] text-slate-200">루틴 대기 {pendingRoutineCount}건</Badge>
          <Button type="button" size="sm" variant="outline" onClick={refreshWorkspace} disabled={guidanceLoading || routineLoading}>
            {guidanceLoading || routineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            새로고침
          </Button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <Sparkles className="h-4 w-4 text-amber-200" />
                다음 추천 행동
              </div>
              <p className="mt-1 text-sm text-slate-500">사용자의 현재 데이터 상태를 기준으로 정렬됩니다.</p>
            </div>
            {guidance?.current_stage ? <Badge className={cn("border", categoryTone(guidance.current_stage))}>현재 단계 {categoryLabel(guidance.current_stage)}</Badge> : null}
          </div>

          <div className="mt-4 grid gap-3">
            {guidanceLoading && !guidance ? (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                추천 행동을 계산하는 중입니다.
              </div>
            ) : null}
            {!guidanceLoading && guidance && !guidance.actions.length ? (
              <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">지금 바로 추천할 다음 행동이 없습니다.</div>
            ) : null}
            {guidance?.actions.map((action) => (
              <RecommendationCard key={action.id} action={action} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <FileText className="h-4 w-4 text-sky-200" />
              Tena Forge 기능 지도
            </div>
            <div className="mt-3 space-y-2">
              {(guidance?.product_map || []).map((item, index) => (
                <Link key={item.id} href={item.href} className="flex gap-3 rounded-md border border-white/10 bg-black/10 p-3 transition hover:border-white/25 hover:bg-white/[0.05]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/[0.06] text-xs font-black text-slate-300">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{item.summary}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-200" />
              실행 원칙
            </div>
            <div className="mt-3 grid gap-2">
              {["추천은 내부 기능으로만 연결", "전송/수정은 사용자 승인 후 실행", "LLM은 제품 지도와 상태 설명에 사용"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <ClipboardCheck className="h-4 w-4 text-violet-200" />
              상태 신호
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {displayedStats.map((stat) => (
                <div key={stat.key} className="rounded-md border border-white/10 bg-black/10 p-2">
                  <p className="text-[11px] font-bold text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-lg font-black text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <BellRing className="h-4 w-4 text-amber-200" />
              루틴 큐
            </div>
            <p className="mt-1 text-sm text-slate-500">검토 가능한 작업만 표시됩니다.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
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
        </div>
      </section>
    </div>
  );
}
