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
