import { NextRequest, NextResponse } from "next/server";

import { findSubscriptionOrderByPaymentId, updateSubscriptionOrder } from "@/lib/server/subscription-store";

type PortOnePayment = {
  id?: string;
  paymentId?: string;
  status?: string;
  amount?: {
    total?: number;
    paid?: number;
  };
  totalAmount?: number;
  currency?: string;
};

async function fetchPortOnePayment(paymentId: string) {
  const apiSecret = process.env.PORTONE_API_SECRET;
  if (!apiSecret) {
    throw new Error("PORTONE_API_SECRET이 설정되어 있지 않습니다.");
  }
  const response = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${apiSecret}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`PortOne 결제 조회 실패 (${response.status})`);
  }
  return response.json() as Promise<PortOnePayment>;
}

function readPaidAmount(payment: PortOnePayment) {
  return payment.amount?.paid ?? payment.amount?.total ?? payment.totalAmount ?? 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const paymentId = String(body.paymentId || "");
    if (!paymentId) return NextResponse.json({ message: "paymentId가 필요합니다." }, { status: 400 });

    const order = await findSubscriptionOrderByPaymentId(paymentId);
    if (!order) return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });

    const payment = await fetchPortOnePayment(paymentId);
    const paidAmount = readPaidAmount(payment);
    const status = String(payment.status || "").toUpperCase();
    const currency = payment.currency || "KRW";

    if (currency !== "KRW" && currency !== "CURRENCY_KRW") {
      await updateSubscriptionOrder(paymentId, { status: "failed", paymentSnapshot: payment });
      return NextResponse.json({ message: "결제 통화가 일치하지 않습니다." }, { status: 400 });
    }
    if (paidAmount !== order.amountKRW) {
      await updateSubscriptionOrder(paymentId, { status: "failed", paymentSnapshot: payment });
      return NextResponse.json({ message: "결제 금액이 주문 금액과 일치하지 않습니다." }, { status: 400 });
    }
    if (!["PAID", "VIRTUAL_ACCOUNT_ISSUED"].includes(status)) {
      await updateSubscriptionOrder(paymentId, { status: "failed", paymentSnapshot: payment });
      return NextResponse.json({ message: "결제가 완료되지 않았습니다.", status }, { status: 400 });
    }

    const updated = await updateSubscriptionOrder(paymentId, { status: "paid", paymentSnapshot: payment });
    const authorization = request.headers.get("authorization");
    if (authorization && updated) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const activation = await fetch(`${apiUrl}/api/saas/billing/activate`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          plan_code: updated.planType,
          billing_cycle: updated.billingCycle,
          payment_id: paymentId,
        }),
      });
      if (!activation.ok) {
        const detail = await activation.json().catch(() => ({}));
        return NextResponse.json({ message: detail?.detail || "결제는 확인됐지만 구독 활성화에 실패했습니다." }, { status: 502 });
      }
    }
    return NextResponse.json({ verified: true, order: updated });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || "결제 검증에 실패했습니다." }, { status: 500 });
  }
}
