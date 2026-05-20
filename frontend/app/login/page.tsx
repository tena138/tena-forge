"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard, DividerText, FieldError, FullWidthButton, SocialButtons } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAcademy, loginWithBackupCode, resendVerification } from "@/lib/auth-api";
import { AccountType, resolvePostLoginRedirect } from "@/lib/auth-redirect";

const schema = z.object({
  email: z.string().email("올바른 이메일을 입력해주세요."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
  remember: z.boolean(),
});

type LoginForm = z.infer<typeof schema>;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [totpAcademyId, setTotpAcademyId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState(["", "", "", "", "", ""]);
  const [backupMode, setBackupMode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const filledTotp = useMemo(() => totpCode.join(""), [totpCode]);

  function finishLogin(accountType?: AccountType) {
    router.replace(resolvePostLoginRedirect(redirect, accountType));
  }

  async function submit(values: LoginForm, totp?: string) {
    setServerError("");
    setUnverifiedEmail("");
    try {
      const result = await loginAcademy({ ...values, totp_code: totp });
      if (result.requires_totp && result.academy_id) {
        setTotpAcademyId(result.academy_id);
        return;
      }
      finishLogin(result.academy?.account_type);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "object" && detail?.locked_until) {
        setServerError(`계정이 잠겨 있습니다. ${new Date(detail.locked_until).toLocaleString("ko-KR")} 이후 다시 시도해주세요.`);
      } else {
        const message = typeof detail === "string" ? detail : "로그인에 실패했습니다.";
        setServerError(message);
        if (message.includes("이메일 인증")) setUnverifiedEmail(values.email);
      }
    }
  }

  async function submitTotp(code = filledTotp) {
    if (backupMode) {
      if (!totpAcademyId) return;
      try {
        const result = await loginWithBackupCode({ academy_id: totpAcademyId, backup_code: backupCode });
        finishLogin(result.academy?.account_type);
      } catch {
        setTotpError("백업 코드가 올바르지 않습니다.");
      }
      return;
    }
    if (code.length !== 6) return;
    setTotpError("");
    await submit(form.getValues(), code);
  }

  function updateTotp(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...totpCode];
    next[index] = digit;
    setTotpCode(next);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
    if (next.join("").length === 6) submitTotp(next.join(""));
  }

  function pasteTotp(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6).split("");
    if (digits.length !== 6) return;
    setTotpCode(digits);
    submitTotp(digits.join(""));
  }

  return (
    <AuthCard title="Tena 통합 로그인">
      <form className={`space-y-4 ${serverError ? "animate-[shake_0.25s_ease-in-out]" : ""}`} onSubmit={form.handleSubmit((values) => submit(values))}>
        <label className="block text-sm font-semibold text-slate-200">
          이메일
          <Input type="email" autoComplete="email" className="mt-1.5 h-11" {...form.register("email")} />
          <FieldError message={form.formState.errors.email?.message} />
        </label>
        <label className="block text-sm font-semibold text-slate-200">
          비밀번호
          <div className="relative mt-1.5">
            <Input type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 pr-11" {...form.register("password")} />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldError message={form.formState.errors.password?.message} />
        </label>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-400">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-primary" {...form.register("remember")} />
            로그인 상태 유지
          </label>
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">비밀번호 찾기</Link>
        </div>
        {serverError && <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">{serverError}</p>}
        {unverifiedEmail && (
          <Button type="button" variant="outline" className="w-full" onClick={() => resendVerification(unverifiedEmail)}>
            인증 이메일 재발송
          </Button>
        )}
        <FullWidthButton loading={form.formState.isSubmitting}>로그인</FullWidthButton>
      </form>

      <DividerText />
      <SocialButtons />
      <p className="mt-6 text-center text-sm text-slate-400">
        계정이 없으신가요? <Link href="/register" className="font-semibold text-primary hover:underline">회원가입</Link>
      </p>

      {totpAcademyId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#090b12] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-bold">2단계 인증</h2>
            <p className="mt-2 text-sm text-slate-400">{backupMode ? "백업 코드를 입력하세요." : "인증 앱의 6자리 코드를 입력하세요."}</p>
            {backupMode ? (
              <Input className="mt-5 h-11" value={backupCode} onChange={(event) => setBackupCode(event.target.value)} placeholder="백업 코드" />
            ) : (
              <div className="mt-5 grid grid-cols-6 gap-2">
                {totpCode.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(node) => { inputs.current[index] = node; }}
                    className="h-12 text-center text-lg font-bold"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onPaste={(event) => pasteTotp(event.clipboardData.getData("text"))}
                    onChange={(event) => updateTotp(index, event.target.value)}
                  />
                ))}
              </div>
            )}
            {totpError && <p className="mt-3 text-sm font-medium text-red-300">{totpError}</p>}
            <Button className="mt-5 h-11 w-full" onClick={() => submitTotp()}>{backupMode ? "백업 코드로 확인" : "확인"}</Button>
            <button type="button" className="mt-4 w-full text-sm font-semibold text-primary" onClick={() => setBackupMode((value) => !value)}>
              {backupMode ? "인증 코드 사용하기" : "백업 코드 사용하기"}
            </button>
          </div>
        </div>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCard title="로그인 준비 중..." />}>
      <LoginPageContent />
    </Suspense>
  );
}
