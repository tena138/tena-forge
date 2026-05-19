export * from "./provider";
export * from "./mock";
export * from "./toss";
export * from "./portone";

import { MockBillingProvider } from "./mock";
import { PortOneBillingProvider } from "./portone";
import type { BillingProvider, BillingProviderName } from "./provider";
import { TossBillingProvider } from "./toss";

export function createBillingProvider(env: Record<string, string | undefined>): BillingProvider {
  const provider = (env.BILLING_PROVIDER || "mock") as BillingProviderName;
  if (provider === "toss") return new TossBillingProvider(env.TOSS_SECRET_KEY || "", env.TOSS_WEBHOOK_SECRET || "");
  if (provider === "portone") return new PortOneBillingProvider(env.PORTONE_API_SECRET || "");
  return new MockBillingProvider();
}
