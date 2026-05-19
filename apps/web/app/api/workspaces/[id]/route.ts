import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    await assertWorkspaceMember(service, user.id, params.id);
    const { data, error } = await service.from("workspaces").select("*").eq("id", params.id).single();
    if (error) throw error;
    return json({ workspace: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    await assertWorkspaceMember(service, user.id, params.id, ["owner", "admin"]);
    const body = await safeJson<{ name?: string }>(request);
    const { data, error } = await service.from("workspaces").update({ name: body.name, updated_at: new Date().toISOString() }).eq("id", params.id).select("*").single();
    if (error) throw error;
    return json({ workspace: data });
  } catch (error) {
    return handleApiError(error);
  }
}
