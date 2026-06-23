"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, Send, X } from "lucide-react";

import type { CoAgentChatMessage, CoAgentSubjectChoice, CoAgentWorkflow } from "@/lib/coAgent";
import { collectVisibleCoAgentContext, getCoAgentSubjectChoices, sendCoAgentChat } from "@/lib/coAgent";
import {
  MAX_STORED_CHAT_MESSAGES,
  notifyCoAgentChatMessagesChanged,
  readStoredCoAgentChatMessages,
  writeStoredCoAgentChatMessages,
} from "@/lib/coAgentChatHistory";
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

type OverlayLayout = {
  x: number;
  y: number;
  bubbleLeft: number;
  bubbleTop: number;
  bubbleWidth: number;
  mobile: boolean;
  targetRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  labelLeft?: number;
  labelTop?: number;
  targetKind?: "command" | "sidebar" | "inline";
};

function isVisibleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function visibleAnchorFor(step: string) {
  const anchors = Array.from(document.querySelectorAll<HTMLElement>(`[data-coagent-anchor="${step}"]`));
  return anchors.find(isVisibleElement) || null;
}

function visibleTargetFor(workflow: CoAgentWorkflow | null, activeStep: string) {
  const selector = workflow?.target?.selector?.trim();
  if (selector) {
    try {
      const targets = Array.from(document.querySelectorAll<HTMLElement>(selector));
      const target = targets.find(isVisibleElement);
      if (target) return target;
    } catch {
      // Ignore malformed selectors from stored transient workflow state.
    }
  }
  return visibleAnchorFor(workflow?.target?.step || activeStep) || visibleAnchorFor(activeStep) || visibleAnchorFor("command");
}

function targetActionLabel(action?: string) {
  if (action === "wait") return "대기 중";
  if (action === "click") return "클릭 위치";
  if (action === "created") return "완료";
  if (action === "read") return "읽는 중";
  return "진행 중";
}

function chatErrorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (candidate.message === "Network Error") return "AI 서버에 연결하지 못했습니다.";
  return candidate.message || "AI 응답을 만들지 못했습니다.";
}

function commitChatMessages(messages: CoAgentChatMessage[]) {
  writeStoredCoAgentChatMessages(messages.slice(-MAX_STORED_CHAT_MESSAGES));
  notifyCoAgentChatMessagesChanged();
}

