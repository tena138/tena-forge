"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radio, Send, X } from "lucide-react";

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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const handleChange = () => setReduced(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

function useTypewriterText(text: string, enabled = true) {
  const [visibleText, setVisibleText] = useState(text);

  useEffect(() => {
    if (!enabled) {
      setVisibleText(text);
      return;
    }

    setVisibleText("");
    if (!text) return;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 18);

    return () => window.clearInterval(timer);
  }, [enabled, text]);

  return visibleText;
}

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

function isFreshNotification(notification: BatchNotification | null) {
  if (!notification?.createdAt) return false;
  const createdAt = new Date(notification.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt < 1000 * 60 * 30;
}

function chatErrorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (candidate.message === "Network Error") return "AI 서버에 연결하지 못했습니다.";
  return candidate.message || "AI 응답을 만들지 못했습니다.";
}

export function CoAgentStatusBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const prefersReducedMotion = usePrefersReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [greeting, setGreeting] = useState(() => greetingLabel());
  const [events, setEvents] = useState<LiveInteractionEvent[]>([]);
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
  const statusNotification = isFreshNotification(latestNotification) ? latestNotification : null;
  const progress = activeStatusData?.progress_percent ?? 0;
  const primaryLiveEvent = events[0] || null;

  const report = useMemo(() => {
    if (activeStatusData) {
      return {
        tone: "working" as const,
        message: `안녕하세요. ${greeting} ${taskLabel(activeStatusData)}을 처리 중입니다. ${progress}% 완료했습니다.`,
      };
    }
    if (statusNotification?.status === "done") {
      return {
        tone: "done" as const,
        message: `안녕하세요. ${greeting} 방금 PDF 추출이 완료되어 결과를 확인할 수 있습니다.`,
      };
    }
    if (statusNotification?.status === "error") {
      return {
        tone: "error" as const,
        message: `안녕하세요. ${greeting} 최근 PDF 추출에서 오류가 발생했습니다. 확인이 필요합니다.`,
      };
    }
    if (primaryLiveEvent) {
      return {
        tone: "idle" as const,
        message: `안녕하세요. ${greeting} 곧 시작할 수업이 있어 대기 중입니다.`,
      };
    }
    return {
      tone: "idle" as const,
      message: `안녕하세요. ${greeting} 현재 대기 중입니다. 필요한 Tena Forge 업무를 입력해 주세요.`,
    };
  }, [activeStatusData, greeting, primaryLiveEvent, progress, statusNotification?.status]);

  const latestAssistantMessage = useMemo(() => {
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      const message = chatMessages[index];
      if (message?.role === "assistant") return message.content;
    }
    return "";
  }, [chatMessages]);

  const statusMessage =
    chatOpen && (chatLoading || chatError || latestAssistantMessage)
      ? chatLoading
        ? "Tena Forge 업무 범위 안에서 확인 중입니다."
        : chatError || latestAssistantMessage
      : report.message;
  const typedReportMessage = useTypewriterText(statusMessage, !prefersReducedMotion);

  const loadLiveInteractions = useCallback(async () => {
    const activeWorkspaceId = getActiveWorkspaceId();
    if (activeWorkspaceId === "student") {
      setEvents([]);
      return;
    }
    try {
      const data = await listUpcomingLiveInteractions();
      setEvents(data.events || []);
    } catch {
      setEvents([]);
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
      setChatMessages((current) => [...current, { role: "assistant", content: `지금은 AI 연결에 실패했습니다. ${message}` }]);
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
    const updateGreeting = () => {
      const nextGreeting = greetingLabel();
      setGreeting((current) => (current === nextGreeting ? current : nextGreeting));
    };
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

  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  return (
    <div className={cn("relative min-w-0", compact ? "w-full" : "w-full max-w-[760px]")}>
      <div className="relative flex min-h-[52px] min-w-0 items-center gap-2 overflow-hidden rounded-[14px] bg-white/78 px-3 py-2.5 text-zinc-950">
        <button
          type="button"
          className={cn(
            "flex min-w-0 items-center rounded-[10px] px-1.5 py-1 text-left transition hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10",
            chatOpen ? "flex-[1_1_42%]" : "flex-1"
          )}
          onClick={() => setChatOpen(true)}
          title={statusMessage}
        >
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-medium leading-[1.55] tracking-normal text-zinc-800">{typedReportMessage || "\u00A0"}</span>
          </span>
        </button>

        {activeStatusData ? (
          <span className="pointer-events-none absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-zinc-100">
            <span className="block h-full rounded-full bg-black transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
        ) : null}

        {chatOpen ? (
          <form
            className={cn(
              "flex h-10 min-w-[220px] shrink-0 items-center gap-1.5 rounded-[12px] bg-zinc-100 px-2",
              compact ? "w-[min(58vw,20rem)]" : "w-[min(42vw,24rem)]"
            )}
            onSubmit={submitChat}
          >
            <input
              ref={inputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-500"
              placeholder="Tena Forge 업무 입력"
              disabled={chatLoading}
            />
            <button
              type="submit"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              disabled={chatLoading || !chatInput.trim()}
              aria-label="AI에게 보내기"
            >
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-zinc-500 transition hover:bg-zinc-200 hover:text-black"
              onClick={() => setChatOpen(false)}
              aria-label="입력 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : primaryLiveEvent ? (
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
        ) : null}
      </div>
    </div>
  );
}
