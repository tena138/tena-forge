import crypto from "node:crypto";
import type { BillingPlan, BillingProvider, BillingStatus, CheckoutRequest, CheckoutSession } from "./provider";

export class TossBillingProvider implements BillingProvider {
  name = "toss" as const;

  constructor(private readonly secretKey: string, private readonly webhookSecret: string) {}

  async createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession> {
    const params = new URLSearchParams({
      customerKey: input.workspaceId,
      plan: input.plan,
      successUrl: input.successUrl,
      failUrl: input.cancelUrl
    });
    return {
      provider: "toss",
      checkoutUrl: `https://pay.toss.im/checkout?${params.toString()}`,
      customerKey: input.workspaceId
    };
  }

  async cancelSubscription(): Promise<{ canceled: boolean }> {
    return { canceled: true };
  }

  async changePlan(_subscriptionId: string, plan: BillingPlan): Promise<BillingStatus> {
    return { plan, status: "active", cancelAtPeriodEnd: false };
  }

  async verifyWebhook(payload: string, signature: string | null): Promise<boolean> {
    if (!signature || !this.webhookSecret) return false;
    const digest = crypto.createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  }
}
