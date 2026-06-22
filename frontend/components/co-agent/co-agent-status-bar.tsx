"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, Radio, Send, X } from "lucide-react";

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
import {
  areCoAgentChatMessagesEqual,
  CO_AGENT_CHAT_STORAGE_EVENT,
  CO_AGENT_CHAT_STORAGE_KEY,
  notifyCoAgentChatMessagesChanged,
  readStoredCoAgentChatMessages,
  writeStoredCoAgentChatMessages,
} from "@/lib/coAgentChatHistory";
import type { CoAgentWorkflow } from "@/lib/coAgent";
import {
  areCoAgentWorkflowsEqual,
  buildErrorCoAgentWorkflow,
  buildRunningCoAgentWorkflow,
  CO_AGENT_WORKFLOW_EVENT,
  CO_AGENT_WORKFLOW_STORAGE_KEY,
  commitCoAgentWorkflow,
  readStoredCoAgentWorkflow,
  workflowFromChatResponse,
} from "@/lib/coAgentWorkflow";
import { cn } from "@/lib/utils";

type CoAgentChatAction = {
  id?: string;
  label?: string;
  kind?: string;
  href?: string;
};

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

function useTypewriterText(text: string, animationKey: number, enabled = true) {
  const [visibleText, setVisibleText] = useState(text);
  const lastAnimationKeyRef = useRef(animationKey);

  useEffect(() => {
    if (!enabled || lastAnimationKeyRef.current === animationKey) {
      setVisibleText(text);
      return;
    }

    lastAnimationKeyRef.current = animationKey;
    setVisibleText("");
    if (!text) return;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 18);

    return () => window.clearInterval(timer);
  }, [animationKey, enabled, text]);

  return visibleText;
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
  const [events, setEvents] = useState<LiveInteractionEvent[]>([]);
  const [notifications, setNotifications] = useState<BatchNotification[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<BatchStatusResponse | null>(null);
  const [pollVersion, setPollVersion] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<CoAgentChatMessage[]>(() => readStoredCoAgentChatMessages());
  const [chatActions, setChatActions] = useState<CoAgentChatAction[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [assistantTypingKey, setAssistantTypingKey] = useState(0);
  const [workflow, setWorkflow] = useState<CoAgentWorkflow | null>(() => readStoredCoAgentWorkflow());
  const lastNeedsInputOpenKeyRef = useRef<string | null>(null);

  const activeStatusData = activeStatus && (activeStatus.status === "pending" || activeStatus.status === "processing") ? activeStatus : null;
  const latestNotification = notifications[0] || null;
  const statusNotification = isFreshNotification(latestNotification) ? latestNotification : null;
  const progress = activeStatusData?.progress_percent ?? 0;
  const primaryLiveEvent = events[0] || null;

  const report = useMemo(() => {
    if (activeStatusData) {
      return {
        tone: "working" as const,
        message: `${taskLabel(activeStatusData)}을 처리 중입니다. ${progress}% 완료했습니다.`,
      };
    }
    if (statusNotification?.status === "done") {
      return {
        tone: "done" as const,
        message: "PDF 추출이 완료되었습니다. 결과를 확인할 수 있습니다.",
      };
    }
    if (statusNotification?.status === "error") {
      return {
        tone: "error" as const,
        message: "최근 PDF 추출에서 오류가 발생했습니다. 확인이 필요합니다.",
      };
    }
    if (primaryLiveEvent) {
      return {
        tone: "idle" as const,
        message: "곧 시작할 수업이 있어 대기 중입니다.",
      };
    }
    return {
      tone: "idle" as const,
      message: "필요한 Tena Forge 업무를 입력해 주세요.",
    };
  }, [activeStatusData, primaryLiveEvent, progress, statusNotification?.status]);

  const latestAssistantMessage = useMemo(() => {
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      const message = chatMessages[index];
      if (message?.role === "assistant") return message.content;
    }
    return "";
  }, [chatMessages]);

  const workflowBubble = workflow?.bubble || null;
  const needsInputStatusMessage = useMemo(() => {
    if (workflow?.status !== "needs_input") return "";
    const message = workflowBubble?.message?.trim();
    return message || "필요한 정보를 알려주세요.";
  }, [workflow?.status, workflowBubble?.message]);

  const statusMessage = chatLoading
    ? "코파일럿이 작업 중입니다."
    : chatError || workflow?.status === "error"
      ? "코파일럿 연결을 확인해주세요."
      : workflow?.status === "needs_input"
        ? needsInputStatusMessage
        : workflow?.status === "created"
          ? "작업 결과를 말풍선에 정리했습니다."
          : workflow?.status === "running"
            ? "코파일럿이 작업 중입니다."
            : report.message;
  const shouldAnimateAssistantMessage = chatOpen && !chatLoading && Boolean(latestAssistantMessage) && workflow?.status === "created";
  const typedReportMessage = useTypewriterText(statusMessage, assistantTypingKey, !prefersReducedMotion && shouldAnimateAssistantMessage);
  const primaryChatAction = chatActions.find((action) => action.href);
  const awaitingFollowUp = workflow?.status === "needs_input";

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
    setChatActions([]);
    setChatInput("");
    setChatError("");
    commitCoAgentWorkflow(buildRunningCoAgentWorkflow());
    setChatLoading(true);
    try {
      const response = await sendCoAgentChat({
        message: content,
        messages: history,
        current_path: typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`,
      });
      setChatMessages((current) => [...current, { role: "assistant", content: response.answer }]);
      setChatActions((response.quick_actions || []).filter((action) => typeof action.href === "string"));
      commitCoAgentWorkflow(workflowFromChatResponse(response));
      setAssistantTypingKey((current) => current + 1);
    } catch (error) {
      const message = chatErrorMessage(error);
      setChatError(message);
      setChatMessages((current) => [...current, { role: "assistant", content: `지금은 AI 연결에 실패했습니다. ${message}` }]);
      setChatActions([]);
      commitCoAgentWorkflow(buildErrorCoAgentWorkflow(message));
      setAssistantTypingKey((current) => current + 1);
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
    writeStoredCoAgentChatMessages(chatMessages);
    notifyCoAgentChatMessagesChanged();
  }, [chatMessages]);

  useEffect(() => {
    function syncStoredChatMessages() {
      const storedMessages = readStoredCoAgentChatMessages();
      setChatMessages((current) => (areCoAgentChatMessagesEqual(current, storedMessages) ? current : storedMessages));
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === CO_AGENT_CHAT_STORAGE_KEY) syncStoredChatMessages();
    }

    window.addEventListener(CO_AGENT_CHAT_STORAGE_EVENT, syncStoredChatMessages);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", syncStoredChatMessages);
    return () => {
      window.removeEventListener(CO_AGENT_CHAT_STORAGE_EVENT, syncStoredChatMessages);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", syncStoredChatMessages);
    };
  }, []);

  useEffect(() => {
    function syncStoredWorkflow() {
      const storedWorkflow = readStoredCoAgentWorkflow();
      setWorkflow((current) => (areCoAgentWorkflowsEqual(current, storedWorkflow) ? current : storedWorkflow));
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === CO_AGENT_WORKFLOW_STORAGE_KEY) syncStoredWorkflow();
    }

    window.addEventListener(CO_AGENT_WORKFLOW_EVENT, syncStoredWorkflow);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", syncStoredWorkflow);
    return () => {
      window.removeEventListener(CO_AGENT_WORKFLOW_EVENT, syncStoredWorkflow);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", syncStoredWorkflow);
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

  useEffect(() => {
    if (workflow?.status !== "needs_input") {
      lastNeedsInputOpenKeyRef.current = null;
      return;
    }
    if (chatLoading) return;
    const needsInputKey = [
      workflow.id,
      workflow.active_step,
      workflowBubble?.field || "",
      workflowBubble?.message || "",
    ].join(":");
    if (lastNeedsInputOpenKeyRef.current === needsInputKey) return;
    lastNeedsInputOpenKeyRef.current = needsInputKey;
    setChatOpen(true);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [chatLoading, workflow?.active_step, workflow?.id, workflow?.status, workflowBubble?.field, workflowBubble?.message]);

  useEffect(() => {
    if (!chatOpen || chatLoading) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [chatError, chatLoading, chatMessages.length, chatOpen]);

  const expandedDesktop = chatOpen && !compact && !awaitingFollowUp;
  const stackedChatInput = chatOpen && (compact || awaitingFollowUp);

  return (
    <div
      data-coagent-anchor="command"
      className={cn("relative min-w-0", compact ? "w-full" : chatOpen && !awaitingFollowUp ? "w-full max-w-none" : "w-full max-w-[760px]")}
    >
      <div
        className={cn(
          "relative isolate min-w-0 overflow-hidden rounded-[14px] bg-white/82 px-3 text-zinc-950 transition-all",
          stackedChatInput ? "min-h-[86px] py-2" : chatOpen ? "min-h-[58px] py-2" : "min-h-[52px] py-2.5",
          stackedChatInput
            ? "flex flex-col justify-center gap-2"
            : expandedDesktop
              ? cn(
                  "grid items-center gap-4",
                  primaryChatAction?.href
                    ? "grid-cols-[minmax(18rem,1fr)_auto_minmax(18rem,28rem)]"
                    : "grid-cols-[minmax(18rem,1fr)_minmax(18rem,30rem)]"
                )
              : "flex items-center gap-3"
        )}
      >
        <button
          type="button"
          data-coagent-status-message
          className={cn(
            "flex min-w-0 max-w-full overflow-hidden rounded-[10px] px-1.5 text-left transition hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10",
            expandedDesktop
              ? "h-11 w-full items-center bg-zinc-50/80 py-1 pr-4"
              : chatOpen
                ? "min-h-10 flex-1 items-center py-1 pr-2"
                : "flex-1 items-center py-1",
            stackedChatInput && "w-full"
          )}
          onClick={() => setChatOpen(true)}
          title={statusMessage}
          aria-live="polite"
        >
          <span className="min-w-0 flex-1 overflow-hidden">
            <span
              className={cn(
                "block max-w-full overflow-hidden font-medium tracking-normal text-zinc-800",
                expandedDesktop ? "line-clamp-2 whitespace-normal break-words text-[15px] leading-[1.35]" : "text-[16px] leading-[1.45]",
                !expandedDesktop && (chatOpen ? "line-clamp-2 whitespace-normal break-words" : "truncate")
              )}
            >
              {typedReportMessage || "\u00A0"}
            </span>
          </span>
        </button>

        {activeStatusData ? (
          <span className="pointer-events-none absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-zinc-100">
            <span className="block h-full rounded-full bg-black transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
        ) : null}

        {chatOpen && primaryChatAction?.href ? (
          <button
            type="button"
            className={cn(
              "inline-flex h-10 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-[12px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800",
              compact ? "w-full" : "max-w-[9rem]"
            )}
            onClick={() => router.push(primaryChatAction.href || "/problem-sets")}
          >
            <span className="truncate">{primaryChatAction.label || "확인하기"}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        ) : null}

        {chatOpen ? (
          <form
            data-coagent-chat-form
            className={cn(
              "relative z-10 flex h-11 min-w-0 items-center gap-1.5 rounded-[12px] bg-zinc-100 px-2 shadow-[0_10px_24px_rgba(0,0,0,0.06)]",
              stackedChatInput ? "w-full" : expandedDesktop ? "w-full" : "w-[clamp(18rem,34vw,32rem)] shrink-0"
            )}
            onSubmit={submitChat}
          >
            <input
              ref={inputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-500"
              placeholder={workflow?.status === "needs_input" ? workflowBubble?.placeholder || "답변 입력" : "Tena Forge 업무 입력"}
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
