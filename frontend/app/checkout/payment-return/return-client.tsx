"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { authHttp, ensureAccessToken } from "@/lib/auth-client";

export function CheckoutPaymentReturnClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제 정보를 확인하는 중입니다.");

  useEffect(() => {
    async function confirm() {
      const code = searchParams.get("code");
      const failureMessage = searchParams.get("message");
      if (code) {
        router.replace(`/checkout/fail?message=${encodeURIComponent(failureMessage || "Payment failed.")}`);
        return;
      }

      const paymentId = searchParams.get("paymentId") || searchParams.get("payment_id");
      if (!paymentId) {
        router.replace(`/checkout/fail?message=${encodeURIComponent("PortOne did not return payment details.")}`);
        return;
      }

      try {
        const token = await ensureAccessToken();
        if (!token) {
          router.replace(`/login?redirect=${encodeURIComponent(`/checkout/payment-return?${searchParams.toString()}`)}`);
          return;
        }
        const response = await authHttp.post("/api/saas/billing/confirm-payment", {
          payment_id: paymentId,
        });
        router.replace(`/checkout/success?paymentId=${encodeURIComponent(response.data.payment_id || paymentId)}&type=annual`);
      } catch (error: any) {
        setMessage(paymentErrorMessage(error));
      }
    }
    confirm();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">
      <div className="w-full max-w-md rounded-[16px] border border-slate-950/10 bg-white p-6 text-center shadow-[0_20px_70px_rgba(15,23,42,0.10)]">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">PortOne Payment</p>
        <h1 className="mt-3 text-2xl font-black">결제 확인</h1>
        <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>
      </div>
    </main>
  );
}

function paymentErrorMessage(error: any) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return error?.message || "결제 확인에 실패했습니다.";
}
