"use client";

export const CO_AGENT_STATUS_MESSAGE_EVENT = "tena-forge:co-agent-status-message";

export type CoAgentStatusTone = "idle" | "done" | "error" | "working";

export type CoAgentStatusMessage = {
  message: string;
  tone?: CoAgentStatusTone;
  durationMs?: number;
};

export function publishCoAgentStatusMessage(message: string, options: Omit<CoAgentStatusMessage, "message"> = {}) {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent<CoAgentStatusMessage>(CO_AGENT_STATUS_MESSAGE_EVENT, {
      detail: {
        message: message.trim(),
        tone: options.tone || "idle",
        durationMs: options.durationMs,
      },
    })
  );
}
