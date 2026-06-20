"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, CheckCircle2, Loader2, MessageSquareText, Radio, Send, X } from "lucide-react";

import { LiveInteractionEvent, listUpcomingLiveInteractions } from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, WORKSPACE_CHANGED_EVENT, getActiveWorkspaceId } from "@/lib/auth-client";
import {
  addBatchStatusNotification,
  BATCH_NOTIFICATION_EVENT,
  BATCH_NOTIFICATION_STORAGE_KEY,
  readBatchNotifications,
} from "@/lib/batch-notifications";
import type { BatchNotification } from "@/lib/batch-notifications";
import {
  ACTIVE_BATCH_EVENT,
  ACTIVE_BATCH_STORAGE_KEY,
  fetchActiveBatchStatus,
  fetchBatchStatus,
  forgetActiveBatch,
  readActiveBatch,
  rememberActiveBatch,
  shouldForgetActiveBatchAfterStatusError,
} from "@/lib/batch-progress";
import type { BatchStatusResponse } from "@/lib/batch-progress";
import type { CoAgentChatMessage } from "@/lib/coAgent";
import { sendCoAgentChat } from "@/lib/coAgent";
import { cn } from "@/lib/utils";

function greetingLabel() {
  const hour = new Date().getHours();
  if (hour < 6) return "좋은 밤입니다.";
  if (hour < 12) return "좋은 오전입니다.";
  if (hour < 18) return "좋은 오후입니다.";
  return "좋은 저녁입니다.";
}

function liveTimeLabel(event: LiveInteractionEvent) {
  if (event.minutes_until_start <= 0) return "지금";
  return `${event.minutes_until_start}분 후`;
}

function taskLabel(statusData: BatchStatusResponse) {
  return statusData.processing_task === "solution_only" ? "답안 재처리" : "PDF 추출";
}

function statusHref(statusData: BatchStatusResponse | null, notification: BatchNotification | null) {
  if (statusData) return "/archive/new";
  if (notification) return notification.href;
  return "/co-agent/routines";
}

function chatErrorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (candidate.message === "Network Error") return "Co-Agent AI 서버에 연결하지 못했습니다.";
  return candidate.message || "Co-Agent AI 응답을 만들지 못했습니다.";
}

