import { NextRequest } from "next/server";
import { handleApiError, json } from "@/lib/api/response";
import { assertAdmin, getApiContext } from "@/lib/api/context";

export async function GET(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    await assertAdmin(service, user.id);
    const { data, error } = await service.from("error_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return json({ errors: data });
  } catch (error) {
    return handleApiError(error);
  }
}
