"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, CreditCard, ShieldCheck } from "lucide-react";

import {
  BillingCycle,
  PACKAGE_GROUPS,
  PACKAGE_LABELS,
  PLANS,
  PackageGroup,
  PaidPlanType,
  calculateAnnualPrice,
  calculateChargeAmount,
  calculateMonthlyPrice,
  formatKRW,
  getResolvedSpecs,
  parseSelectedPackageIds,
  resolveSelectedPackages,
  stringifySelectedPackageIds,
} from "@/lib/plan-pricing";

export function CheckoutReviewClient({ plan, billingCycle, packages }: { plan: PaidPlanType; billingCycle: BillingCycle; packages: string }) {
  const router = useRouter();
  const selectedPackageIds = useMemo(() => parseSelectedPackageIds(packages), [packages]);
  const specs = useMemo(() => getResolvedSpecs(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const selectedPackages = useMemo(() => resolveSelectedPackages(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const monthlyPrice = useMemo(() => calculateMonthlyPrice(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const annual = useMemo(() => calculateAnnualPrice(monthlyPrice), [monthlyPrice]);
  const chargeAmount = useMemo(() => calculateChargeAmount(plan, selectedPackageIds, billingCycle), [plan, selectedPackageIds, billingCycle]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const backHref = `/plan/${plan}`;

  async function pay() {
    setError("");
    setLoading(true);
    try {
      const checkoutResponse = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingCycle, selectedPackageIds }),
      });
      const checkout = await checkoutResponse.json();
      if (!checkoutResponse.ok) throw new Error(checkout.message || "체크아웃을 준비하지 못했습니다.");
      if (!checkout.portone?.storeId || !checkout.portone?.channelKey) {
        throw new Error("PortOne Store ID 또는 Toss 채널 키가 설정되어 있지 않습니다.");
      }

      const PortOne = await import("@portone/browser-sdk/v2");
      const payment = await (PortOne.requestPayment as any)({
        storeId: checkout.portone.storeId,
        channelKey: checkout.portone.channelKey,
        paymentId: checkout.paymentId,
        orderName: checkout.orderName,
        totalAmount: checkout.amount,
        currency: "CURRENCY_KRW",
        payMethod: checkout.portone.payMethod || "CARD",
      });

      if (!payment || "code" in payment) {
        const message = payment && "message" in payment ? payment.message : "결제가 취소되었거나 실패했습니다.";
        router.push(`/checkout/fail?message=${encodeURIComponent(String(message))}`);
        return;
      }

      const verifyResponse = await fetch("/api/billing/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: checkout.paymentId }),
      });
      const verify = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verify.message || "결제 검증에 실패했습니다.");
      router.push(`/checkout/success?paymentId=${encodeURIComponent(checkout.paymentId)}`);
    } catch (error: any) {
      setError(error?.message || "결제 처리 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
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
            <h1 className="mt-3 text-4xl font-black tracking-normal">구성을 확인하세요.</h1>
            <p className="mt-3 text-base leading-7 text-slate-600">결제 전 선택한 플랜, 패키지, 사용 조건을 다시 확인합니다.</p>

            <div className="mt-8 grid gap-4">
              <ReviewBlock title="플랜">
                <div className="flex items-center justify-between">
                  <span>{PLANS[plan].name}</span>
                  <span>{billingCycle === "annual" ? "연간 결제" : "월간 결제"}</span>
                </div>
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
                  <SpecLine>일 AI 한도 {Number(specs.dailyAiLimit).toLocaleString()} credits</SpecLine>
                  <SpecLine>문제 DB {Number(specs.problemDb).toLocaleString()}문항</SpecLine>
                  <SpecLine>저장공간 {Number(specs.fileStorageGb) >= 1024 ? "1TB" : `${specs.fileStorageGb}GB`}</SpecLine>
                  <SpecLine>학생 키 {Number(specs.studentKeys).toLocaleString()}개</SpecLine>
                  <SpecLine>처리 속도 {specs.processingSpeed}</SpecLine>
                  <SpecLine>{specs.cloudProcessing ? "클라우드 처리 포함" : "클라우드 처리 별도"}</SpecLine>
                  <SpecLine>워터마크 없음</SpecLine>
                  <SpecLine>PDF 추출은 AI credits 차감</SpecLine>
                  {plan === "pro" ? <SpecLine>Marketplace included</SpecLine> : <SpecLine>Marketplace unavailable</SpecLine>}
                </div>
              </ReviewBlock>
              <label className="flex gap-3 rounded-[16px] border border-slate-950/10 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-slate-950" />
                <span>
                  <Link href="/terms" className="font-black underline">이용약관</Link> 및 <Link href="/privacy" className="font-black underline">개인정보처리방침</Link>을 확인했으며, 구독 갱신 조건에 동의합니다.
                </span>
              </label>
            </div>
          </section>

          <aside className="h-fit rounded-[28px] border border-slate-950/10 bg-slate-950 p-6 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
            <CreditCard className="h-6 w-6" />
            <h2 className="mt-5 text-2xl font-black">결제 금액</h2>
            <div className="mt-6 space-y-3 border-b border-white/10 pb-5 text-sm">
              <PriceLine label="기본 플랜" value={`${formatKRW(PLANS[plan].baseMonthlyPrice)} / 월`} />
              {Object.values(selectedPackages).map((option) => option && option.monthlyPriceDelta > 0 ? <PriceLine key={option.id} label={option.name} value={`+${formatKRW(option.monthlyPriceDelta)} / 월`} /> : null)}
              {billingCycle === "annual" && <PriceLine label="연간 할인" value={`-${formatKRW(annual.discountAmount)}`} positive />}
            </div>
            <p className="mt-5 text-sm font-bold text-slate-400">{billingCycle === "annual" ? "오늘 결제될 연간 금액" : "오늘 결제될 월간 금액"}</p>
            <p className="mt-2 text-4xl font-black">{formatKRW(chargeAmount)}</p>
            {billingCycle === "annual" && <p className="mt-2 text-sm font-bold text-cyan-100">{formatKRW(annual.discountedMonthly)} / 월 상당</p>}
            <button disabled={!agreed || loading} onClick={pay} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-white text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "결제 준비 중..." : "결제하기"}
            </button>
            {error && <p className="mt-4 rounded-[12px] bg-rose-500/14 px-4 py-3 text-sm font-bold text-rose-100">{error}</p>}
            <p className="mt-5 flex gap-2 text-xs leading-5 text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              서버가 가격과 패키지를 다시 검증한 뒤 PortOne V2 + Toss Payments 채널로 결제를 요청합니다.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-slate-950/10 p-5">
      <h2 className="mb-4 text-sm font-black text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function SpecLine({ children }: { children: React.ReactNode }) {
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
      <span className={positive ? "font-black text-emerald-200" : "font-black"}>{value}</span>
    </div>
  );
}
