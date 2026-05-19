"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function persistSession(accessToken?: string, refreshToken?: string) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  if (accessToken) document.cookie = `sb-access-token=${accessToken}; path=/; max-age=2592000; samesite=lax${secure}`;
  if (refreshToken) document.cookie = `sb-refresh-token=${refreshToken}; path=/; max-age=2592000; samesite=lax${secure}`;
}

const inputClass = "mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-white/[0.06] px-3 text-white outline-none transition focus:border-violet-300/50";
const primaryButtonClass = "h-11 w-full rounded-[8px] bg-violet-500 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-60";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createBrowserClient();
    if (!supabase) {
      setMessage("Supabase 환경 변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    persistSession(data.session?.access_token, data.session?.refresh_token);
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("redirect") || "/dashboard";
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-slate-300">
        이메일
        <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>

      <label className="block text-sm text-slate-300">
        비밀번호
        <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>

      {message && <p className="rounded-[8px] border border-rose-300/20 bg-rose-400/10 p-3 text-sm text-rose-100">{message}</p>}

      <button disabled={loading} className={primaryButtonClass}>
        {loading ? "로그인 중..." : "로그인"}
      </button>

      <div className="flex justify-between text-sm text-slate-400">
        <a href="/forgot-password" className="hover:text-white">비밀번호 찾기</a>
        <a href="/signup" className="hover:text-white">회원가입</a>
      </div>
    </form>
  );
}

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createBrowserClient();
    if (!supabase) {
      setMessage("Supabase 환경 변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }

    const redirectTo = `${location.origin}/dashboard`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo, data: { full_name: name } }
    });

    setLoading(false);
    setMessage(error ? error.message : "가입 확인 이메일을 발송했습니다. 메일함을 확인해주세요.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-slate-300">
        이름
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <label className="block text-sm text-slate-300">
        이메일
        <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>

      <label className="block text-sm text-slate-300">
        비밀번호
        <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
      </label>

      {message && <p className="rounded-[8px] border border-violet-300/20 bg-violet-400/10 p-3 text-sm text-violet-100">{message}</p>}

      <button disabled={loading} className={primaryButtonClass}>
        {loading ? "가입 처리 중..." : "계정 만들기"}
      </button>

      <p className="text-center text-sm text-slate-400">
        이미 계정이 있으신가요? <a href="/login" className="text-violet-200 hover:text-white">로그인</a>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createBrowserClient();
    if (supabase) {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings/security` });
    }
    setMessage("재설정 안내 메일을 발송했습니다. 계정 존재 여부와 관계없이 동일하게 안내됩니다.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm text-slate-300">
        가입 이메일
        <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>

      {message && <p className="rounded-[8px] border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p>}

      <button className={primaryButtonClass}>재설정 링크 보내기</button>

      <a href="/login" className="block text-center text-sm text-slate-400 hover:text-white">로그인으로 돌아가기</a>
    </form>
  );
}
