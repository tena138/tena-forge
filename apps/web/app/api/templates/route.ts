import { NextRequest } from "next/server";
import { templateSchema } from "@tena-forge/shared";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";
import { sanitizeTemplateCss, sanitizeTemplateHtml } from "@/lib/sanitize-template";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const workspaceId = request.nextUrl.searchParams.get("workspace_id");
    const scope = request.nextUrl.searchParams.get("scope") || "workspace";
    let query = service.from("templates").select("*").order("updated_at", { ascending: false });
    if (scope === "public") {
      query = query.eq("is_public", true);
    } else if (workspaceId) {
      await assertWorkspaceMember(service, user.id, workspaceId);
      query = query.eq("workspace_id", workspaceId);
    } else {
      query = query.eq("created_by", user.id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return json({ templates: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = templateSchema.parse(await safeJson(request));
    if (body.workspace_id) await assertWorkspaceMember(service, user.id, body.workspace_id);
    const { data, error } = await service.from("templates").insert({
      workspace_id: body.workspace_id,
      name: body.name,
      description: body.description,
      category: body.category,
      template_html: body.is_public ? sanitizeTemplateHtml(body.template_html) : body.template_html,
      template_css: body.is_public ? sanitizeTemplateCss(body.template_css) : body.template_css,
      is_public: body.is_public || false,
      is_system: false,
      created_by: user.id
    }).select("*").single();
    if (error) throw error;
    return json({ template: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
