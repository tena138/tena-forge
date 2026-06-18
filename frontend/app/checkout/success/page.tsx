import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ paymentId?: string; type?: string; trial?: string; trialEndsAt?: string; firstPaymentAt?: string }> }) {
  const params = await searchParams;
  const isTrialStarted = params.type === "monthly" && params.trial === "started";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f1] px-4 text-slate-950">
      <section className="w-full max-w-xl rounded-[28px] border border-slate-950/10 bg-white p-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.10)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-zinc-600" />
        <h1 className="mt-6 text-3xl font-black">{isTrialStarted ? "7일 무료 체험이 시작되었습니다." : "결제가 완료되었습니다."}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isTrialStarted
            ? "선택한 플랜 권한이 열렸습니다. 첫 자동결제는 무료 체험 종료 후 등록된 결제수단으로 진행됩니다."
            : "선택한 구독 구성이 적용되었습니다. 대시보드에서 PDF 추출과 문제 DB 구성을 시작할 수 있습니다."}
        </p>
        {isTrialStarted && params.firstPaymentAt && (
          <p className="mt-4 rounded-[12px] bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
            첫 자동결제 예정일: {formatDate(params.firstPaymentAt)}
          </p>
        )}
        {params.paymentId && <p className="mt-4 rounded-[12px] bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">Payment ID: {params.paymentId}</p>}
        <Link href="/academy" className="mt-7 inline-flex h-12 items-center justify-center rounded-[12px] bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800">
          대시보드로 이동
        </Link>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}
