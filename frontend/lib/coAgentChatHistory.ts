import type { CoAgentChatMessage } from "@/lib/coAgent";

export const CO_AGENT_CHAT_STORAGE_KEY = "tena-forge-co-agent-chat-v1";
export const CO_AGENT_CHAT_STORAGE_EVENT = "tena-forge:co-agent-chat-history-change";
export const MAX_STORED_CHAT_MESSAGES = 40;

export function areCoAgentChatMessagesEqual(left: CoAgentChatMessage[], right: CoAgentChatMessage[]) {
  if (left.length !== right.length) return false;
  return left.every((message, index) => message.role === right[index]?.role && message.content === right[index]?.content);
}

export function readStoredCoAgentChatMessages(): CoAgentChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(CO_AGENT_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (message): message is CoAgentChatMessage =>
          (message?.role === "user" || message?.role === "assistant") &&
          typeof message.content === "string" &&
          Boolean(message.content.trim())
      )
      .map((message) => ({ role: message.role, content: message.content.slice(0, 2000) }))
      .slice(-MAX_STORED_CHAT_MESSAGES);
  } catch {
    return [];
  }
}

export function writeStoredCoAgentChatMessages(messages: CoAgentChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const safeMessages = messages.slice(-MAX_STORED_CHAT_MESSAGES);
    if (!safeMessages.length) {
      window.sessionStorage.removeItem(CO_AGENT_CHAT_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(CO_AGENT_CHAT_STORAGE_KEY, JSON.stringify(safeMessages));
  } catch {
    // Losing transient chat history should not break Co-Agent surfaces.
  }
}

export function notifyCoAgentChatMessagesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CO_AGENT_CHAT_STORAGE_EVENT));
}
