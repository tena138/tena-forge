"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CheckoutPaymentReturnClient() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => router.replace("/plan"), 1800);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">
      <div className="w-full max-w-md rounded-[16px] border border-slate-950/10 bg-white p-6 text-center shadow-[0_20px_70px_rgba(15,23,42,0.10)]">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Checkout</p>
        <h1 className="mt-3 text-2xl font-black">월 자동결제만 제공됩니다.</h1>
        <p className="mt-3 text-sm font-bold text-slate-600">현재 월 자동결제만 제공됩니다. 플랜 화면으로 이동합니다.</p>
      </div>
    </main>
  );
}
