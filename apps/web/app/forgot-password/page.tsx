import { forgotPasswordAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage({ searchParams }: { searchParams: { message?: string } }) {
  const message = searchParams.message ? decodeURIComponent(searchParams.message) : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="forge-panel w-full max-w-[430px] rounded-[12px] p-8">
        <div className="mb-7 flex flex-col items-center gap-3">
          <span className="forge-brand-mark grid h-12 w-12 place-items-center rounded-[10px] text-sm font-black text-white">T</span>
        </div>
        <div className="mb-7 text-center">
          <p className="text-sm font-bold text-neutral-300">계정 보안</p>
          <h1 className="mt-2 text-2xl font-bold text-white">비밀번호 재설정</h1>
          <p className="mt-2 text-sm text-neutral-400">가입 이메일로 안전한 재설정 링크를 발송합니다.</p>
        </div>
        <form action={forgotPasswordAction} className="space-y-4">
          <label className="block text-sm text-neutral-300">
            가입 이메일
            <input name="email" className="forge-input mt-2 h-11 w-full rounded-[8px] px-3" type="email" required />
          </label>
          {message && <p className="forge-notice rounded-[8px] p-3 text-sm">{message}</p>}
          <button className="h-11 w-full rounded-[8px] border border-white/80 bg-white text-sm font-bold text-black transition hover:bg-neutral-200">재설정 링크 보내기</button>
          <a href="/login" className="block text-center text-sm text-neutral-400 hover:text-white">로그인으로 돌아가기</a>
        </form>
      </section>
    </main>
  );
}
