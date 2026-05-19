import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    await assertWorkspaceMember(service, user.id, params.id);
    const { data, error } = await service.from("workspace_members").select("*, users_profile(email, full_name, avatar_url)").eq("workspace_id", params.id);
    if (error) throw error;
    return json({ members: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    await assertWorkspaceMember(service, user.id, params.id, ["owner", "admin"]);
    const body = await safeJson<{ user_id?: string; role?: string }>(request);
    if (!body.user_id) throw Object.assign(new Error("user_id is required"), { status: 400 });
    const { data, error } = await service.from("workspace_members").insert({ workspace_id: params.id, user_id: body.user_id, role: body.role || "member" }).select("*").single();
    if (error) throw error;
    return json({ member: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
