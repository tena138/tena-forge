"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CreditCard, ShieldCheck } from "lucide-react";

import {
  BillingCycle,
  PACKAGE_GROUPS,
  PACKAGE_LABELS,
  PLANS,
  PackageGroup,
  PaidPlanType,
  SubjectEngineCode,
  calculateSubjectEngineMonthlyDelta,
  calculateChargeAmount,
  calculateMonthlyPrice,
  calculateSingleEngineMonthlyPrice,
  formatKRW,
  getResolvedSpecs,
  normalizeSubjectEngines,
  parseSelectedPackageIds,
  resolveSelectedPackages,
  subjectEngineLabel,
} from "@/lib/plan-pricing";
import { authHttp, ensureAccessToken, readStoredAuthProfile } from "@/lib/auth-client";

export function CheckoutReviewClient({ plan, billingCycle, packages, engines }: { plan: PaidPlanType; billingCycle: BillingCycle; packages: string; engines: string }) {
  const router = useRouter();
  const selectedPackageIds = useMemo(() => parseSelectedPackageIds(packages), [packages]);
  const selectedSubjectEngines = useMemo<SubjectEngineCode[]>(() => normalizeSubjectEngines(engines), [engines]);
  const specs = useMemo(() => getResolvedSpecs(plan, selectedPackageIds, selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const selectedPackages = useMemo(() => resolveSelectedPackages(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const singleEngineMonthlyPrice = useMemo(() => calculateSingleEngineMonthlyPrice(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const monthlyPrice = useMemo(() => calculateMonthlyPrice(plan, selectedPackageIds, selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const chargeAmount = useMemo(() => calculateChargeAmount(plan, selectedPackageIds, "monthly", selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const subjectEngineDelta = useMemo(() => calculateSubjectEngineMonthlyDelta(singleEngineMonthlyPrice, selectedSubjectEngines), [singleEngineMonthlyPrice, selectedSubjectEngines]);
  const [agreed, setAgreed] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const backHref = `/plan/${plan}`;
  const phoneReady = isValidPhoneNumber(phoneNumber);

  useEffect(() => {
    const profile = readStoredAuthProfile<{ phone?: string | null }>();
    const storedPhone = normalizePhoneNumber(profile?.phone);
    if (storedPhone) setPhoneNumber(storedPhone);
  }, []);

  async function pay() {
    setError("");
    setLoading(true);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        const current = `${window.location.pathname}${window.location.search}`;
        router.push(`/login?redirect=${encodeURIComponent(current)}`);
        return;
      }

      const customerPhone = normalizePhoneNumber(phoneNumber);
      if (!isValidPhoneNumber(customerPhone)) {
        setError("월 자동결제를 위해 휴대폰 번호를 입력해 주세요.");
        return;
      }

      const checkoutResponse = await authHttp.post("/api/saas/billing/checkout", {
        plan_code: plan,
        billing_cycle: "monthly",
        selected_package_ids: selectedPackageIds,
        enabled_subject_engines: selectedSubjectEngines,
        customer_phone: customerPhone || null,
      });
      const checkout = checkoutResponse.data;
      if (!checkout.portone?.store_id || !checkout.portone?.channel_key) {
        throw new Error("PortOne Store ID or channel key is not configured.");
      }

      const PortOneSdk = await import("@portone/browser-sdk/v2");
      await payMonthlySubscription(PortOneSdk, checkout, customerPhone);
    } catch (error: any) {
      setError(paymentErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function payMonthlySubscription(PortOneSdk: any, checkout: any, customerPhone: string) {
    const billingKeyMethod = String(checkout.portone.billing_key_method || "CARD").toUpperCase();
    const billingCustomerPhone = normalizePhoneNumber(checkout.customer_phone) || customerPhone;
    const issueRequest: Record<string, any> = {
      storeId: checkout.portone.store_id,
      channelKey: checkout.portone.channel_key,
      billingKeyMethod,
      issueId: checkout.issue_id,
      issueName: checkout.issue_name,
      customerId: checkout.customer_id,
      customer: {
        id: checkout.customer_id,
        customerId: checkout.customer_id,
        fullName: checkout.customer_name || undefined,
        email: checkout.customer_email || undefined,
        phoneNumber: billingCustomerPhone,
      },
      displayAmount: checkout.amount,
      currency: "KRW",
      locale: "KO_KR",
      isTestChannel: Boolean(checkout.portone.is_test_channel),
      customData: {
        orderId: checkout.order_id,
        planCode: plan,
        billingCycle: "monthly",
        enabledSubjectEngines: selectedSubjectEngines,
      },
      redirectUrl: `${window.location.origin}/checkout/billing-return?issueId=${encodeURIComponent(checkout.issue_id)}`,
    };
    if (billingKeyMethod === "EASY_PAY") {
      const easyPayProvider = checkout.portone.easy_pay_provider;
      const availablePayMethods = checkout.portone.easy_pay_available_methods;
      issueRequest.easyPay = {
        ...(easyPayProvider ? { easyPayProvider } : {}),
        ...(Array.isArray(availablePayMethods) && availablePayMethods.length ? { availablePayMethods } : {}),
      };
    }
    const issue = await (PortOneSdk.requestIssueBillingKey as any)(issueRequest);

    if (!issue || "code" in issue) {
      const message = issue && "message" in issue ? issue.message : "Billing key issue failed.";
      router.push(`/checkout/fail?message=${encodeURIComponent(String(message))}`);
      return;
    }
    const billingKey = issue.billingKey || issue.billing_key;
    if (!billingKey) throw new Error("PortOne did not return a billingKey.");
    if (billingKey === "NEEDS_CONFIRMATION" || issue.billingIssueToken || issue.billing_issue_token) {
      throw new Error("PortOne channel requires manual billing-key confirmation. Use an automatic billing-key issue channel.");
    }

    const confirmResponse = await authHttp.post("/api/saas/billing/confirm-billing-key", {
      issue_id: checkout.issue_id,
      billing_key: billingKey,
      billing_issue_token: issue.billingIssueToken || issue.billing_issue_token || null,
    });
    const successParams = new URLSearchParams({
      type: "monthly",
      trial: "started",
      paymentId: String(confirmResponse.data.payment_id || checkout.payment_id || ""),
    });
    if (confirmResponse.data.trial_ends_at) successParams.set("trialEndsAt", String(confirmResponse.data.trial_ends_at));
    if (confirmResponse.data.first_payment_at) successParams.set("firstPaymentAt", String(confirmResponse.data.first_payment_at));
    router.push(`/checkout/success?${successParams.toString()}`);
  }

  return (
    <main className="min-h-screen bg-[#f7f5f1] px-4 py-10 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" /> 구성으로 돌아가기
        </Link>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="rounded-[28px] border border-slate-950/10 bg-white p-6 shadow-[0_24px_90px_rgba(15,23,42,0.10)] sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Checkout Review</p>
            <h1 className="mt-3 text-4xl font-black tracking-normal">무료 체험 구성을 확인하세요</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              오늘은 결제수단만 등록하고, 7일 무료 체험 후 첫 월 자동결제가 진행됩니다.
            </p>

            <div className="mt-8 grid gap-4">
              <ReviewBlock title="플랜">
                <div className="flex items-center justify-between">
                  <span>{PLANS[plan].name}</span>
                  <span>7일 체험 후 월 자동결제</span>
                </div>
              </ReviewBlock>
              <ReviewBlock title="선택 엔진">
                <div className="grid gap-3">
                  {selectedSubjectEngines.map((engine) => (
                    <div key={engine} className="flex items-center justify-between rounded-[12px] bg-slate-50 px-4 py-3">
                      <span className="font-bold text-slate-500">{subjectEngineLabel(engine)}</span>
                      <span className="font-black">{engine === "math" ? "수학 추출" : `${subjectEngineLabel(engine)} 추출`}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm font-bold text-slate-600">
                  {selectedSubjectEngines.length > 1 ? "엔진을 2개 선택하면 구성 금액과 사용량 한도가 2배로 적용됩니다." : "선택한 엔진 기준으로 추출 기능이 제공됩니다."}
                </p>
              </ReviewBlock>
              <ReviewBlock title="선택 패키지">
                <div className="grid gap-3">
                  {(Object.keys(PACKAGE_GROUPS[plan]) as PackageGroup[]).map((group) => {
                    const option = selectedPackages[group];
                    if (!option) return null;
                    return (
                      <div key={group} className="flex items-center justify-between rounded-[12px] bg-slate-50 px-4 py-3">
                        <span className="font-bold text-slate-500">{PACKAGE_LABELS[group]}</span>
                        <span className="font-black">{option.name} · {option.monthlyPriceDelta ? `+${formatKRW(option.monthlyPriceDelta)} / 월` : "포함"}</span>
                      </div>
                    );
                  })}
                </div>
              </ReviewBlock>
              <ReviewBlock title="전체 사양">
                <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <SpecLine>월 AI {Number(specs.monthlyAiCredits).toLocaleString()} credits</SpecLine>
                  <SpecLine>문제 DB {Number(specs.problemDb).toLocaleString()}문항</SpecLine>
                  <SpecLine>저장공간 {Number(specs.fileStorageGb) >= 1024 ? "1TB" : `${specs.fileStorageGb}GB`}</SpecLine>
                  <SpecLine>학생 키 {Number(specs.studentKeys).toLocaleString()}개</SpecLine>
                  <SpecLine>PDF 추출은 클라우드에서 처리</SpecLine>
                  <SpecLine>워터마크 없음</SpecLine>
                  <SpecLine>PDF 추출은 AI credits 차감</SpecLine>
                  {plan === "pro" ? <SpecLine>Marketplace included</SpecLine> : <SpecLine>Marketplace unavailable</SpecLine>}
                </div>
              </ReviewBlock>
              <label className="flex gap-3 rounded-[16px] border border-slate-950/10 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-slate-950" />
                <span>
                  <Link href="/terms" className="font-black underline">이용약관</Link>, <Link href="/privacy" className="font-black underline">개인정보처리방침</Link>, <Link href="/refund-policy" className="font-black underline">환불 및 취소 정책</Link>을 확인했으며 결제수단 등록, 7일 무료 체험, 체험 종료 후 자동결제 조건에 동의합니다.
                </span>
              </label>
            </div>
          </section>

          <aside className="h-fit rounded-[28px] border border-slate-950/10 bg-slate-950 p-6 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
            <CreditCard className="h-6 w-6" />
            <h2 className="mt-5 text-2xl font-black">체험 후 결제 금액</h2>
            <div className="mt-4 rounded-[14px] border border-zinc-100/20 bg-white/[0.06] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-100">Primary PG</p>
              <p className="mt-1 text-sm font-black">KG Inicis via PortOne</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">Toss Payments remains available as fallback.</p>
            </div>
            <div className="mt-6 space-y-3 border-b border-white/10 pb-5 text-sm">
              <PriceLine label="기본 플랜" value={`${formatKRW(PLANS[plan].baseMonthlyPrice)} / 월`} />
              {subjectEngineDelta > 0 ? <PriceLine label="엔진 추가" value={`+${formatKRW(subjectEngineDelta)} / 월`} /> : null}
              {Object.values(selectedPackages).map((option) => option && option.monthlyPriceDelta > 0 ? <PriceLine key={option.id} label={option.name} value={`+${formatKRW(option.monthlyPriceDelta)} / 월`} /> : null)}
            </div>
            <p className="mt-5 text-sm font-bold text-slate-400">오늘 결제 금액</p>
            <p className="mt-2 text-4xl font-black">0원</p>
            <p className="mt-4 text-sm font-bold text-slate-400">7일 후 첫 자동결제 금액</p>
            <p className="mt-2 text-4xl font-black">{formatKRW(chargeAmount)}</p>
            <label className="mt-6 block text-sm font-bold text-slate-200">
              휴대폰 번호
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="01012345678"
                className="mt-2 h-11 w-full rounded-[10px] border border-white/10 bg-white/[0.08] px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-zinc-200/70"
              />
            </label>
            <button disabled={!agreed || loading || !phoneReady} onClick={pay} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-white text-sm font-black text-slate-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "등록 준비 중..." : "결제수단 등록 후 7일 체험 시작"}
            </button>
            {error && <p className="mt-4 rounded-[12px] bg-zinc-500/14 px-4 py-3 text-sm font-bold text-zinc-100">{error}</p>}
            <p className="mt-5 flex gap-2 text-xs leading-5 text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              서버가 금액과 패키지를 검증한 뒤 PortOne V2 billing key로 첫 결제를 7일 뒤 예약합니다.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ReviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-slate-950/10 p-5">
      <h2 className="mb-4 text-sm font-black text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function SpecLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-950" />
      <span>{children}</span>
    </div>
  );
}

function PriceLine({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className={positive ? "font-black text-zinc-200" : "font-black"}>{value}</span>
    </div>
  );
}

function normalizePhoneNumber(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function isValidPhoneNumber(value?: string | null) {
  const digits = normalizePhoneNumber(value);
  return digits.length >= 10 && digits.length <= 11;
}

function paymentErrorMessage(error: any) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return error?.message || "결제 처리 중 문제가 발생했습니다.";
}
