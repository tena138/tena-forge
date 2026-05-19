import { NextRequest } from "next/server";
import { createBillingProvider } from "@tena-forge/billing";
import { handleApiError, json } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-webhook-signature") || request.headers.get("toss-signature");
    const provider = createBillingProvider(process.env);
    const verified = await provider.verifyWebhook(payload, signature);
    if (!verified) throw Object.assign(new Error("Invalid webhook signature"), { status: 401 });
    return json({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}
