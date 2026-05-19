import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const workspaceId = request.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) throw Object.assign(new Error("workspace_id is required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, workspaceId);
    const { data, error } = await service.from("outputs").select("*, files(*), templates(name)").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) throw error;
    return json({ outputs: data });
  } catch (error) {
    return handleApiError(error);
  }
}
