import { api } from "@/lib/api";

export type CoAgentAction = {
  id: string;
  priority: number;
  category: string;
  title: string;
  summary: string;
  reason: string;
  href: string;
  cta: string;
  signals: string[];
  confidence: "high" | "medium" | string;
};

export type CoAgentProductMapItem = {
  id: string;
  label: string;
  href: string;
  summary: string;
};

export type CoAgentNextActions = {
  owner_id: string;
  current_stage: string;
  stats: Record<string, number>;
  actions: CoAgentAction[];
  product_map: CoAgentProductMapItem[];
  policy: {
    autonomy: string;
    can_execute_without_confirmation: boolean;
    side_effects_require_approval: boolean;
    llm_role: string;
  };
};

export function getCoAgentNextActions() {
  return api<CoAgentNextActions>("/api/co-agent/next-actions");
}

export type CoAgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CoAgentVisibleContext = {
  source: "browser_dom";
  current_path: string;
  page_title: string;
  visible_text: string;
  active_element?: string;
};

export type CoAgentWorkflowStatus = "idle" | "running" | "needs_input" | "created" | "error";
export type CoAgentWorkflowStepId = "command" | "archive" | "template" | "problem_set";

export type CoAgentWorkflowStep = {
  id: CoAgentWorkflowStepId;
  label: string;
  href: string;
  status: "waiting" | "active" | "done" | "error";
};

export type CoAgentWorkflowBubble = {
  title: string;
  message: string;
  field?: string;
  placeholder?: string;
  variant?: "question" | "status" | "success" | "error" | string;
  href?: string;
};

export type CoAgentWorkflow = {
  id: string;
  kind: "exam_paper_creation" | "generic" | string;
  status: CoAgentWorkflowStatus;
  active_step: CoAgentWorkflowStepId;
  steps: CoAgentWorkflowStep[];
  bubble?: CoAgentWorkflowBubble | null;
};

export type CoAgentChatResponse = {
  answer: string;
  scope: "tena_forge_operations" | string;
  model?: string | null;
  drafts?: Array<Record<string, unknown>>;
  quick_actions?: Array<{
    id?: string;
    label?: string;
    kind?: string;
    href?: string;
    [key: string]: unknown;
  }>;
  artifacts?: Array<Record<string, unknown>>;
  workflow?: CoAgentWorkflow | null;
};

export function sendCoAgentChat(payload: {
  message: string;
  messages?: CoAgentChatMessage[];
  current_path?: string | null;
  visible_context?: CoAgentVisibleContext | null;
}) {
  return api<CoAgentChatResponse>("/api/co-agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function collectVisibleCoAgentContext(): CoAgentVisibleContext | null {
  if (typeof window === "undefined") return null;

  const root =
    document.querySelector<HTMLElement>("[data-co-agent-visible-root]") ||
    document.querySelector<HTMLElement>("main") ||
    document.body;
  const visibleText = (root?.innerText || document.body.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  const active = document.activeElement;
  const activeElement =
    active instanceof HTMLElement
      ? [active.tagName.toLowerCase(), active.getAttribute("aria-label"), active.getAttribute("placeholder")]
          .filter(Boolean)
          .join(" ")
          .slice(0, 200)
      : "";

  return {
    source: "browser_dom",
    current_path: `${window.location.pathname}${window.location.search}`,
    page_title: document.title || "",
    visible_text: visibleText,
    active_element: activeElement || undefined,
  };
}
