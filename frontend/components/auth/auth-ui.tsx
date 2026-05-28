"use client";

import Link from "next/link";
import zxcvbn from "zxcvbn";

import { SiteLogoMark } from "@/components/site-logo";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type OAuthProvider = "kakao" | "naver";
type OAuthMode = "login" | "signup";
type AuthCardVariant = "default" | "aurora";
type AuroraStyle = "ribbons" | "halo";

export function AuthCard({ title, subtitle, children, variant = "default", auroraStyle = "ribbons" }: { title?: string; subtitle?: string; children?: React.ReactNode; variant?: AuthCardVariant; auroraStyle?: AuroraStyle }) {
  const isAurora = variant === "aurora";
  return (
    <main className={isAurora ? "relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-white" : "flex min-h-screen items-center justify-center bg-background px-4 py-10"}>
      {isAurora ? (
        <div className={`aurora-bg aurora-bg-${auroraStyle}`} aria-hidden="true">
          <div className="aurora-nebula nebula-a" />
          <div className="aurora-nebula nebula-b" />
          <div className="aurora-ribbon ribbon-a" />
          <div className="aurora-ribbon ribbon-b" />
          <div className="aurora-ribbon ribbon-c" />
          <div className="aurora-ribbon ribbon-d" />
          <div className="aurora-ripple" />
          <div className="aurora-halo-core" />
          <div className="aurora-halo-ring ring-a" />
          <div className="aurora-halo-ring ring-b" />
          <div className="aurora-halo-ring ring-c" />
          <div className="aurora-halo-dust" />
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
            background:
              radial-gradient(circle at 50% 120%, rgba(62, 107, 255, 0.22), transparent 34%),
              radial-gradient(circle at 8% 10%, rgba(192, 70, 221, 0.14), transparent 26%),
              #080612;
          }

          .aurora-bg-halo .aurora-nebula,
          .aurora-bg-halo .aurora-ribbon,
          .aurora-bg-halo .aurora-ripple,
          .aurora-bg-ribbons .aurora-halo-core,
          .aurora-bg-ribbons .aurora-halo-ring,
          .aurora-bg-ribbons .aurora-halo-dust {
            display: none;
          }

          .aurora-nebula {
            position: absolute;
            border-radius: 50%;
            filter: blur(90px) saturate(140%);
            mix-blend-mode: screen;
            opacity: 0.36;
            will-change: transform;
          }

          .aurora-nebula.nebula-a {
            width: 86vw;
            height: 74vh;
            left: -22vw;
            top: -18vh;
            background:
              radial-gradient(circle at 40% 42%, rgba(107, 62, 255, 0.62), transparent 52%),
              radial-gradient(circle at 72% 58%, rgba(192, 70, 221, 0.32), transparent 48%);
            animation: nebula-a 18s ease-in-out infinite;
          }

          .aurora-nebula.nebula-b {
            width: 95vw;
            height: 82vh;
            right: -30vw;
            bottom: -24vh;
            background:
              radial-gradient(circle at 50% 48%, rgba(62, 107, 255, 0.58), transparent 54%),
              radial-gradient(circle at 28% 38%, rgba(192, 70, 221, 0.28), transparent 48%);
            animation: nebula-b 22s ease-in-out infinite;
            animation-delay: -8s;
          }

          .aurora-ribbon {
            position: absolute;
            top: -42vh;
            width: 36vw;
            min-width: 340px;
            height: 184vh;
            border-radius: 999px;
            filter: blur(24px) saturate(170%);
            mix-blend-mode: screen;
            opacity: 0.76;
            transform-origin: 50% 50%;
            will-change: transform;
            -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 82%, transparent 100%);
            mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 82%, transparent 100%);
          }

          .aurora-ribbon.ribbon-a {
            left: -6vw;
            background:
              linear-gradient(180deg, transparent 0%, rgba(107, 62, 255, 0.05) 9%, rgba(107, 62, 255, 0.7) 26%, rgba(192, 70, 221, 0.5) 48%, rgba(62, 107, 255, 0.32) 72%, transparent 100%),
              radial-gradient(ellipse at 50% 34%, rgba(255, 255, 255, 0.24), transparent 44%);
            animation: ribbon-a 8.5s ease-in-out infinite;
          }

          .aurora-ribbon.ribbon-b {
            left: 22vw;
            width: 31vw;
            opacity: 0.62;
            background:
              linear-gradient(180deg, transparent 0%, rgba(62, 107, 255, 0.07) 10%, rgba(62, 107, 255, 0.62) 30%, rgba(107, 62, 255, 0.46) 55%, rgba(192, 70, 221, 0.28) 78%, transparent 100%),
              radial-gradient(ellipse at 54% 52%, rgba(255, 255, 255, 0.18), transparent 42%);
            animation: ribbon-b 10s ease-in-out infinite;
            animation-delay: -3s;
          }

          .aurora-ribbon.ribbon-c {
            left: 54vw;
            width: 34vw;
            opacity: 0.68;
            background:
              linear-gradient(180deg, transparent 0%, rgba(192, 70, 221, 0.06) 8%, rgba(192, 70, 221, 0.58) 25%, rgba(107, 62, 255, 0.4) 56%, rgba(62, 107, 255, 0.44) 80%, transparent 100%),
              radial-gradient(ellipse at 46% 40%, rgba(255, 255, 255, 0.2), transparent 44%);
            animation: ribbon-c 11.5s ease-in-out infinite;
            animation-delay: -5s;
          }

          .aurora-ribbon.ribbon-d {
            right: -12vw;
            width: 29vw;
            min-width: 280px;
            opacity: 0.42;
            background:
              linear-gradient(180deg, transparent 0%, rgba(62, 107, 255, 0.06) 12%, rgba(107, 62, 255, 0.38) 36%, rgba(192, 70, 221, 0.34) 62%, transparent 100%),
              radial-gradient(ellipse at 44% 45%, rgba(255, 255, 255, 0.16), transparent 48%);
            animation: ribbon-d 13s ease-in-out infinite;
            animation-delay: -7s;
          }

          .aurora-ripple {
            position: absolute;
            inset: -28%;
            background:
              repeating-linear-gradient(112deg, transparent 0 9%, rgba(255, 255, 255, 0.035) 10%, transparent 13%),
              conic-gradient(from 160deg at 46% 48%, transparent 0deg, rgba(107, 62, 255, 0.12) 54deg, transparent 120deg, rgba(62, 107, 255, 0.13) 184deg, transparent 252deg, rgba(192, 70, 221, 0.1) 310deg, transparent 360deg);
            filter: blur(22px);
            mix-blend-mode: screen;
            opacity: 0.5;
            animation: ripple 6.5s ease-in-out infinite;
            will-change: transform;
          }

          @keyframes ribbon-a {
            0% {
              transform: translate3d(-18vw, 8vh, 0) rotate(63deg) scaleX(0.48) scaleY(1.08);
            }

            33% {
              transform: translate3d(14vw, -8vh, 0) rotate(72deg) scaleX(0.68) scaleY(1.15);
            }

            66% {
              transform: translate3d(-2vw, 12vh, 0) rotate(56deg) scaleX(0.55) scaleY(1);
            }

            100% {
              transform: translate3d(-18vw, 8vh, 0) rotate(63deg) scaleX(0.48) scaleY(1.08);
            }
          }

          @keyframes ribbon-b {
            0% {
              transform: translate3d(18vw, -6vh, 0) rotate(58deg) scaleX(0.5) scaleY(1.05);
            }

            33% {
              transform: translate3d(-16vw, 10vh, 0) rotate(48deg) scaleX(0.7) scaleY(1.18);
            }

            66% {
              transform: translate3d(4vw, 0, 0) rotate(66deg) scaleX(0.46) scaleY(1);
            }

            100% {
              transform: translate3d(18vw, -6vh, 0) rotate(58deg) scaleX(0.5) scaleY(1.05);
            }
          }

          @keyframes ribbon-c {
            0% {
              transform: translate3d(-12vw, 12vh, 0) rotate(67deg) scaleX(0.52) scaleY(1.1);
            }

            33% {
              transform: translate3d(12vw, -12vh, 0) rotate(54deg) scaleX(0.74) scaleY(1.18);
            }

            66% {
              transform: translate3d(-20vw, -2vh, 0) rotate(73deg) scaleX(0.5) scaleY(0.98);
            }

            100% {
              transform: translate3d(-12vw, 12vh, 0) rotate(67deg) scaleX(0.52) scaleY(1.1);
            }
          }

          @keyframes ribbon-d {
            0% {
              transform: translate3d(10vw, 6vh, 0) rotate(62deg) scaleX(0.44) scaleY(1.08);
            }

            50% {
              transform: translate3d(-14vw, -8vh, 0) rotate(75deg) scaleX(0.68) scaleY(1.16);
            }

            100% {
              transform: translate3d(10vw, 6vh, 0) rotate(62deg) scaleX(0.44) scaleY(1.08);
            }
          }

          @keyframes nebula-a {
            0% {
              transform: translate3d(0, 0, 0) scale(1);
            }

            50% {
              transform: translate3d(16vw, 7vh, 0) scale(1.12);
            }

            100% {
              transform: translate3d(0, 0, 0) scale(1);
            }
          }

          @keyframes nebula-b {
            0% {
              transform: translate3d(0, 0, 0) scale(1);
            }

            50% {
              transform: translate3d(-14vw, -8vh, 0) scale(1.1);
            }

            100% {
              transform: translate3d(0, 0, 0) scale(1);
            }
          }

          @keyframes ripple {
            0%,
            100% {
              transform: translate(0, 0) scale(1);
            }

            50% {
              transform: translate3d(-8vw, 6vh, 0) scale(1.08) rotate(4deg);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .aurora-nebula,
            .aurora-ribbon,
            .aurora-ripple,
            .aurora-halo-core,
            .aurora-halo-ring,
            .aurora-halo-dust {
              animation: none !important;
            }
          }

          .aurora-bg-halo {
            background:
              radial-gradient(circle at 50% 50%, rgba(107, 62, 255, 0.18), transparent 26%),
              radial-gradient(circle at 50% 52%, rgba(62, 107, 255, 0.16), transparent 50%),
              radial-gradient(circle at 48% 48%, rgba(192, 70, 221, 0.12), transparent 64%),
              #080612;
          }

          .aurora-halo-core {
            position: absolute;
            left: 50%;
            top: 50%;
            width: min(92vw, 920px);
            height: min(92vw, 920px);
            border-radius: 50%;
            background:
              radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.18), transparent 8%),
              radial-gradient(circle at 46% 44%, rgba(192, 70, 221, 0.42), transparent 28%),
              radial-gradient(circle at 56% 58%, rgba(62, 107, 255, 0.36), transparent 34%),
              radial-gradient(circle at 50% 50%, rgba(107, 62, 255, 0.28), transparent 52%);
            filter: blur(48px) saturate(150%);
            mix-blend-mode: screen;
            opacity: 0.72;
            transform: translate3d(-50%, -50%, 0);
            animation: halo-core 12s ease-in-out infinite;
            will-change: transform;
          }

          .aurora-halo-ring {
            position: absolute;
            left: 50%;
            top: 50%;
            border-radius: 50%;
            filter: blur(18px) saturate(170%);
            mix-blend-mode: screen;
            opacity: 0.76;
            transform-origin: 50% 50%;
            will-change: transform;
            -webkit-mask-image: radial-gradient(circle, transparent 0 42%, #000 47%, #000 63%, transparent 70%);
            mask-image: radial-gradient(circle, transparent 0 42%, #000 47%, #000 63%, transparent 70%);
          }

          .aurora-halo-ring.ring-a {
            width: min(150vw, 1420px);
            height: min(150vw, 1420px);
            background:
              conic-gradient(from 20deg, transparent 0deg, rgba(107, 62, 255, 0.82) 42deg, rgba(192, 70, 221, 0.56) 88deg, transparent 132deg, rgba(62, 107, 255, 0.64) 210deg, transparent 286deg, rgba(107, 62, 255, 0.52) 332deg, transparent 360deg);
            animation: halo-ring-a 9.5s ease-in-out infinite;
          }

          .aurora-halo-ring.ring-b {
            width: min(124vw, 1180px);
            height: min(124vw, 1180px);
            opacity: 0.58;
            filter: blur(22px) saturate(165%);
            background:
              conic-gradient(from 180deg, rgba(62, 107, 255, 0.7), transparent 58deg, rgba(192, 70, 221, 0.54) 118deg, transparent 178deg, rgba(107, 62, 255, 0.7) 242deg, transparent 310deg, rgba(62, 107, 255, 0.36));
            animation: halo-ring-b 13s ease-in-out infinite;
            animation-delay: -4s;
          }

          .aurora-halo-ring.ring-c {
            width: min(178vw, 1640px);
            height: min(178vw, 1640px);
            opacity: 0.4;
            filter: blur(28px) saturate(160%);
            background:
              conic-gradient(from 260deg, transparent 0deg, rgba(192, 70, 221, 0.45) 46deg, transparent 112deg, rgba(62, 107, 255, 0.48) 190deg, transparent 260deg, rgba(107, 62, 255, 0.42) 318deg, transparent 360deg);
            animation: halo-ring-c 17s ease-in-out infinite;
            animation-delay: -7s;
          }

          .aurora-halo-dust {
            position: absolute;
            inset: -18%;
            background:
              radial-gradient(circle at 44% 35%, rgba(255, 255, 255, 0.13), transparent 2%),
              radial-gradient(circle at 61% 60%, rgba(255, 255, 255, 0.1), transparent 1.7%),
              radial-gradient(circle at 32% 58%, rgba(192, 70, 221, 0.18), transparent 5%),
              radial-gradient(circle at 68% 42%, rgba(62, 107, 255, 0.16), transparent 6%);
            filter: blur(16px);
            mix-blend-mode: screen;
            opacity: 0.72;
            animation: halo-dust 8s ease-in-out infinite;
            will-change: transform;
          }

          @keyframes halo-core {
            0%,
            100% {
              transform: translate3d(-50%, -50%, 0) scale(0.96);
            }

            50% {
              transform: translate3d(-50%, -50%, 0) scale(1.12);
            }
          }

          @keyframes halo-ring-a {
            0% {
              transform: translate3d(-50%, -50%, 0) rotate(0deg) scale(0.96);
            }

            50% {
              transform: translate3d(-50%, -50%, 0) rotate(132deg) scale(1.08);
            }

            100% {
              transform: translate3d(-50%, -50%, 0) rotate(260deg) scale(0.96);
            }
          }

          @keyframes halo-ring-b {
            0% {
              transform: translate3d(-50%, -50%, 0) rotate(34deg) scaleX(1.08) scaleY(0.9);
            }

            50% {
              transform: translate3d(-50%, -50%, 0) rotate(-118deg) scaleX(0.92) scaleY(1.12);
            }

            100% {
              transform: translate3d(-50%, -50%, 0) rotate(-250deg) scaleX(1.08) scaleY(0.9);
            }
          }

          @keyframes halo-ring-c {
            0% {
              transform: translate3d(-50%, -50%, 0) rotate(-20deg) scale(1.02);
            }

            50% {
              transform: translate3d(-50%, -50%, 0) rotate(96deg) scale(0.92);
            }

            100% {
              transform: translate3d(-50%, -50%, 0) rotate(210deg) scale(1.02);
            }
          }

          @keyframes halo-dust {
            0%,
            100% {
              transform: translate3d(0, 0, 0) rotate(0deg);
            }

            50% {
              transform: translate3d(3vw, -4vh, 0) rotate(10deg);
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
