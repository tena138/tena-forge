import { CheckoutReviewClient } from "@/components/plan/checkout-review-client";

export default function CheckoutReviewPage({
  searchParams,
}: {
  searchParams: { plan?: string; billing?: string; packages?: string; engines?: string };
}) {
  const plan = searchParams.plan === "basic" || searchParams.plan === "pro" ? searchParams.plan : "basic";
  return <CheckoutReviewClient plan={plan} billingCycle="monthly" packages={searchParams.packages || ""} engines={searchParams.engines || ""} />;
}
