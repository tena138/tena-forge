export type BillingPlan = "free" | "pro" | "team" | "enterprise";
export type BillingProviderName = "mock" | "toss" | "portone";

export type CheckoutRequest = {
  workspaceId: string;
  userId: string;
  plan: BillingPlan;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  provider: BillingProviderName;
  checkoutUrl: string;
  customerKey?: string;
  subscriptionId?: string;
};

export type BillingStatus = {
  plan: BillingPlan;
  status: "active" | "past_due" | "canceled" | "trialing" | "incomplete";
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
};

export interface BillingProvider {
  name: BillingProviderName;
  createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(subscriptionId: string): Promise<{ canceled: boolean }>;
  changePlan(subscriptionId: string, plan: BillingPlan): Promise<BillingStatus>;
  verifyWebhook(payload: string, signature: string | null): Promise<boolean>;
}
