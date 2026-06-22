"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bot, Loader2, Send, X } from "lucide-react";

import type { CoAgentChatMessage, CoAgentWorkflow } from "@/lib/coAgent";
import { sendCoAgentChat } from "@/lib/coAgent";
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
};

function visibleAnchorFor(step: string) {
  const anchors = Array.from(document.querySelectorAll<HTMLElement>(`[data-coagent-anchor="${step}"]`));
  return (
    anchors.find((element) => {
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
    }) || null
  );
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
  const inputRef = useRef<HTMLInputElement>(null);

  const activeStep = workflow?.active_step || "command";
  const bubble = workflow?.bubble || null;
  const showBubble = Boolean(bubble && workflow?.status && workflow.status !== "idle");
  const acceptsInput = workflow?.status === "needs_input" && bubble?.variant === "question";

  const syncWorkflow = useCallback(() => {
    const storedWorkflow = readStoredCoAgentWorkflow();
    setWorkflow((current) => (areCoAgentWorkflowsEqual(current, storedWorkflow) ? current : storedWorkflow));
  }, []);

  const updateLayout = useCallback(() => {
    const anchor = visibleAnchorFor(activeStep) || visibleAnchorFor("command");
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const mobile = window.innerWidth < 1024;
    const x = activeStep === "command" ? rect.left + Math.min(Math.max(rect.width * 0.18, 26), 54) : rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const bubbleWidth = mobile ? Math.max(280, window.innerWidth - 32) : 360;
    const preferredLeft = rect.right + 14;
    const fallbackLeft = rect.left - bubbleWidth - 14;
    const bubbleLeft = preferredLeft + bubbleWidth + 16 <= window.innerWidth ? preferredLeft : Math.max(16, fallbackLeft);
    const bubbleTop = Math.min(Math.max(12, rect.top - 4), Math.max(12, window.innerHeight - 260));
    setLayout({ x, y, bubbleLeft, bubbleTop, bubbleWidth, mobile });
  }, [activeStep]);

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
    if (acceptsInput && showBubble && !loading) inputRef.current?.focus();
  }, [acceptsInput, loading, showBubble, workflow?.id, workflow?.active_step]);

  async function submitBubble(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const history = readStoredCoAgentChatMessages().slice(-10);
    const nextMessages = [...readStoredCoAgentChatMessages(), { role: "user" as const, content }];
    commitChatMessages(nextMessages);
    setInput("");
    setLoading(true);
    commitCoAgentWorkflow(buildRunningCoAgentWorkflow("답변을 반영해 작업을 이어가고 있습니다.", workflow));

    try {
      const response = await sendCoAgentChat({
        message: content,
        messages: history,
        current_path: typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`,
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

  return (
    <div className="pointer-events-none fixed inset-0 z-[2100]" aria-live="polite">
      <div
        className="coagent-jelly-blob pointer-events-none fixed"
        style={{ left: resolvedLayout.x, top: resolvedLayout.y }}
        aria-hidden="true"
      >
        <span className="coagent-jelly-core">
          <Bot className="h-4 w-4 text-white" />
        </span>
      </div>

      {showBubble && bubble ? (
        <div
          className={cn(
            "pointer-events-auto fixed max-h-[236px] overflow-hidden rounded-[14px] bg-white p-3 text-zinc-950 shadow-[0_18px_48px_rgba(24,24,27,0.18)] ring-1 ring-black/10",
            resolvedLayout.mobile && "max-h-[42vh]"
          )}
          style={bubbleStyle}
        >
          <div className="flex items-start gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#6d28d9] text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
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
