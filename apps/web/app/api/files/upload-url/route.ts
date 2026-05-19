import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { PLAN_LIMITS } from "@tena-forge/shared";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";
import { getEnv } from "@/lib/env";

const accepted = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const env = getEnv();
    const body = await safeJson<{ workspace_id?: string; original_name?: string; mime_type?: string; size_bytes?: number }>(request);
    if (!body.workspace_id || !body.original_name || !body.mime_type || !body.size_bytes) throw Object.assign(new Error("workspace_id, original_name, mime_type, size_bytes are required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id);
    if (!accepted.has(body.mime_type)) throw Object.assign(new Error("Unsupported file type"), { status: 415 });

    const { data: subscription } = await service.from("subscriptions").select("plan").eq("workspace_id", body.workspace_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
    const maxBytes = (PLAN_LIMITS[plan] || PLAN_LIMITS.free).maxFileSizeMb * 1024 * 1024;
    if (body.size_bytes > maxBytes) throw Object.assign(new Error("File exceeds plan limit"), { status: 413 });

    const ext = body.original_name.split(".").pop() || "bin";
    const storagePath = `${body.workspace_id}/source/${randomUUID()}.${ext}`;
    const { data, error } = await service.storage.from(env.STORAGE_BUCKET_SOURCE).createSignedUploadUrl(storagePath);
    if (error) throw error;
    return json({ upload: data, storage_path: storagePath });
  } catch (error) {
    return handleApiError(error);
  }
}
