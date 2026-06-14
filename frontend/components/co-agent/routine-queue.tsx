"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoutineAction, RoutineMessage } from "@/lib/studentManagement";
import { listRoutineActions, refreshRoutineAi, sendRoutineAction, updateRoutineMessage } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

const CO_AGENT_SETTINGS_KEY = "tena.co-agent.settings.v1";

type ApprovalMode = "suggest_only" | "draft_review" | "approval_send";
type ToneMode = "concise" | "warm" | "formal";
type DomainKey = "reports" | "feedback" | "counseling" | "schedule";

type CoAgentSettings = {
  approvalMode: ApprovalMode;
  toneMode: ToneMode;
  domains: Record<DomainKey, boolean>;
};

const defaultSettings: CoAgentSettings = {
  approvalMode: "draft_review",
  toneMode: "formal",
  domains: {
    reports: true,
    feedback: true,
    counseling: true,
    schedule: false,
  },
};

const approvalModes: Array<{ key: ApprovalMode; label: string; description: string }> = [
  { key: "suggest_only", label: "추천만", description: "작업 후보만 보여줍니다." },
  { key: "draft_review", label: "초안 작성", description: "메시지 초안까지 준비합니다." },
  { key: "approval_send", label: "승인 후 실행", description: "확인된 항목만 전송합니다." },
];

const toneModes: Array<{ key: ToneMode; label: string }> = [
  { key: "formal", label: "정중" },
  { key: "concise", label: "간결" },
  { key: "warm", label: "부드럽게" },
];

const domains: Array<{ key: DomainKey; label: string; description: string; icon: typeof FileText }> = [
  { key: "reports", label: "채점 리포트", description: "완료된 시험 결과", icon: FileText },
  { key: "feedback", label: "수업 피드백", description: "오늘/최근 수업", icon: GraduationCap },
  { key: "counseling", label: "상담 공유", description: "최근 상담 기록", icon: MessageSquareText },
  { key: "schedule", label: "일정 후속", description: "수업/과제 알림", icon: BellRing },
];

const automationCards = [
  { title: "리포트 발송", status: "활성", detail: "채점 완료 후 학생별 메시지 초안 생성" },
  { title: "수업 피드백", status: "활성", detail: "최근 수업 기준 클래스 단위 후보 생성" },
  { title: "상담 공유", status: "활성", detail: "공유 가능한 상담일지 항목만 제안" },
  { title: "학부모 채널", status: "대기", detail: "연락처/동의/provider 설정 후 확장" },
];

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

function readSettings() {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CO_AGENT_SETTINGS_KEY) || "null") as Partial<CoAgentSettings> | null;
    return {
      approvalMode: parsed?.approvalMode || defaultSettings.approvalMode,
      toneMode: parsed?.toneMode || defaultSettings.toneMode,
      domains: { ...defaultSettings.domains, ...(parsed?.domains || {}) },
    };
  } catch {
    return defaultSettings;
  }
}

export function RoutineQueue() {
  const [settings, setSettings] = useState<CoAgentSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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
  const enabledDomainCount = useMemo(() => domains.filter((domain) => settings.domains[domain.key]).length, [settings.domains]);

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

  function updateSettings(next: Partial<CoAgentSettings>) {
    setSettings((current) => ({ ...current, ...next }));
  }

  function setDomainEnabled(key: DomainKey, enabled: boolean) {
    setSettings((current) => ({ ...current, domains: { ...current.domains, [key]: enabled } }));
  }

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
    } catch (error) {
      setMessage(errorMessage(error, "루틴 알림 전송에 실패했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  useEffect(() => {
    setSettings(readSettings());
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!settingsLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(CO_AGENT_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, settingsLoaded]);

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

      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <Bot className="h-4 w-4" />
            Co-Agent
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">운영 코에이전트</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            테나 포지 내부 기능을 바탕으로 작업을 추천하고, 사용자가 확인한 일만 실행합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-amber-300/20 bg-amber-400/10 text-amber-100">대기 {pendingRoutineCount}건</Badge>
          <Badge className="border border-white/10 bg-white/[0.04] text-slate-200">추천 영역 {enabledDomainCount}개</Badge>
          <Button type="button" size="sm" variant="outline" onClick={() => loadRoutines()} disabled={routineLoading}>
            {routineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            새로고침
          </Button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <Settings2 className="h-4 w-4 text-amber-200" />
                초기 설정
              </div>
              <p className="mt-1 text-xs text-slate-500">이 브라우저에 저장됩니다.</p>
            </div>
            <Badge className="border border-emerald-400/20 bg-emerald-500/10 text-emerald-100">저장됨</Badge>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">권한 단계</p>
              <div className="grid gap-2">
                {approvalModes.map((mode) => {
                  const selected = settings.approvalMode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => updateSettings({ approvalMode: mode.key })}
                      className={cn(
                        "rounded-md border p-3 text-left transition",
                        selected ? "border-amber-300/45 bg-amber-400/10 text-white" : "border-white/10 bg-black/10 text-slate-300 hover:border-white/25"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black">{mode.label}</span>
                        {selected ? <CheckCircle2 className="h-4 w-4 text-amber-200" /> : null}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{mode.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">문체</p>
              <div className="flex rounded-md border border-white/10 bg-black/10 p-1">
                {toneModes.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => updateSettings({ toneMode: mode.key })}
                    className={cn(
                      "h-9 flex-1 rounded px-2 text-sm font-bold transition",
                      settings.toneMode === mode.key ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">추천 영역</p>
              <div className="grid gap-2">
                {domains.map((domain) => {
                  const Icon = domain.icon;
                  return (
                    <label key={domain.key} className="flex items-center gap-3 rounded-md border border-white/10 bg-black/10 p-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={settings.domains[domain.key]}
                        onChange={(event) => setDomainEnabled(domain.key, event.target.checked)}
                        className="h-4 w-4 accent-amber-300"
                      />
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-white">{domain.label}</span>
                        <span className="block truncate text-xs text-slate-500">{domain.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-200" />
              실행 원칙
            </div>
            <div className="mt-3 grid gap-2">
              {["내부 데이터 기준 추천", "메시지 초안 검토", "승인 후 알림 생성"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <ClipboardCheck className="h-4 w-4 text-sky-200" />
              자동화 후보
            </div>
            <div className="mt-3 space-y-2">
              {automationCards.map((card) => (
                <div key={card.title} className="rounded-md border border-white/10 bg-black/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-white">{card.title}</p>
                    <Badge className={cn("border", card.status === "활성" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-slate-400/20 bg-slate-500/10 text-slate-300")}>{card.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
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
