import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: output, error } = await service.from("outputs").select("*").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, output.workspace_id);
    const { data: job, error: jobError } = await service.from("jobs").insert({
      workspace_id: output.workspace_id,
      user_id: user.id,
      status: "queued",
      job_type: "pdf_generation",
      progress: 0,
      options: { regenerate_output_id: output.id }
    }).select("*").single();
    if (jobError) throw jobError;
    return json({ job }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
