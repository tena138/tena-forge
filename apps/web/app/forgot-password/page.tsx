import { forgotPasswordAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage({ searchParams }: { searchParams: { message?: string } }) {
  const message = searchParams.message ? decodeURIComponent(searchParams.message) : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-[430px] rounded-[12px] border border-white/10 bg-[hsl(var(--card)/0.90)] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.40)] backdrop-blur">
        <div className="mb-7 flex flex-col items-center gap-3">
          <img src="/tenaforge-mark-dark.png" alt="" className="h-12 w-12 object-contain" />
        </div>
        <div className="mb-7 text-center">
          <p className="text-sm font-bold text-violet-200">계정 보안</p>
          <h1 className="mt-2 text-2xl font-bold text-white">비밀번호 재설정</h1>
          <p className="mt-2 text-sm text-slate-400">가입 이메일로 안전한 재설정 링크를 발송합니다.</p>
        </div>
        <form action={forgotPasswordAction} className="space-y-4">
          <label className="block text-sm text-slate-300">
            가입 이메일
            <input name="email" className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50" type="email" required />
          </label>
          {message && <p className="rounded-[8px] border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p>}
          <button className="h-11 w-full rounded-[8px] bg-violet-500 text-sm font-bold text-white transition hover:bg-violet-400">재설정 링크 보내기</button>
          <a href="/login" className="block text-center text-sm text-slate-400 hover:text-white">로그인으로 돌아가기</a>
        </form>
      </section>
    </main>
  );
}
