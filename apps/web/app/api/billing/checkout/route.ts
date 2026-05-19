import { NextRequest } from "next/server";
import { createBillingProvider } from "@tena-forge/billing";
import { handleApiError, json } from "@/lib/api/response";
import { assertWorkspaceMember, getApiContext, safeJson } from "@/lib/api/context";

export async function POST(request: NextRequest) {
  try {
    const { service, user } = await getApiContext(request);
    const body = await safeJson<{ workspace_id?: string; plan?: "pro" | "team" | "enterprise" }>(request);
    if (!body.workspace_id || !body.plan) throw Object.assign(new Error("workspace_id and plan are required"), { status: 400 });
    await assertWorkspaceMember(service, user.id, body.workspace_id, ["owner", "admin"]);
    const provider = createBillingProvider(process.env);
    const session = await provider.createCheckoutSession({
      workspaceId: body.workspace_id,
      userId: user.id,
      plan: body.plan,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/billing`
    });
    return json({ checkout: session });
  } catch (error) {
    return handleApiError(error);
  }
}
