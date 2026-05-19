import { signupAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function SignupPage({ searchParams }: { searchParams: { message?: string } }) {
  const message = searchParams.message ? decodeURIComponent(searchParams.message) : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-[430px] rounded-[12px] border border-white/10 bg-[hsl(var(--card)/0.90)] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.40)] backdrop-blur">
        <div className="mb-7 flex flex-col items-center gap-3">
          <img src="/tenaforge-mark-dark.png" alt="" className="h-12 w-12 object-contain" />
        </div>
        <div className="mb-7 text-center">
          <p className="text-sm font-bold text-violet-200">Tena 통합 회원가입</p>
          <h1 className="mt-2 text-2xl font-bold text-white">새 워크스페이스 준비</h1>
          <p className="mt-2 text-sm text-slate-400">가입 후 Supabase Auth 확인 메일을 통해 계정을 활성화합니다.</p>
        </div>
        <form action={signupAction} className="space-y-4">
          <label className="block text-sm text-slate-300">
            이름
            <input name="name" className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50" required />
          </label>
          <label className="block text-sm text-slate-300">
            이메일
            <input name="email" className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50" type="email" required />
          </label>
          <label className="block text-sm text-slate-300">
            비밀번호
            <input name="password" className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50" type="password" minLength={8} required />
          </label>
          {message && <p className="rounded-[8px] border border-violet-300/20 bg-violet-400/10 p-3 text-sm text-violet-100">{message === "missing_env" ? "Supabase 환경 변수가 설정되지 않았습니다." : message}</p>}
          <button className="h-11 w-full rounded-[8px] bg-violet-500 text-sm font-bold text-white transition hover:bg-violet-400">계정 만들기</button>
          <p className="text-center text-sm text-slate-400">이미 계정이 있으신가요? <a href="/login" className="text-violet-200 hover:text-white">로그인</a></p>
        </form>
      </section>
    </main>
  );
}
