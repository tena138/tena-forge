import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ paymentId?: string; type?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">
      <section className="w-full max-w-xl rounded-[28px] border border-slate-950/10 bg-white p-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.10)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-zinc-600" />
        <h1 className="mt-6 text-3xl font-black">결제가 완료되었습니다.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          선택한 월 구독 구성이 적용되었습니다. 대시보드에서 PDF 추출과 문제 DB 구성을 시작할 수 있습니다.
        </p>
        {params.paymentId && <p className="mt-4 rounded-[12px] bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">Payment ID: {params.paymentId}</p>}
        <Link href="/academy" className="mt-7 inline-flex h-12 items-center justify-center rounded-[12px] bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800">
          대시보드로 이동
        </Link>
      </section>
    </main>
  );
}
