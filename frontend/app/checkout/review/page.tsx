import { CheckoutReviewClient } from "@/components/plan/checkout-review-client";

export default async function CheckoutReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string; packages?: string; engines?: string }>;
}) {
  const params = await searchParams;
  const plan = params.plan === "basic" || params.plan === "pro" ? params.plan : "basic";
  return <CheckoutReviewClient plan={plan} billingCycle="monthly" packages={params.packages || ""} engines={params.engines || ""} />;
}
