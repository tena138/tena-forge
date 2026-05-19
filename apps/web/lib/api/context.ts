import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api/auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function getApiContext(request: NextRequest) {
  const auth = await requireUser(request);
  const service = createServiceClient();
  return { ...auth, service };
}

export async function assertWorkspaceMember(service: SupabaseClient, userId: string, workspaceId: string, roles?: string[]) {
  let query = service
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (roles?.length) query = query.in("role", roles);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw Object.assign(new Error("Workspace access denied"), { status: 403 });
  return data;
}

export async function assertAdmin(service: SupabaseClient, userId: string) {
  const { data, error } = await service.from("users_profile").select("role").eq("id", userId).maybeSingle();
  if (error || data?.role !== "admin") throw Object.assign(new Error("Admin access required"), { status: 403 });
}

export async function getDefaultWorkspaceId(service: SupabaseClient, userId: string) {
  const { data, error } = await service
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data?.workspace_id) throw Object.assign(new Error("Workspace not found"), { status: 404 });
  return data.workspace_id as string;
}

export async function safeJson<T = Record<string, unknown>>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
