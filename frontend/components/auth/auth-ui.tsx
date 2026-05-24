"use client";

import Link from "next/link";
import zxcvbn from "zxcvbn";

import { SiteLogoMark } from "@/components/site-logo";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type OAuthProvider = "kakao" | "naver";
type OAuthMode = "login" | "signup";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-[430px] rounded-[12px] border border-white/10 bg-card/90 p-8 shadow-[0_28px_80px_rgba(0,0,0,0.40)] backdrop-blur">
        <Link href="/" className="mb-7 flex flex-col items-center gap-3">
          <SiteLogoMark />
        </Link>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-normal text-white">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p> : null}
        </div>
        {children}
      </section>
    </main>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-medium text-red-300">{message}</p>;
}

export function SocialButtons({
  compact = false,
  mode = "login",
  accountType,
  redirect,
  disabled = false,
}: {
  compact?: boolean;
  mode?: OAuthMode;
  accountType?: "academy" | "student";
  redirect?: string | null;
  disabled?: boolean;
}) {
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <SocialButton provider="kakao" label="K" compact mode={mode} accountType={accountType} redirect={redirect} disabled={disabled} />
        <SocialButton provider="naver" label="N" compact mode={mode} accountType={accountType} redirect={redirect} disabled={disabled} />
      </div>
    );
  }
  const suffix = mode === "signup" ? "로 가입하기" : "로 로그인";
  return (
    <div className="space-y-2">
      <SocialButton provider="kakao" label={`카카오${suffix}`} mode={mode} accountType={accountType} redirect={redirect} disabled={disabled} />
      <SocialButton provider="naver" label={`네이버${suffix}`} mode={mode} accountType={accountType} redirect={redirect} disabled={disabled} />
    </div>
  );
}

function oauthHref(provider: OAuthProvider, mode: OAuthMode, accountType?: "academy" | "student", redirect?: string | null) {
  const params = new URLSearchParams({ mode });
  if (accountType) params.set("account_type", accountType);
  if (redirect) params.set("redirect", redirect);
  return `${API_URL}/api/auth/${provider}?${params.toString()}`;
}

function SocialButton({
  provider,
  label,
  compact,
  mode,
  accountType,
  redirect,
  disabled,
}: {
  provider: OAuthProvider;
  label: string;
  compact?: boolean;
  mode: OAuthMode;
  accountType?: "academy" | "student";
  redirect?: string | null;
  disabled?: boolean;
}) {
  const styles = {
    kakao: "border-[#FEE500] bg-[#FEE500] text-black hover:bg-[#f5dc00]",
    naver: "border-[#03C75A] bg-[#03C75A] text-white hover:bg-[#02b350]",
  }[provider];
  const mark = provider === "kakao" ? "K" : "N";
  const className = `inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${styles} ${disabled ? "pointer-events-none opacity-45" : ""}`;
  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-xs font-black text-slate-900">{mark}</span>
        {compact ? null : label}
      </button>
    );
  }
  return (
    <a href={oauthHref(provider, mode, accountType, redirect)} className={className}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-xs font-black text-slate-900">{mark}</span>
      {compact ? null : label}
    </a>
  );
}

export function DividerText({ children = "또는" }: { children?: React.ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
      <span className="h-px flex-1 bg-white/10" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const result = zxcvbn(password || "");
  const score = password ? result.score + 1 : 0;
  const labels = ["", "매우 약함", "약함", "보통", "강함", "매우 강함"];
  const colors = ["bg-white/10", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-emerald-500", "bg-emerald-600"];
  const requirements = [
    { label: "8자 이상", ok: password.length >= 8 },
    { label: "대소문자", ok: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "숫자", ok: /\d/.test(password) },
    { label: "특수문자", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((item) => (
          <span key={item} className={`h-1.5 rounded-full ${score >= item ? colors[score] : "bg-white/10"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">{labels[score]}</span>
        {result.feedback.warning && <span className="max-w-[220px] truncate text-slate-400">{result.feedback.warning}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {requirements.map((item) => (
          <span key={item.label} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.ok ? "bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-300/20" : "bg-white/[0.05] text-slate-400 ring-1 ring-white/10"}`}>
            {item.ok ? "✓" : "·"} {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FullWidthButton({ loading, disabled, children }: { loading?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="h-11 w-full" disabled={loading || disabled}>
      {loading ? "처리 중..." : children}
    </Button>
  );
}
