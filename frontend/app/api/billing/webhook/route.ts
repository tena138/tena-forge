import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { findSubscriptionOrderByPaymentId, updateSubscriptionOrder } from "@/lib/server/subscription-store";

function verifyWebhookSignature(payload: string, signature: string | null) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const normalized = signature.replace(/^sha256=/i, "");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(normalized);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature =
    request.headers.get("x-portone-signature") ||
    request.headers.get("portone-signature") ||
    request.headers.get("x-webhook-signature");

  if (!verifyWebhookSignature(payload, signature)) {
    return NextResponse.json({ message: "Invalid webhook signature" }, { status: 401 });
  }

  try {
    const event = JSON.parse(payload);
    const paymentId = event?.paymentId || event?.data?.paymentId || event?.payment?.id || event?.payment?.paymentId;
    const status = String(event?.status || event?.data?.status || event?.payment?.status || "").toUpperCase();
    if (!paymentId) return NextResponse.json({ received: true, ignored: "missing paymentId" });

    const order = await findSubscriptionOrderByPaymentId(paymentId);
    if (!order) return NextResponse.json({ received: true, ignored: "unknown paymentId" });
    if (order.status === "paid") return NextResponse.json({ received: true, idempotent: true });

    if (status === "PAID") {
      await updateSubscriptionOrder(paymentId, { status: "paid", paymentSnapshot: event });
    } else if (["FAILED", "CANCELED", "CANCELLED"].includes(status)) {
      await updateSubscriptionOrder(paymentId, { status: status.startsWith("CANCEL") ? "canceled" : "failed", paymentSnapshot: event });
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ message: "Invalid webhook payload" }, { status: 400 });
  }
}
