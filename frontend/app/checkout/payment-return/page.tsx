import { Suspense } from "react";

import { CheckoutPaymentReturnClient } from "./return-client";

export default function CheckoutPaymentReturnPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">결제 정보를 확인하는 중입니다.</main>}>
      <CheckoutPaymentReturnClient />
    </Suspense>
  );
}
