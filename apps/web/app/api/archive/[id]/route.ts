import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data, error } = await service.from("extracted_items").select("*").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, data.workspace_id);
    return json({ item: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson(request);
    const { data: item, error } = await service.from("extracted_items").select("*").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, item.workspace_id);
    const { data, error: updateError } = await service.from("extracted_items").update({ ...body, updated_at: new Date().toISOString() }).eq("id", params.id).select("*").single();
    if (updateError) throw updateError;
    return json({ item: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: item, error } = await service.from("extracted_items").select("workspace_id").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, item.workspace_id);
    await service.from("extracted_items").delete().eq("id", params.id);
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
