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
import { collectVisibleCoAgentContext, sendCoAgentChat } from "@/lib/coAgent";
import {
  areCoAgentChatMessagesEqual,
  CO_AGENT_CHAT_STORAGE_EVENT,
  CO_AGENT_CHAT_STORAGE_KEY,
  notifyCoAgentChatMessagesChanged,
  readStoredCoAgentChatMessages,
  writeStoredCoAgentChatMessages,
} from "@/lib/coAgentChatHistory";
import type { CoAgentWorkflow } from "@/lib/coAgent";
import { CO_AGENT_STATUS_MESSAGE_EVENT, type CoAgentStatusMessage } from "@/lib/coAgentStatus";
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

function PixelCoAgentFace({ compact = false }: { compact?: boolean }) {
  return (
    <span
      data-coagent-command-slot
      className={cn(
        "relative z-[1] grid shrink-0 place-items-center rounded-[9px] bg-white text-black ring-1 ring-black/10",
        "shadow-[0_6px_16px_rgba(24,24,27,0.08)]",
        compact ? "h-8 w-8" : "h-9 w-9"
      )}
      role="img"
      aria-label="코에이전트"
    >
      <svg
        viewBox="0 0 20 20"
        className={cn(compact ? "h-[22px] w-[22px]" : "h-6 w-6", "[image-rendering:pixelated]")}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="2" height="2" fill="currentColor" />
        <rect x="8" y="4" width="4" height="1" fill="currentColor" />
        <rect x="5" y="6" width="10" height="1" fill="currentColor" />
        <rect x="4" y="7" width="1" height="7" fill="currentColor" />
        <rect x="15" y="7" width="1" height="7" fill="currentColor" />
        <rect x="5" y="14" width="10" height="1" fill="currentColor" />
        <rect x="6" y="8" width="8" height="5" fill="white" />
        <rect x="7" y="9" width="2" height="2" fill="currentColor" />
        <rect x="11" y="9" width="2" height="2" fill="currentColor" />
        <rect x="8" y="12" width="4" height="1" fill="currentColor" />
      </svg>
    </span>
  );
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
  const [transientStatus, setTransientStatus] = useState<CoAgentStatusMessage | null>(null);
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
      message: "필요한 업무를 입력해 주세요.",
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
  const sidebarBubbleOwnsInput = Boolean(
    workflow?.status === "needs_input" &&
      workflow.active_step &&
      workflow.active_step !== "command" &&
      workflowBubble?.variant === "question"
  );
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
          : transientStatus?.message || report.message;
  const shouldAnimateAssistantMessage = chatOpen && !chatLoading && Boolean(latestAssistantMessage) && workflow?.status === "created";
  const typedReportMessage = useTypewriterText(statusMessage, assistantTypingKey, !prefersReducedMotion && shouldAnimateAssistantMessage);
  const primaryChatAction = chatActions.find((action) => action.href);

  const loadLiveInteractions = useCallback(async () => {
    const activeWorkspaceId = getActiveWorkspaceId();
    if (activeWorkspaceId === "student") {
      setEvents([]);
      return;
    }
    try {
      const data = await listUpcomingLiveInteractions();
      setEvents((data.events || []).filter((event) => event.minutes_until_start <= 5 || event.status === "ready"));
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
    commitCoAgentWorkflow(buildRunningCoAgentWorkflow(undefined, workflow));
    setChatLoading(true);
    try {
      const visibleContext = collectVisibleCoAgentContext();
      const response = await sendCoAgentChat({
        message: content,
        messages: history,
        current_path: visibleContext?.current_path || (typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`),
        visible_context: visibleContext,
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

    let transientTimer: number | null = null;

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

    function handleTransientStatus(event: Event) {
      const customEvent = event as CustomEvent<CoAgentStatusMessage>;
      const message = customEvent.detail?.message?.trim();
      if (!message) return;
      setTransientStatus({
        message,
        tone: customEvent.detail?.tone || "idle",
        durationMs: customEvent.detail?.durationMs,
      });
      if (transientTimer) window.clearTimeout(transientTimer);
      transientTimer = window.setTimeout(() => {
        setTransientStatus(null);
        transientTimer = null;
      }, customEvent.detail?.durationMs || 7000);
    }

    window.addEventListener(BATCH_NOTIFICATION_EVENT, handleNotificationChange);
    window.addEventListener(ACTIVE_BATCH_EVENT, handleActiveBatchChange);
    window.addEventListener(CO_AGENT_STATUS_MESSAGE_EVENT, handleTransientStatus);
    window.addEventListener("storage", handleStorage);
    return () => {
      if (transientTimer) window.clearTimeout(transientTimer);
      window.removeEventListener(BATCH_NOTIFICATION_EVENT, handleNotificationChange);
      window.removeEventListener(ACTIVE_BATCH_EVENT, handleActiveBatchChange);
      window.removeEventListener(CO_AGENT_STATUS_MESSAGE_EVENT, handleTransientStatus);
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
    if (sidebarBubbleOwnsInput) {
      lastNeedsInputOpenKeyRef.current = null;
      setChatOpen(false);
      return;
    }
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
  }, [chatLoading, sidebarBubbleOwnsInput, workflow?.active_step, workflow?.id, workflow?.status, workflowBubble?.field, workflowBubble?.message]);

  useEffect(() => {
    if (!chatOpen || chatLoading) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [chatError, chatLoading, chatMessages.length, chatOpen]);

  return (
    <div
      data-coagent-anchor="command"
      className={cn(
        "relative min-w-0",
        compact ? "w-full" : "w-full max-w-[760px]"
      )}
    >
      <div
        className={cn(
          "relative isolate min-w-0 overflow-hidden rounded-[14px] bg-white/82 px-3 text-zinc-950 transition-all",
          "min-h-[52px] py-2.5",
          "flex items-center gap-3"
        )}
      >
        <PixelCoAgentFace compact={compact} />
        {chatOpen && !sidebarBubbleOwnsInput ? (
          <form
            data-coagent-chat-form
            className="z-50 flex h-10 min-w-0 flex-1 items-center gap-1.5 px-0"
            onSubmit={submitChat}
          >
            <input
              ref={inputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-500"
              placeholder={workflow?.status === "needs_input" ? workflowBubble?.placeholder || "답변 입력" : "업무 입력"}
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
        ) : (
          <button
            type="button"
            data-coagent-status-message
            className={cn(
              "flex min-w-0 max-w-full overflow-hidden rounded-[10px] pl-1.5 pr-1.5 text-left transition hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10",
              "flex-1 items-center py-1"
            )}
            onClick={() => setChatOpen(true)}
            title={statusMessage}
            aria-live="polite"
          >
            <span className="min-w-0 flex-1 overflow-hidden">
              <span
                className={cn(
                  "block max-w-full overflow-hidden font-medium tracking-normal text-zinc-800",
                  "truncate whitespace-nowrap text-[16px] leading-[1.45]"
                )}
              >
                {typedReportMessage || "\u00A0"}
              </span>
            </span>
          </button>
        )}

        {activeStatusData ? (
          <span className="pointer-events-none absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-zinc-100">
            <span className="block h-full rounded-full bg-black transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
        ) : null}

        {!chatOpen && primaryChatAction?.href ? (
          <button
            type="button"
            className={cn(
              "inline-flex h-10 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-[12px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800",
              compact ? "max-w-[7rem]" : "max-w-[9rem]"
            )}
            onClick={() => router.push(primaryChatAction.href || "/problem-sets")}
          >
            <span className="truncate">{primaryChatAction.label || "확인하기"}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        ) : null}

        {!chatOpen && primaryLiveEvent ? (
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
