import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { getApiContext, safeJson } from "@/lib/api/context";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const { data, error } = await service
      .from("workspace_members")
      .select("role, workspaces(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return json({ workspaces: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{ name?: string }>(request);
    const name = body.name?.trim() || "Tena Workspace";

    await service.from("users_profile").upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email,
      role: "user"
    }, { onConflict: "id" });

    const { data: workspace, error: workspaceError } = await service.from("workspaces").insert({ name, owner_id: user.id }).select("*").single();
    if (workspaceError) throw workspaceError;

    const { error: memberError } = await service.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });
    if (memberError) throw memberError;

    await service.from("subscriptions").insert({ workspace_id: workspace.id, provider: "mock", plan: "free", status: "active" });
    await service.from("audit_logs").insert({ workspace_id: workspace.id, user_id: user.id, action: "workspace.create", target_type: "workspace", target_id: workspace.id });

    return json({ workspace }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
