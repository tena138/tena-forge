import type { CoAgentChatResponse, CoAgentWorkflow } from "@/lib/coAgent";

export const CO_AGENT_WORKFLOW_STORAGE_KEY = "tena-forge-co-agent-workflow-v1";
export const CO_AGENT_WORKFLOW_EVENT = "tena-forge:co-agent-workflow-change";

export function readStoredCoAgentWorkflow(): CoAgentWorkflow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CO_AGENT_WORKFLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string" || typeof parsed.status !== "string" || typeof parsed.active_step !== "string") return null;
    return parsed as CoAgentWorkflow;
  } catch {
    return null;
  }
}

export function writeStoredCoAgentWorkflow(workflow: CoAgentWorkflow | null) {
  if (typeof window === "undefined") return;
  try {
    if (!workflow) {
      window.sessionStorage.removeItem(CO_AGENT_WORKFLOW_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(CO_AGENT_WORKFLOW_STORAGE_KEY, JSON.stringify(workflow));
  } catch {
    // The workflow is transient UI state; storage failure should not block chat.
  }
}

export function notifyCoAgentWorkflowChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CO_AGENT_WORKFLOW_EVENT));
}

export function areCoAgentWorkflowsEqual(left: CoAgentWorkflow | null, right: CoAgentWorkflow | null) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function shouldKeepCurrentWorkflowPosition(workflow: CoAgentWorkflow | null | undefined) {
  return Boolean(
    workflow &&
      workflow.kind !== "generic" &&
      workflow.active_step &&
      workflow.active_step !== "command" &&
      (workflow.status === "needs_input" || workflow.status === "running")
  );
}

export function buildRunningCoAgentWorkflow(
  message = "코파일럿이 요청을 확인하고 있습니다.",
  currentWorkflow?: CoAgentWorkflow | null
): CoAgentWorkflow {
  if (shouldKeepCurrentWorkflowPosition(currentWorkflow) && currentWorkflow) {
    return {
      ...currentWorkflow,
      status: "running",
      steps: (currentWorkflow.steps || []).map((step) => ({
        ...step,
        status: step.id === currentWorkflow.active_step ? "active" : step.status === "done" ? "done" : "waiting",
      })),
      bubble: {
        title: "작업 중",
        message,
        variant: "status",
      },
    };
  }

  return {
    id: "generic",
    kind: "generic",
    status: "running",
    active_step: "command",
    steps: [],
    bubble: {
      title: "작업 중",
      message,
      variant: "status",
    },
  };
}

export function buildErrorCoAgentWorkflow(message: string): CoAgentWorkflow {
  return {
    id: "generic",
    kind: "generic",
    status: "error",
    active_step: "command",
    steps: [],
    bubble: {
      title: "연결 확인 필요",
      message,
      variant: "error",
    },
  };
}

export function workflowFromChatResponse(response: CoAgentChatResponse): CoAgentWorkflow {
  if (response.workflow) return response.workflow;
  const primaryAction = (response.quick_actions || []).find((action) => typeof action.href === "string");
  return {
    id: "generic",
    kind: "generic",
    status: "created",
    active_step: "command",
    steps: [],
    bubble: {
      title: "코파일럿 답변",
      message: response.answer,
      variant: "status",
      href: typeof primaryAction?.href === "string" ? primaryAction.href : undefined,
    },
  };
}

export function commitCoAgentWorkflow(workflow: CoAgentWorkflow | null) {
  writeStoredCoAgentWorkflow(workflow);
  notifyCoAgentWorkflowChanged();
}
