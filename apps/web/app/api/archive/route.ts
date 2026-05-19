import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext } from "@/lib/api/context";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const workspaceId = request.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) throw Object.assign(new Error("workspace_id is required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, workspaceId);
    let query = service.from("extracted_items").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    for (const key of ["item_type", "subject", "unit", "difficulty"]) {
      const value = request.nextUrl.searchParams.get(key);
      if (value) query = query.eq(key, value);
    }
    const keyword = request.nextUrl.searchParams.get("keyword");
    if (keyword) query = query.ilike("content_text", `%${keyword}%`);
    const { data, error } = await query;
    if (error) throw error;
    return json({ items: data });
  } catch (error) {
    return handleApiError(error);
  }
}
