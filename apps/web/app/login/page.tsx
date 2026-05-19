import { loginAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { redirect?: string; error?: string; message?: string } }) {
  const error = searchParams.error ? decodeURIComponent(searchParams.error) : "";
  const message = searchParams.message ? decodeURIComponent(searchParams.message) : "";
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-[430px] rounded-[12px] border border-white/10 bg-[hsl(var(--card)/0.90)] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.40)] backdrop-blur">
        <div className="mb-7 flex flex-col items-center gap-3">
          <img src="/tenaforge-mark-dark.png" alt="" className="h-12 w-12 object-contain" />
        </div>
        <div className="mb-7 text-center">
          <p className="text-sm font-bold text-violet-200">Tena 통합 로그인</p>
          <h1 className="mt-2 text-2xl font-bold text-white">학습 콘텐츠 제작 콘솔에 접속</h1>
          <p className="mt-2 text-sm text-slate-400">워크스페이스, 구독, 아카이브를 하나의 계정으로 관리합니다.</p>
        </div>
        {!supabaseConfigured && (
          <div className="mb-4 rounded-[8px] border border-amber-300/20 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">
            Supabase가 아직 연결되지 않았습니다. 로컬 개발 모드에서는 아무 이메일과 비밀번호로 콘솔에 들어갈 수 있습니다.
          </div>
        )}
        {message && <p className="mb-4 rounded-[8px] border border-violet-300/20 bg-violet-400/10 p-3 text-sm text-violet-100">{message}</p>}
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="redirect" value={searchParams.redirect || "/dashboard"} />
          <label className="block text-sm text-slate-300">
            이메일
            <input name="email" className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50" type="email" autoComplete="email" required />
          </label>
          <label className="block text-sm text-slate-300">
            비밀번호
            <input name="password" className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="rounded-[8px] border border-rose-300/20 bg-rose-400/10 p-3 text-sm text-rose-100">{error === "missing_env" ? "Supabase 환경 변수가 설정되지 않았습니다." : error}</p>}
          <button className="h-11 w-full rounded-[8px] bg-violet-500 text-sm font-bold text-white transition hover:bg-violet-400">로그인</button>
          <div className="flex justify-between text-sm text-slate-400">
            <a href="/forgot-password" className="hover:text-white">비밀번호 찾기</a>
            <a href="/signup" className="hover:text-white">회원가입</a>
          </div>
        </form>
      </section>
    </main>
  );
}