export function CoAgentStatusBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(() => greetingLabel());
  const [events, setEvents] = useState<LiveInteractionEvent[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [notifications, setNotifications] = useState<BatchNotification[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<BatchStatusResponse | null>(null);
  const [pollVersion, setPollVersion] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<CoAgentChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const activeStatusData = activeStatus && (activeStatus.status === "pending" || activeStatus.status === "processing") ? activeStatus : null;
  const latestNotification = notifications[0] || null;
  const progress = activeStatusData?.progress_percent ?? 0;
  const primaryLiveEvent = events[0] || null;
  const reportHref = statusHref(activeStatusData, latestNotification);

  const report = useMemo(() => {
    if (activeStatusData) {
      return {
        tone: "working" as const,
        icon: Loader2,
        message: `안녕하세요. ${greeting} ${taskLabel(activeStatusData)}을 처리 중입니다. ${progress}% 완료했습니다.`,
      };
    }
    if (latestNotification?.status === "done") {
      return {
        tone: "done" as const,
        icon: CheckCircle2,
        message: `안녕하세요. ${greeting} 이전 지시 사항을 완료했습니다. 추출 결과가 준비되었습니다.`,
      };
    }
    if (latestNotification?.status === "error") {
      return {
        tone: "error" as const,
        icon: AlertTriangle,
        message: `안녕하세요. ${greeting} 이전 작업에서 오류가 발생했습니다. 확인이 필요합니다.`,
      };
    }
    return {
      tone: "idle" as const,
      icon: Bot,
      message: `안녕하세요. ${greeting} 이전 지시 사항을 확인했고, 현재 실시간 대기 중입니다.`,
    };
  }, [activeStatusData, greeting, latestNotification?.status, progress]);

  const ReportIcon = report.icon;
  const visibleChatMessages = chatMessages.slice(-8);

  const loadLiveInteractions = useCallback(async () => {
    const activeWorkspaceId = getActiveWorkspaceId();
    if (activeWorkspaceId === "student") {
      setEvents([]);
      return;
    }
    setLiveLoading(true);
    try {
      const data = await listUpcomingLiveInteractions();
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content || chatLoading) return;

    const history = chatMessages.slice(-10);
    const userMessage: CoAgentChatMessage = { role: "user", content };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput("");
    setChatError("");
    setChatLoading(true);
    try {
      const response = await sendCoAgentChat({
        message: content,
        messages: history,
        current_path: typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`,
      });
      setChatMessages((current) => [...current, { role: "assistant", content: response.answer }]);
    } catch (error) {
      const message = chatErrorMessage(error);
      setChatError(message);
      setChatMessages((current) => [...current, { role: "assistant", content: `지금은 Co-Agent AI 연결에 실패했습니다. ${message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    setNotifications(readBatchNotifications());
    setActiveBatchId(readActiveBatch());

    function handleNotificationChange() {
      setNotifications(readBatchNotifications());
    }

    function handleActiveBatchChange(event: Event) {
      const customEvent = event as CustomEvent<string>;
      setActiveStatus(null);
      setActiveBatchId(customEvent.detail || readActiveBatch());
      setPollVersion((value) => value + 1);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === BATCH_NOTIFICATION_STORAGE_KEY) setNotifications(readBatchNotifications());
      if (event.key === ACTIVE_BATCH_STORAGE_KEY) {
        setActiveStatus(null);
        setActiveBatchId(readActiveBatch());
        setPollVersion((value) => value + 1);
      }
    }

    window.addEventListener(BATCH_NOTIFICATION_EVENT, handleNotificationChange);
    window.addEventListener(ACTIVE_BATCH_EVENT, handleActiveBatchChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(BATCH_NOTIFICATION_EVENT, handleNotificationChange);
      window.removeEventListener(ACTIVE_BATCH_EVENT, handleActiveBatchChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    loadLiveInteractions();
    const interval = window.setInterval(loadLiveInteractions, 30000);
    window.addEventListener(AUTH_CHANGED_EVENT, loadLiveInteractions);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, loadLiveInteractions);
    window.addEventListener("focus", loadLiveInteractions);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(AUTH_CHANGED_EVENT, loadLiveInteractions);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, loadLiveInteractions);
      window.removeEventListener("focus", loadLiveInteractions);
    };
  }, [loadLiveInteractions]);

  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingLabel());
    const interval = window.setInterval(updateGreeting, 60000);
    window.addEventListener("focus", updateGreeting);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateGreeting);
    };
  }, []);

  useEffect(() => {
    if (!activeBatchId) {
      setActiveStatus(null);
      return;
    }

    const batchId = activeBatchId;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const data = await fetchBatchStatus(batchId);
        if (cancelled) return;
        if (data.status === "done" || data.status === "error") {
          const notification = addBatchStatusNotification(data);
          if (notification) setNotifications(readBatchNotifications());
          forgetActiveBatch(batchId);
          setActiveBatchId(null);
          setActiveStatus(null);
          if (timer) window.clearInterval(timer);
          return;
        }
        setActiveStatus(data);
      } catch (error) {
        if (shouldForgetActiveBatchAfterStatusError(error)) {
          forgetActiveBatch(batchId);
          if (!cancelled) {
            setActiveBatchId(null);
            setActiveStatus(null);
          }
          if (timer) window.clearInterval(timer);
          return;
        }
        try {
          const activeBatch = await fetchActiveBatchStatus();
          if (cancelled || !activeBatch) return;
          rememberActiveBatch(activeBatch.batch_id);
          setActiveBatchId(activeBatch.batch_id);
          setActiveStatus(activeBatch);
        } catch {
          // Keep the current active id and retry on the next interval.
        }
      }
    }

    poll();
    timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [activeBatchId, pollVersion]);

  useEffect(() => {
    let cancelled = false;

    async function discoverActiveBatch() {
      if (activeBatchId || readActiveBatch()) return;
      try {
        const activeBatch = await fetchActiveBatchStatus();
        if (cancelled || !activeBatch) return;
        rememberActiveBatch(activeBatch.batch_id);
        setActiveBatchId(activeBatch.batch_id);
        setActiveStatus(activeBatch);
      } catch {
        // The status bar should stay quiet when there is no active authenticated batch.
      }
    }

    void discoverActiveBatch();
    const timer = window.setInterval(() => void discoverActiveBatch(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeBatchId]);

  return (
    <div className={cn("relative min-w-0", compact ? "w-full" : "w-full max-w-[760px]")}>
      <div className="relative flex min-w-0 items-center gap-2 overflow-hidden rounded-[14px] bg-white/78 px-2.5 py-2 text-zinc-950">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-1 text-left transition hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
          onClick={() => setChatOpen(true)}
          title={report.message}
        >
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-[10px]",
              report.tone === "error" ? "bg-zinc-900 text-white" : report.tone === "done" ? "bg-black text-white" : "bg-zinc-100 text-zinc-950"
            )}
          >
            <ReportIcon className={cn("h-4 w-4", report.tone === "working" && "animate-spin")} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Co-Agent</span>
            <span className="block truncate text-xs font-semibold text-zinc-800">{report.message}</span>
          </span>
        </button>

        {activeStatusData ? (
          <span className="pointer-events-none absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-zinc-100">
            <span className="block h-full rounded-full bg-black transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
        ) : null}

        {primaryLiveEvent ? (
          <button
            type="button"
            onClick={() => router.push(primaryLiveEvent.live_href)}
            className="inline-flex h-9 max-w-[15rem] shrink-0 items-center gap-2 rounded-[10px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800"
            title={`${primaryLiveEvent.class_name} · ${primaryLiveEvent.title}`}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">수업 시작</span>
            <span className="hidden max-w-[7rem] truncate lg:inline">{primaryLiveEvent.class_name}</span>
            <span className="rounded-[6px] bg-zinc-800 px-1.5 py-0.5 text-[10px] text-white">{liveTimeLabel(primaryLiveEvent)}</span>
          </button>
        ) : (
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-zinc-100 px-3 text-xs font-black text-zinc-600">
            {liveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
            실시간 대기
          </span>
        )}
      </div>

      {chatOpen ? (
        <div
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+8px)] z-[3500] rounded-[14px] bg-white p-3 text-zinc-950",
            compact && "fixed left-4 right-4 top-[112px]"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                <MessageSquareText className="h-3.5 w-3.5" />
                Co-Agent Chat
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-zinc-600">Tena Forge 업무만 답변합니다.</p>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 hover:text-black"
              onClick={() => setChatOpen(false)}
              aria-label="Co-Agent 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            <div className="rounded-[12px] bg-zinc-100 px-3 py-2 text-xs leading-5 text-zinc-800">
              {report.message}
            </div>
            {visibleChatMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                className={cn(
                  "rounded-[12px] px-3 py-2 text-xs leading-5",
                  message.role === "user" ? "ml-8 bg-black text-white" : "mr-8 bg-zinc-100 text-zinc-800"
                )}
              >
                {message.content}
              </div>
            ))}
            {chatLoading ? (
              <div className="mr-8 flex items-center gap-2 rounded-[12px] bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI가 Tena Forge 업무 범위 안에서 확인 중입니다.
              </div>
            ) : null}
          </div>

          {chatError ? <p className="mt-2 text-xs font-semibold text-zinc-600">{chatError}</p> : null}

          <form className="mt-3 flex items-center gap-2" onSubmit={submitChat}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-[10px] bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-black/10"
              placeholder="Tena Forge 업무를 입력하세요"
              disabled={chatLoading}
            />
            <button
              type="submit"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              disabled={chatLoading || !chatInput.trim()}
              aria-label="Co-Agent에게 보내기"
            >
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          <button
            type="button"
            className="mt-2 inline-flex h-8 items-center rounded-[9px] bg-zinc-100 px-3 text-xs font-black text-zinc-700 transition hover:bg-zinc-200 hover:text-black"
            onClick={() => router.push(reportHref)}
          >
            관련 화면 열기
          </button>
        </div>
      ) : null}
    </div>
  );
}
