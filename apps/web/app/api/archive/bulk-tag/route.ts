import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{ workspace_id?: string; item_ids?: string[]; tags?: string[] }>(request);
    if (!body.workspace_id || !body.item_ids?.length) throw Object.assign(new Error("workspace_id and item_ids are required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id);
    const { data, error } = await service.from("extracted_items").update({ tags: body.tags || [], updated_at: new Date().toISOString() }).eq("workspace_id", body.workspace_id).in("id", body.item_ids).select("*");
    if (error) throw error;
    return json({ items: data });
  } catch (error) {
    return handleApiError(error);
  }
}