export function CoAgentJellyOverlay() {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<CoAgentWorkflow | null>(() => readStoredCoAgentWorkflow());
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fallbackSubjectChoices, setFallbackSubjectChoices] = useState<CoAgentSubjectChoice[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeStep = workflow?.active_step || "command";
  const target = workflow?.target || null;
  const bubble = workflow?.bubble || null;
  const showBubble = Boolean(bubble && workflow?.status && workflow.status !== "idle");
  const acceptsInput = workflow?.status === "needs_input" && bubble?.variant === "question";
  const bubbleProvidedChoices = bubble?.choices || [];
  const needsSubjectChoiceFallback = acceptsInput && bubble?.field === "subject" && bubbleProvidedChoices.length === 0;
  const activeBubbleChoices = (bubbleProvidedChoices.length ? bubbleProvidedChoices : needsSubjectChoiceFallback ? fallbackSubjectChoices : []).filter((choice) => choice && (choice.value || choice.label));
  const hasChoiceButtons = acceptsInput && activeBubbleChoices.length > 0;

  const syncWorkflow = useCallback(() => {
    const storedWorkflow = readStoredCoAgentWorkflow();
    setWorkflow((current) => (areCoAgentWorkflowsEqual(current, storedWorkflow) ? current : storedWorkflow));
  }, []);

  const updateLayout = useCallback(() => {
    const targetElement = visibleTargetFor(workflow, activeStep);
    if (!targetElement) return;
    const targetIsSidebar = Boolean(targetElement.closest("[data-coagent-sidebar-nav]"));
    const sidebarIconElement = targetIsSidebar ? targetElement.querySelector<HTMLElement>("[data-coagent-icon-shell]") : null;
    const mobile = window.innerWidth < 1024;
    const targetKind = targetIsSidebar ? "sidebar" : activeStep === "command" ? "command" : "inline";
    const commandSlotElement = targetKind === "command" ? targetElement.querySelector<HTMLElement>("[data-coagent-command-slot]") : null;
    const rect = (sidebarIconElement || commandSlotElement || targetElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const bubbleWidth = mobile ? Math.max(280, window.innerWidth - 32) : 360;
    const preferredLeft = rect.right + 14;
    const fallbackLeft = rect.left - bubbleWidth - 14;
    const bubbleLeft = preferredLeft + bubbleWidth + 16 <= window.innerWidth ? preferredLeft : Math.max(16, fallbackLeft);
    const bubbleTop = Math.min(Math.max(12, rect.top - 4), Math.max(12, window.innerHeight - 260));
    const labelLeft = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 220));
    const labelTop = rect.top > 40 ? rect.top - 34 : rect.bottom + 8;
    const sidebarSpotlightSize = Math.max(50, Math.min(58, Math.max(rect.width, rect.height) + 34));
    setLayout({
      x,
      y,
      bubbleLeft,
      bubbleTop,
      bubbleWidth,
      mobile,
      targetRect: {
        left: targetIsSidebar ? rect.left + rect.width / 2 - sidebarSpotlightSize / 2 : Math.max(4, rect.left - 5),
        top: targetIsSidebar ? rect.top + rect.height / 2 - sidebarSpotlightSize / 2 : Math.max(4, rect.top - 5),
        width: targetIsSidebar ? sidebarSpotlightSize : rect.width + 10,
        height: targetIsSidebar ? sidebarSpotlightSize : rect.height + 10,
      },
      labelLeft,
      labelTop,
      targetKind,
    });
  }, [activeStep, workflow]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === CO_AGENT_WORKFLOW_STORAGE_KEY) syncWorkflow();
    }

    syncWorkflow();
    window.addEventListener(CO_AGENT_WORKFLOW_EVENT, syncWorkflow);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", syncWorkflow);
    return () => {
      window.removeEventListener(CO_AGENT_WORKFLOW_EVENT, syncWorkflow);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", syncWorkflow);
    };
  }, [syncWorkflow]);

  useEffect(() => {
    let frame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateLayout);
    };
    scheduleUpdate();
    const timer = window.setInterval(scheduleUpdate, 350);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [updateLayout]);

  useEffect(() => {
    let active = true;
    if (!needsSubjectChoiceFallback) {
      if (bubble?.field !== "subject") setFallbackSubjectChoices([]);
      return () => {
        active = false;
      };
    }

    getCoAgentSubjectChoices()
      .then((response) => {
        if (active) setFallbackSubjectChoices(response.choices || []);
      })
      .catch(() => {
        if (active) setFallbackSubjectChoices([]);
      });

    return () => {
      active = false;
    };
  }, [bubble?.field, needsSubjectChoiceFallback, workflow?.id]);

  useEffect(() => {
    if (acceptsInput && showBubble && !loading && !hasChoiceButtons) inputRef.current?.focus();
  }, [acceptsInput, hasChoiceButtons, loading, showBubble, workflow?.id, workflow?.active_step]);

  async function submitContent(rawContent: string) {
    const content = rawContent.trim();
    if (!content || loading) return;

    const history = readStoredCoAgentChatMessages().slice(-10);
    const nextMessages = [...readStoredCoAgentChatMessages(), { role: "user" as const, content }];
    commitChatMessages(nextMessages);
    setInput("");
    setLoading(true);
    commitCoAgentWorkflow(buildRunningCoAgentWorkflow("답변을 반영해 작업을 이어가고 있습니다.", workflow));

    try {
      const visibleContext = collectVisibleCoAgentContext();
      const response = await sendCoAgentChat({
        message: content,
        messages: history,
        current_path: visibleContext?.current_path || (typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`),
        visible_context: visibleContext,
      });
      commitChatMessages([...readStoredCoAgentChatMessages(), { role: "assistant", content: response.answer }]);
      commitCoAgentWorkflow(workflowFromChatResponse(response));
    } catch (error) {
      const message = chatErrorMessage(error);
      commitChatMessages([...readStoredCoAgentChatMessages(), { role: "assistant", content: `지금 AI 연결에 실패했습니다. ${message}` }]);
      commitCoAgentWorkflow(buildErrorCoAgentWorkflow(message));
    } finally {
      setLoading(false);
    }
  }

  async function submitBubble(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitContent(input);
  }

  const resolvedLayout =
    layout ||
    ({
      x: 96,
      y: 44,
      bubbleLeft: 16,
      bubbleTop: 78,
      bubbleWidth: 360,
      mobile: false,
    } satisfies OverlayLayout);

  const bubbleStyle = resolvedLayout.mobile
    ? { left: 16, right: 16, bottom: 18 }
    : { left: resolvedLayout.bubbleLeft, top: resolvedLayout.bubbleTop, width: resolvedLayout.bubbleWidth };
  const bubbleTitle = bubble?.title?.trim() || "";
  const showBubbleTitle = Boolean(bubbleTitle && bubble?.variant !== "question");
  const targetIsSidebar = resolvedLayout.targetKind === "sidebar";
  const targetIsCommand = resolvedLayout.targetKind === "command";
  const showTargetSpotlight = Boolean(resolvedLayout.targetRect && workflow?.status && workflow.status !== "idle" && !targetIsCommand);

  return (
    <div className="pointer-events-none fixed inset-0 z-[2100]" aria-live="polite">
      {showTargetSpotlight && resolvedLayout.targetRect ? (
        <>
          {targetIsSidebar ? (
            <div
              className={cn("coagent-sidebar-jelly-ring", workflow?.status === "needs_input" && "coagent-sidebar-jelly-ring--asking")}
              style={{
                left: resolvedLayout.targetRect.left,
                top: resolvedLayout.targetRect.top,
                width: resolvedLayout.targetRect.width,
                height: resolvedLayout.targetRect.height,
              }}
              aria-hidden="true"
            />
          ) : (
            <div
              className="pointer-events-none fixed rounded-[14px] border-2 border-violet-500/90 shadow-[0_0_0_5px_rgba(124,58,237,0.12),0_0_30px_rgba(124,58,237,0.32)]"
              style={{
                left: resolvedLayout.targetRect.left,
                top: resolvedLayout.targetRect.top,
                width: resolvedLayout.targetRect.width,
                height: resolvedLayout.targetRect.height,
              }}
              aria-hidden="true"
            />
          )}
          {target && !targetIsSidebar ? (
            <div
              className="pointer-events-none fixed max-w-[220px] truncate rounded-full bg-violet-700 px-3 py-1 text-[11px] font-black text-white shadow-[0_10px_26px_rgba(91,33,182,0.28)]"
              style={{
                left: resolvedLayout.labelLeft || resolvedLayout.targetRect.left,
                top: resolvedLayout.labelTop || Math.max(8, resolvedLayout.targetRect.top - 34),
              }}
            >
              {targetActionLabel(target.action)} · {target.label}
            </div>
          ) : null}
        </>
      ) : null}

      {!targetIsSidebar ? (
        <div
          className={cn("coagent-jelly-blob pointer-events-none fixed", targetIsCommand && "coagent-jelly-blob--command")}
          style={{ left: resolvedLayout.x, top: resolvedLayout.y }}
          aria-hidden="true"
        >
          <span className="coagent-jelly-core" />
        </div>
      ) : null}

      {showBubble && bubble ? (
        <div
          className={cn(
            "pointer-events-auto fixed max-h-[236px] overflow-hidden rounded-[14px] bg-white p-3 text-zinc-950 shadow-[0_18px_48px_rgba(24,24,27,0.18)] ring-1 ring-black/10",
            resolvedLayout.mobile && "max-h-[42vh]"
          )}
          style={bubbleStyle}
        >
          <div className="min-w-0">
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {showBubbleTitle ? <p className="truncate text-sm font-black text-zinc-950">{bubbleTitle}</p> : null}
                  <p
                    className={cn(
                      "max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm font-semibold leading-5",
                      showBubbleTitle ? "mt-1 text-zinc-600" : "text-zinc-800"
                    )}
                  >
                    {bubble.message}
                  </p>
                </div>
                <button
                  type="button"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950"
                  onClick={() => commitCoAgentWorkflow(null)}
                  aria-label="코파일럿 말풍선 닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {acceptsInput ? (
                <>
                  {hasChoiceButtons ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeBubbleChoices.map((choice) => {
                        const choiceValue = String(choice.value || choice.label || "").trim();
                        if (!choiceValue) return null;
                        return (
                          <button
                            key={`${choice.engine || choiceValue}-${choice.label || choiceValue}`}
                            type="button"
                            className="coagent-choice-button h-9 rounded-[9px] bg-black px-3 text-sm font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                            disabled={loading}
                            onClick={() => void submitContent(choiceValue)}
                          >
                            {choice.label || choiceValue}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {!hasChoiceButtons ? (
                    <form className="mt-3 flex min-w-0 items-center gap-2 rounded-[10px] bg-zinc-100 px-2 py-1.5" onSubmit={submitBubble}>
                      <input
                        ref={inputRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        disabled={loading}
                        className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm font-bold text-zinc-950 outline-none placeholder:text-zinc-500"
                        placeholder={bubble.placeholder || "답변 입력"}
                      />
                      <button
                        type="submit"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
                        disabled={loading || !input.trim()}
                        aria-label="답변 보내기"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </form>
                  ) : null}
                </>
              ) : bubble.href ? (
                <button
                  type="button"
                  className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-[9px] bg-black px-3 text-sm font-bold text-white transition hover:bg-zinc-800"
                  onClick={() => router.push(bubble.href || "/problem-sets")}
                >
                  확인하기
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
