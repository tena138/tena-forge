import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  calculateChargeAmount,
  calculateMonthlyPrice,
  formatKRW,
  getResolvedSpecs,
  resolveSelectedPackages,
  validatePlanSelection
} from "@/lib/plan-pricing";
import { saveSubscriptionOrder } from "@/lib/server/subscription-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { plan, billingCycle, selectedPackageIds } = validatePlanSelection(body.plan, body.billingCycle, body.selectedPackageIds);
    const monthlyPrice = calculateMonthlyPrice(plan, selectedPackageIds);
    const amount = calculateChargeAmount(plan, selectedPackageIds, billingCycle);
    const paymentId = `tf-${plan}-${Date.now()}-${randomUUID().slice(0, 12)}`;
    const orderName = `Tena Forge ${plan === "basic" ? "Basic" : "Pro"} ${billingCycle === "annual" ? "연간" : "월간"} 구독`;
    const now = new Date().toISOString();

    await saveSubscriptionOrder({
      id: randomUUID(),
      userId: null,
      planType: plan,
      billingCycle,
      selectedPackages: selectedPackageIds,
      amountKRW: amount,
      currency: "KRW",
      status: "ready",
      portonePaymentId: paymentId,
      orderName,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      paymentId,
      orderName,
      amount,
      currency: "KRW",
      monthlyPrice,
      selectedPackages: resolveSelectedPackages(plan, selectedPackageIds),
      specs: getResolvedSpecs(plan, selectedPackageIds),
      portone: {
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID || process.env.PORTONE_STORE_ID || "",
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_TOSS || process.env.PORTONE_CHANNEL_KEY_TOSS || "",
        payMethod: "CARD",
      },
      summary: `${formatKRW(amount)} 결제 예정`,
    });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "체크아웃을 준비하지 못했습니다." }, { status: 400 });
  }
}
