import { CheckoutReviewClient } from "@/components/plan/checkout-review-client";

export default function CheckoutReviewPage({
  searchParams,
}: {
  searchParams: { plan?: string; billing?: string; packages?: string };
}) {
  const plan = searchParams.plan === "basic" || searchParams.plan === "pro" ? searchParams.plan : "basic";
  const billingCycle = searchParams.billing === "monthly" || searchParams.billing === "annual" ? searchParams.billing : "annual";
  return <CheckoutReviewClient plan={plan} billingCycle={billingCycle} packages={searchParams.packages || ""} />;
}
