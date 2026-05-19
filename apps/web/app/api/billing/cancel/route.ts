import { NextRequest } from "next/server";
import { createBillingProvider } from "@tena-forge/billing";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{ workspace_id?: string }>(request);
    if (!body.workspace_id) throw Object.assign(new Error("workspace_id is required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id, ["owner", "admin"]);
    const { data: subscription } = await service.from("subscriptions").select("*").eq("workspace_id", body.workspace_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const provider = createBillingProvider(process.env);
    const result = await provider.cancelSubscription(subscription?.provider_subscription_id || `mock_${body.workspace_id}`);
    await service.from("subscriptions").update({ status: "canceled", cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("id", subscription?.id);
    return json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
