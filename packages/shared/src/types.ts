export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type SubscriptionPlan = "free" | "pro" | "team" | "enterprise";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing" | "incomplete";
export type JobStatus = "pending" | "queued" | "processing" | "reviewing" | "completed" | "failed" | "canceled";
export type JobType = "problem_extraction" | "template_generation" | "pdf_generation";
export type ExtractedItemType = "problem" | "explanation" | "passage" | "solution" | "other";
export type OutputType = "html" | "pdf" | "pptx";
export type FileKind = "source" | "output" | "template" | "preview";

export type ExtractedItemPayload = {
  item_type: ExtractedItemType;
  source_page: number;
  content_text: string;
  content_html?: string;
  math_latex?: string;
  images?: string[];
  subject?: string | null;
  unit?: string | null;
  difficulty?: string | null;
  tags?: string[];
  metadata?: {
    confidence?: number;
    notes?: string;
    [key: string]: unknown;
  };
};
