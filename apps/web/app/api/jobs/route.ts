import { NextRequest } from "next/server";
import { createJobSchema } from "@tena-forge/shared";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";
import { assertUsageAvailable } from "@/lib/usage";
import { enqueueDocumentJob } from "@/lib/queue";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const workspaceId = request.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) throw Object.assign(new Error("workspace_id is required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, workspaceId);
    const status = request.nextUrl.searchParams.get("status");
    let query = service.from("jobs").select("*, files(original_name,mime_type)").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return json({ jobs: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = createJobSchema.parse(await safeJson(request));
    await assertWorkspaceMember(service, user.id, body.workspace_id);
    await assertUsageAvailable(service, body.workspace_id);
    const { data: sourceFile, error: fileError } = await service.from("files").select("*").eq("id", body.source_file_id).single();
    if (fileError) throw fileError;
    if (sourceFile.workspace_id !== body.workspace_id) throw Object.assign(new Error("File does not belong to workspace"), { status: 400 });

    const { data: job, error } = await service.from("jobs").insert({
      workspace_id: body.workspace_id,
      user_id: user.id,
      source_file_id: body.source_file_id,
      status: "queued",
      job_type: body.job_type,
      progress: 0,
      options: body.options
    }).select("*").single();
    if (error) throw error;
    const queue = await enqueueDocumentJob({ jobId: job.id, workspaceId: body.workspace_id, sourceFileId: body.source_file_id });
    await service.from("audit_logs").insert({ workspace_id: body.workspace_id, user_id: user.id, action: "job.create", target_type: "job", target_id: job.id, metadata: { queue } });
    return json({ job, queue }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
