import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{
      workspace_id?: string;
      original_name?: string;
      storage_path?: string;
      mime_type?: string;
      size_bytes?: number;
      page_count?: number;
      file_kind?: string;
    }>(request);
    if (!body.workspace_id || !body.original_name || !body.storage_path || !body.mime_type || !body.size_bytes) throw Object.assign(new Error("Missing file metadata"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id);
    const { data, error } = await service.from("files").insert({
      workspace_id: body.workspace_id,
      user_id: user.id,
      original_name: body.original_name,
      storage_path: body.storage_path,
      mime_type: body.mime_type,
      size_bytes: body.size_bytes,
      page_count: body.page_count,
      file_kind: body.file_kind || "source"
    }).select("*").single();
    if (error) throw error;
    await service.from("audit_logs").insert({ workspace_id: body.workspace_id, user_id: user.id, action: "file.upload", target_type: "file", target_id: data.id });
    return json({ file: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
