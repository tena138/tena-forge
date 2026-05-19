import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertWorkspaceMember(supabase: SupabaseClient, workspaceId: string, userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Workspace access denied");
  return data as { id: string; role: "owner" | "admin" | "member" | "viewer" };
}

export async function auditLog(supabase: SupabaseClient, input: {
  workspaceId: string;
  userId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    metadata: input.metadata || {}
  });
}
