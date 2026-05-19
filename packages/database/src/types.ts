export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TableName =
  | "users_profile"
  | "workspaces"
  | "workspace_members"
  | "subscriptions"
  | "usage_limits"
  | "usage_logs"
  | "files"
  | "jobs"
  | "extracted_items"
  | "templates"
  | "outputs"
  | "audit_logs"
  | "error_logs";

export type WorkspaceScopedRow = {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at?: string;
};
