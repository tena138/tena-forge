"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bot, Loader2, MessageSquareText, Send, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CoAgentChatMessage } from "@/lib/coAgent";
import { collectVisibleCoAgentContext, sendCoAgentChat } from "@/lib/coAgent";
import {
  areCoAgentChatMessagesEqual,
  CO_AGENT_CHAT_STORAGE_EVENT,
  CO_AGENT_CHAT_STORAGE_KEY,
  MAX_STORED_CHAT_MESSAGES,
  notifyCoAgentChatMessagesChanged,
  readStoredCoAgentChatMessages,
  writeStoredCoAgentChatMessages,
} from "@/lib/coAgentChatHistory";
import {
  buildErrorCoAgentWorkflow,
  buildRunningCoAgentWorkflow,
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

function chatErrorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (candidate.message === "Network Error") return "AI 서버에 연결하지 못했습니다.";
  return candidate.message || "AI 응답을 만들지 못했습니다.";
}

export function CoAgentChatPanel() {
  const router = useRouter();
  const [messages, setMessages] = useState<CoAgentChatMessage[]>(() => readStoredCoAgentChatMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState<CoAgentChatAction[]>([]);
  const messagesRef = useRef(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitMessages = useCallback((nextMessages: CoAgentChatMessage[]) => {
    const safeMessages = nextMessages.slice(-MAX_STORED_CHAT_MESSAGES);
    messagesRef.current = safeMessages;
    setMessages(safeMessages);
    writeStoredCoAgentChatMessages(safeMessages);
    notifyCoAgentChatMessagesChanged();
  }, []);

  const syncStoredMessages = useCallback(() => {
    const storedMessages = readStoredCoAgentChatMessages();
    if (areCoAgentChatMessagesEqual(messagesRef.current, storedMessages)) return;
    messagesRef.current = storedMessages;
    setMessages(storedMessages);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === CO_AGENT_CHAT_STORAGE_KEY) syncStoredMessages();
    }

    syncStoredMessages();
    window.addEventListener(CO_AGENT_CHAT_STORAGE_EVENT, syncStoredMessages);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", syncStoredMessages);
    return () => {
      window.removeEventListener(CO_AGENT_CHAT_STORAGE_EVENT, syncStoredMessages);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", syncStoredMessages);
    };
  }, [syncStoredMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [loading, messages.length]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading, messages.length]);

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const history = messagesRef.current.slice(-10);
    const withUserMessage = [...messagesRef.current, { role: "user" as const, content }];
    commitMessages(withUserMessage);
    setInput("");
    setError("");
    setActions([]);
    commitCoAgentWorkflow(buildRunningCoAgentWorkflow(undefined, readStoredCoAgentWorkflow()));
    setLoading(true);

    try {
      const visibleContext = collectVisibleCoAgentContext();
      const response = await sendCoAgentChat({
        message: content,
        messages: history,
        current_path: visibleContext?.current_path || (typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`),
        visible_context: visibleContext,
      });
      commitMessages([...messagesRef.current, { role: "assistant", content: response.answer }]);
      setActions((response.quick_actions || []).filter((action) => typeof action.href === "string"));
      commitCoAgentWorkflow(workflowFromChatResponse(response));
    } catch (submitError) {
      const message = chatErrorMessage(submitError);
      setError(message);
      commitMessages([...messagesRef.current, { role: "assistant", content: `지금 AI 연결에 실패했습니다. ${message}` }]);
      setActions([]);
      commitCoAgentWorkflow(buildErrorCoAgentWorkflow(message));
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    commitMessages([]);
    commitCoAgentWorkflow(null);
    setActions([]);
    setError("");
    setInput("");
  }

  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-normal text-zinc-500">
            <MessageSquareText className="h-4 w-4" />
            Co-Agent
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-normal text-zinc-950">코파일럿 채팅</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-500">최근 대화 {messages.length}개</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={clearHistory} disabled={!messages.length && !error}>
          <Trash2 className="h-4 w-4" />
          지우기
        </Button>
      </div>

      <div className="flex h-[min(62vh,680px)] min-h-[360px] flex-col rounded-lg bg-zinc-100/80 p-3 ring-1 ring-zinc-200">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {messages.length ? (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const fromUser = message.role === "user";
                const Icon = fromUser ? UserRound : Bot;
                return (
                  <article key={`${message.role}-${index}-${message.content.slice(0, 24)}`} className={cn("flex", fromUser ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[min(48rem,92%)] rounded-lg px-4 py-3 shadow-sm shadow-zinc-950/5",
                        fromUser ? "bg-black text-white" : "bg-white text-zinc-950 ring-1 ring-zinc-200"
                      )}
                    >
                      <div className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-black", fromUser ? "text-white/70" : "text-zinc-500")}>
                        <Icon className="h-3.5 w-3.5" />
                        {fromUser ? "나" : "코파일럿"}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6">{message.content}</p>
                    </div>
                  </article>
                );
              })}
              {loading ? (
                <article className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-bold text-zinc-600 ring-1 ring-zinc-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    응답 생성 중
                  </div>
                </article>
              ) : null}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-white text-zinc-800 ring-1 ring-zinc-200">
                  <Bot className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-700">아직 기록된 대화가 없습니다.</p>
              </div>
            </div>
          )}
        </div>

        {actions.length ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
            {actions.map((action, index) => (
              <Button key={action.id || `${action.href}-${index}`} type="button" size="sm" onClick={() => router.push(action.href || "/co-agent")}>
                {action.label || "확인"}
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">{error}</p> : null}

        <form className="mt-3 flex min-w-0 items-center gap-2 rounded-lg bg-white px-2 py-2 ring-1 ring-zinc-200" onSubmit={submitChat}>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
            className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-500"
            placeholder="코파일럿에게 요청"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="코파일럿에게 보내기">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </section>
  );
}
