"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { authHttp, ensureAccessToken } from "@/lib/auth-client";

export function CheckoutBillingReturnClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제 정보를 확인하는 중입니다.");

  useEffect(() => {
    async function confirm() {
      const code = searchParams.get("code");
      const failureMessage = searchParams.get("message");
      if (code) {
        router.replace(`/checkout/fail?message=${encodeURIComponent(failureMessage || "Billing key issue failed.")}`);
        return;
      }

      const issueId = searchParams.get("issueId") || searchParams.get("issue_id");
      const billingKey = searchParams.get("billingKey") || searchParams.get("billing_key");
      if (!issueId || !billingKey) {
        router.replace(`/checkout/fail?message=${encodeURIComponent("PortOne did not return billing key details.")}`);
        return;
      }

      try {
        const token = await ensureAccessToken();
        if (!token) {
          router.replace(`/login?redirect=${encodeURIComponent(`/checkout/billing-return?${searchParams.toString()}`)}`);
          return;
        }
        const response = await authHttp.post("/api/saas/billing/confirm-billing-key", {
          issue_id: issueId,
          billing_key: billingKey,
        });
        router.replace(`/checkout/success?paymentId=${encodeURIComponent(response.data.payment_id || "")}`);
      } catch (error: any) {
        setMessage(error?.response?.data?.detail || error?.message || "결제 승인에 실패했습니다.");
      }
    }
    confirm();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">
      <div className="w-full max-w-md rounded-[16px] border border-slate-950/10 bg-white p-6 text-center shadow-[0_20px_70px_rgba(15,23,42,0.10)]">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">PortOne Billing</p>
        <h1 className="mt-3 text-2xl font-black">결제 확인</h1>
        <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>
      </div>
    </main>
  );
}
