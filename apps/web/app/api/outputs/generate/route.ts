import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";
import { assertUsageAvailable } from "@/lib/usage";
import { enqueueDocumentJob } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{ workspace_id?: string; template_id?: string; item_ids?: string[]; output_type?: string; options?: Record<string, unknown> }>(request);
    if (!body.workspace_id || !body.template_id || !body.item_ids?.length) throw Object.assign(new Error("workspace_id, template_id, item_ids are required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id);
    await assertUsageAvailable(service, body.workspace_id);
    const { data: job, error } = await service.from("jobs").insert({
      workspace_id: body.workspace_id,
      user_id: user.id,
      status: "queued",
      job_type: "pdf_generation",
      progress: 0,
      options: body
    }).select("*").single();
    if (error) throw error;
    const queue = await enqueueDocumentJob({ jobId: job.id, workspaceId: body.workspace_id, sourceFileId: body.item_ids[0] });
    return json({ job, queue }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
