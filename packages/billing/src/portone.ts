import type { BillingPlan, BillingProvider, BillingStatus, CheckoutRequest, CheckoutSession } from "./provider";

export class PortOneBillingProvider implements BillingProvider {
  name = "portone" as const;

  constructor(private readonly apiSecret: string) {}

  async createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession> {
    return {
      provider: "portone",
      checkoutUrl: `${input.successUrl}?provider=portone&plan=${input.plan}&workspace_id=${input.workspaceId}`
    };
  }

  async cancelSubscription(): Promise<{ canceled: boolean }> {
    return { canceled: true };
  }

  async changePlan(_subscriptionId: string, plan: BillingPlan): Promise<BillingStatus> {
    return { plan, status: "active", cancelAtPeriodEnd: false };
  }

  async verifyWebhook(): Promise<boolean> {
    return Boolean(this.apiSecret);
  }
}
