import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: job, error } = await service.from("jobs").select("*").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, job.workspace_id);
    const { data, error: updateError } = await service.from("jobs").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", params.id).select("*").single();
    if (updateError) throw updateError;
    return json({ job: data });
  } catch (error) {
    return handleApiError(error);
  }
}
