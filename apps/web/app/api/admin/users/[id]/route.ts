import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertAdmin, getApiContext, safeJson } from "@/lib/api/context";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    await assertAdmin(service, user.id);
    const body = await safeJson(request);
    const { data, error } = await service.from("users_profile").update({ ...body, updated_at: new Date().toISOString() }).eq("id", params.id).select("*").single();
    if (error) throw error;
    return json({ user: data });
  } catch (error) {
    return handleApiError(error);
  }
}
