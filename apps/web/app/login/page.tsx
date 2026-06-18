import { loginAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { redirect?: string; error?: string; message?: string } }) {
  const error = searchParams.error ? decodeURIComponent(searchParams.error) : "";
  const message = searchParams.message ? decodeURIComponent(searchParams.message) : "";
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="forge-panel w-full max-w-[430px] rounded-[12px] p-8">
        <div className="mb-7 flex flex-col items-center gap-3">
          <span className="forge-brand-mark grid h-12 w-12 place-items-center rounded-[10px] text-sm font-black text-white">T</span>
        </div>
        <div className="mb-7 text-center">
          <p className="text-sm font-bold text-neutral-300">Tena 통합 로그인</p>
          <h1 className="mt-2 text-2xl font-bold text-white">학습 콘텐츠 제작 콘솔에 접속</h1>
          <p className="mt-2 text-sm text-neutral-400">워크스페이스, 구독, 아카이브를 하나의 계정으로 관리합니다.</p>
        </div>
        {!supabaseConfigured && (
          <div className="forge-notice mb-4 rounded-[8px] p-3 text-sm leading-6">
            Supabase가 아직 연결되지 않았습니다. 로컬 개발 모드에서는 아무 이메일과 비밀번호로 콘솔에 들어갈 수 있습니다.
          </div>
        )}
        {message && <p className="forge-notice mb-4 rounded-[8px] p-3 text-sm">{message}</p>}
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="redirect" value={searchParams.redirect || "/dashboard"} />
          <label className="block text-sm text-neutral-300">
            이메일
            <input name="email" className="forge-input mt-2 h-11 w-full rounded-[8px] px-3" type="email" autoComplete="email" required />
          </label>
          <label className="block text-sm text-neutral-300">
            비밀번호
            <input name="password" className="forge-input mt-2 h-11 w-full rounded-[8px] px-3" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="forge-notice rounded-[8px] p-3 text-sm">{error === "missing_env" ? "Supabase 환경 변수가 설정되지 않았습니다." : error}</p>}
          <button className="h-11 w-full rounded-[8px] border border-white/80 bg-white text-sm font-bold text-black transition hover:bg-neutral-200">로그인</button>
          <div className="flex justify-between text-sm text-neutral-400">
            <a href="/forgot-password" className="hover:text-white">비밀번호 찾기</a>
            <a href="/signup" className="hover:text-white">회원가입</a>
          </div>
        </form>
      </section>
    </main>
  );
}
