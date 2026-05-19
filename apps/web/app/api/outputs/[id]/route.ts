import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data, error } = await service.from("outputs").select("*, files(*), templates(*)").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, data.workspace_id);
    return json({ output: data });
  } catch (error) {
    return handleApiError(error);
  }
}
