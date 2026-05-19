import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";
import { getEnv } from "@/lib/env";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: file, error } = await service.from("files").select("*").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, file.workspace_id);
    const bucket = file.file_kind === "output" ? getEnv().STORAGE_BUCKET_OUTPUT : getEnv().STORAGE_BUCKET_SOURCE;
    const { data: signed } = await service.storage.from(bucket).createSignedUrl(file.storage_path, 60 * 10);
    return json({ file, signed_url: signed?.signedUrl });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: file, error } = await service.from("files").select("*").eq("id", params.id).single();
    if (error) throw error;
    await assertWorkspaceMember(service, user.id, file.workspace_id, ["owner", "admin", "member"]);
    await service.from("files").delete().eq("id", params.id);
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
