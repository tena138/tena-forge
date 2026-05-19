import { NextRequest } from "next/server";
import { createBillingProvider } from "@tena-forge/billing";
import type { BillingPlan } from "@tena-forge/billing";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{ workspace_id?: string; plan?: string }>(request);
    if (!body.workspace_id || !body.plan) throw Object.assign(new Error("workspace_id and plan are required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id, ["owner", "admin"]);
    const { data: current } = await service.from("subscriptions").select("provider_subscription_id").eq("workspace_id", body.workspace_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const provider = createBillingProvider(process.env);
    const result = await provider.changePlan(current?.provider_subscription_id || `mock_${body.workspace_id}`, body.plan as BillingPlan);
    await service.from("subscriptions").upsert({ workspace_id: body.workspace_id, provider: process.env.BILLING_PROVIDER || "mock", plan: body.plan, status: "active", updated_at: new Date().toISOString() });
    return json({ subscription: result });
  } catch (error) {
    return handleApiError(error);
  }
}
