import type { BillingPlan, BillingProvider, BillingStatus, CheckoutRequest, CheckoutSession } from "./provider";

export class MockBillingProvider implements BillingProvider {
  name = "mock" as const;

  async createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession> {
    const params = new URLSearchParams({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      plan: input.plan,
      mock: "1"
    });
    return {
      provider: "mock",
      checkoutUrl: `${input.successUrl}?${params.toString()}`,
      customerKey: `mock_cus_${input.workspaceId}`,
      subscriptionId: `mock_sub_${input.workspaceId}_${input.plan}`
    };
  }

  async cancelSubscription(): Promise<{ canceled: boolean }> {
    return { canceled: true };
  }

  async changePlan(_subscriptionId: string, plan: BillingPlan): Promise<BillingStatus> {
    return { plan, status: "active", cancelAtPeriodEnd: false };
  }

  async verifyWebhook(): Promise<boolean> {
    return true;
  }
}
