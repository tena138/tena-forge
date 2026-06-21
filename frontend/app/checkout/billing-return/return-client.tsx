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
      const billingIssueToken = searchParams.get("billingIssueToken") || searchParams.get("billing_issue_token");
      if (!issueId || !billingKey) {
        router.replace(`/checkout/fail?message=${encodeURIComponent("PortOne did not return billing key details.")}`);
        return;
      }
      if (billingKey === "NEEDS_CONFIRMATION" || billingIssueToken) {
        router.replace(`/checkout/fail?message=${encodeURIComponent("이 PortOne 채널은 빌링키 수동 승인이 필요합니다. 포트원 채널 설정을 자동 발급으로 바꿔주세요.")}`);
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
          billing_issue_token: billingIssueToken || null,
        });
        const successParams = new URLSearchParams({
          type: "monthly",
          trial: "started",
          paymentId: String(response.data.payment_id || ""),
        });
        if (response.data.trial_ends_at) successParams.set("trialEndsAt", String(response.data.trial_ends_at));
        if (response.data.first_payment_at) successParams.set("firstPaymentAt", String(response.data.first_payment_at));
        router.replace(`/checkout/success?${successParams.toString()}`);
      } catch (error: any) {
        setMessage(paymentErrorMessage(error));
      }
    }
    confirm();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfbfa] px-4 text-slate-950">
      <div className="w-full max-w-md rounded-[16px] bg-white p-6 text-center">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">KG Inicis Billing</p>
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
