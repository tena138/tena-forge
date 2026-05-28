"use client";

import Link from "next/link";
import zxcvbn from "zxcvbn";

import { SiteLogoMark } from "@/components/site-logo";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type OAuthProvider = "kakao" | "naver";
type OAuthMode = "login" | "signup";
type AuthCardVariant = "default" | "aurora";

export function AuthCard({ title, subtitle, children, variant = "default" }: { title?: string; subtitle?: string; children?: React.ReactNode; variant?: AuthCardVariant }) {
  const isAurora = variant === "aurora";
  return (
    <main className={isAurora ? "relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-white" : "flex min-h-screen items-center justify-center bg-background px-4 py-10"}>
      {isAurora ? (
        <div className="aurora-bg" aria-hidden="true">
          <div className="aurora-band a" />
          <div className="aurora-band b" />
          <div className="aurora-band c" />
          <div className="aurora-shimmer" />
        </div>
      ) : null}
      <section className={isAurora ? "login-card w-full max-w-[430px] p-8" : "w-full max-w-[430px] rounded-[12px] border border-white/10 bg-card/90 p-8 shadow-[0_28px_80px_rgba(0,0,0,0.40)] backdrop-blur"}>
        <Link href="/" className="mb-8 flex flex-col items-center gap-3">
          <SiteLogoMark className="h-16 w-16 p-2" />
        </Link>
        {title || subtitle ? (
          <div className="mb-6 text-center">
            {title ? <h1 className="text-2xl font-bold tracking-normal text-white">{title}</h1> : null}
            {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p> : null}
          </div>
        ) : null}
        {children}
      </section>
      {isAurora ? (
        <style jsx global>{`
          .aurora-bg {
            position: fixed;
            inset: 0;
            z-index: 0;
            overflow: hidden;
            pointer-events: none;
            background: #080612;
          }

          .aurora-band {
            position: absolute;
            left: -20vw;
            width: 140vw;
            height: 55vh;
            border-radius: 50%;
            filter: blur(70px);
            opacity: 0.55;
            will-change: transform;
          }

          .aurora-band.a {
            top: -25%;
            background: #6b3eff;
            animation:
              aurora-a 12s ease-in-out infinite,
              aurora-hue-a 20s ease-in-out infinite;
          }

          .aurora-band.b {
            top: 25%;
            background: #c046dd;
            animation:
              aurora-b 14s ease-in-out infinite,
              aurora-hue-b 24s ease-in-out infinite;
            animation-delay: -4s, -10s;
          }

          .aurora-band.c {
            top: 55%;
            background: #3e6bff;
            animation:
              aurora-c 16s ease-in-out infinite,
              aurora-hue-c 28s ease-in-out infinite;
            animation-delay: -8s, -14s;
          }

          .aurora-shimmer {
            position: absolute;
            inset: -20%;
            background:
              radial-gradient(circle at 30% 40%, rgba(192, 132, 252, 0.15), transparent 40%),
              radial-gradient(circle at 70% 60%, rgba(99, 102, 241, 0.15), transparent 40%);
            filter: blur(40px);
            mix-blend-mode: screen;
            animation: shimmer 8s ease-in-out infinite;
            will-change: transform;
          }

          @keyframes aurora-a {
            0% {
              transform: translate(0, 0) scale(1) rotate(0deg);
            }

            33% {
              transform: translate(25vw, 12vh) scale(1.15) rotate(8deg);
            }

            66% {
              transform: translate(10vw, -8vh) scale(0.95) rotate(-5deg);
            }

            100% {
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
          }

          @keyframes aurora-b {
            0% {
              transform: translate(0, 0) scale(1) rotate(0deg);
            }

            33% {
              transform: translate(-20vw, 15vh) scale(1.1) rotate(-10deg);
            }

            66% {
              transform: translate(-5vw, 5vh) scale(0.9) rotate(6deg);
            }

            100% {
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
          }

          @keyframes aurora-c {
            0% {
              transform: translate(0, 0) scale(1) rotate(0deg);
            }

            33% {
              transform: translate(15vw, -18vh) scale(1.2) rotate(5deg);
            }

            66% {
              transform: translate(-10vw, -5vh) scale(0.95) rotate(-8deg);
            }

            100% {
              transform: translate(0, 0) scale(1) rotate(0deg);
            }
          }

          @keyframes aurora-hue-a {
            0%,
            100% {
              background: #6b3eff;
            }

            50% {
              background: #7c3aed;
            }
          }

          @keyframes aurora-hue-b {
            0%,
            100% {
              background: #c046dd;
            }

            50% {
              background: #d946ef;
            }
          }

          @keyframes aurora-hue-c {
            0%,
            100% {
              background: #3e6bff;
            }

            50% {
              background: #6366f1;
            }
          }

          @keyframes shimmer {
            0%,
            100% {
              transform: translate(0, 0) scale(1);
            }

            50% {
              transform: translate(-5vw, 5vh) scale(1.1);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .aurora-band,
            .aurora-shimmer {
              animation: none !important;
            }
          }

          .login-card {
            position: relative;
            z-index: 1;
            border: 0.5px solid rgba(255, 255, 255, 0.14);
            border-radius: 14px;
            background: rgba(18, 16, 28, 0.45);
            -webkit-backdrop-filter: blur(22px) saturate(140%);
            backdrop-filter: blur(22px) saturate(140%);
          }

          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .login-card {
              background: rgba(18, 16, 28, 0.92);
            }
          }
        `}</style>
      ) : null}
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
  const suffix = mode === "signup" ? "로 가입하기" : "로 로그인";
  return (
    <div className={compact ? "flex justify-center gap-2" : "flex justify-center gap-4"}>
      <SocialButton provider="kakao" label={`카카오${suffix}`} mode={mode} accountType={accountType} redirect={redirect} disabled={disabled} compact={compact} />
      <SocialButton provider="naver" label={`네이버${suffix}`} mode={mode} accountType={accountType} redirect={redirect} disabled={disabled} compact={compact} />
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
    kakao: "bg-[#FEE500] text-black hover:bg-[#f5dc00]",
    naver: "bg-[#03C75A] text-white hover:bg-[#02b350]",
  }[provider];
  const className = `inline-flex ${compact ? "h-11 w-11" : "h-14 w-14"} items-center justify-center rounded-full shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 ${styles} ${disabled ? "pointer-events-none opacity-45" : ""}`;
  const logo = <SocialProviderLogo provider={provider} />;
  if (disabled) {
    return (
      <button type="button" disabled className={className} aria-label={label}>
        {logo}
      </button>
    );
  }
  return (
    <a href={oauthHref(provider, mode, accountType, redirect)} className={className} aria-label={label}>
      {logo}
    </a>
  );
}

function SocialProviderLogo({ provider }: { provider: OAuthProvider }) {
  if (provider === "kakao") {
    return (
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16 7C9.9 7 5 10.8 5 15.4c0 3 2.1 5.7 5.3 7.1l-.9 3.2c-.1.4.3.7.6.5l4-2.6c.7.1 1.3.2 2 .2 6.1 0 11-3.8 11-8.4S22.1 7 16 7Z"
        />
      </svg>
    );
  }
  return <span className="text-2xl font-black leading-none tracking-normal text-white" aria-hidden="true">N</span>;
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
