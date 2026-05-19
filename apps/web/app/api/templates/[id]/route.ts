import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";
import { sanitizeTemplateCss, sanitizeTemplateHtml } from "@/lib/sanitize-template";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data, error } = await service.from("templates").select("*").eq("id", params.id).single();
    if (error) throw error;
    if (!data.is_public && data.workspace_id) await assertWorkspaceMember(service, user.id, data.workspace_id);
    return json({ template: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<Record<string, unknown>>(request);
    const { data: existing, error } = await service.from("templates").select("*").eq("id", params.id).single();
    if (error) throw error;
    if (existing.created_by !== user.id && existing.workspace_id) await assertWorkspaceMember(service, user.id, existing.workspace_id, ["owner", "admin"]);
    const update = {
      ...body,
      template_html: typeof body.template_html === "string" && body.is_public ? sanitizeTemplateHtml(body.template_html) : body.template_html,
      template_css: typeof body.template_css === "string" && body.is_public ? sanitizeTemplateCss(body.template_css) : body.template_css,
      updated_at: new Date().toISOString()
    };
    const { data, error: updateError } = await service.from("templates").update(update).eq("id", params.id).select("*").single();
    if (updateError) throw updateError;
    return json({ template: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { service, user } = await getApiContext(request);
    const { data: existing, error } = await service.from("templates").select("*").eq("id", params.id).single();
    if (error) throw error;
    if (existing.created_by !== user.id && existing.workspace_id) await assertWorkspaceMember(service, user.id, existing.workspace_id, ["owner", "admin"]);
    await service.from("templates").delete().eq("id", params.id);
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
