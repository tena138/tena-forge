import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default async function CheckoutFailPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">
      <section className="w-full max-w-xl rounded-[28px] border border-slate-950/10 bg-white p-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.10)]">
        <AlertCircle className="mx-auto h-12 w-12 text-zinc-600" />
        <h1 className="mt-6 text-3xl font-black">결제가 완료되지 않았습니다.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{params.message || "결제가 취소되었거나 처리 중 문제가 발생했습니다."}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/plan" className="inline-flex h-12 items-center justify-center rounded-[12px] border border-slate-950/10 px-6 text-sm font-black text-slate-950 transition hover:bg-slate-50">
            플랜 다시 선택
          </Link>
          <Link href="/checkout/review" className="inline-flex h-12 items-center justify-center rounded-[12px] bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800">
            결제 다시 시도
          </Link>
        </div>
      </section>
    </main>
  );
}
