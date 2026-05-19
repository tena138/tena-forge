import { NextRequest } from "next/server";
import { PLAN_LIMITS } from "@tena-forge/shared";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const workspaceId = request.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) throw Object.assign(new Error("workspace_id is required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, workspaceId);
    const { data: subscription, error } = await service.from("subscriptions").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
    return json({ subscription, limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free });
  } catch (error) {
    return handleApiError(error);
  }
}
