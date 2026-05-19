import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: job, error } = await service.from("jobs").select("*, files(*), extracted_items(*), outputs(*)").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, job.workspace_id);
    return json({ job });
  } catch (error) {
    return handleApiError(error);
  }
}
