"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import zxcvbn from "zxcvbn";

import { AuthCard, DividerText, FieldError, FullWidthButton, PasswordStrength, SocialButtons } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAcademy, requestRegistrationCode } from "@/lib/auth-api";

const schema = z
  .object({
    email: z.string().email("올바른 이메일을 입력해주세요."),
    password: z.string().min(8, "8자 이상 입력해주세요."),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력해주세요."),
    verification_code: z.string().default(""),
    verification_session: z.string().default(""),
    agree_terms: z.boolean().refine((value) => value === true, "서비스 이용약관에 동의해주세요."),
    agree_privacy: z.boolean().refine((value) => value === true, "개인정보 처리방침에 동의해주세요."),
    agree_marketing: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "비밀번호가 일치하지 않습니다." });
    }
    if (zxcvbn(data.password).score < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "더 강한 비밀번호를 사용해주세요." });
    }
  });

type RegisterFormInput = z.input<typeof schema>;
type RegisterForm = z.output<typeof schema>;
type AgreementName = "agree_terms" | "agree_privacy" | "agree_marketing";

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successEmail, setSuccessEmail] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState("");
  const form = useForm<RegisterFormInput, unknown, RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      verification_code: "",
      verification_session: "",
      agree_terms: false,
      agree_privacy: false,
      agree_marketing: false,
    },
    mode: "onChange",
  });
  const password = form.watch("password");
  const agreeTerms = form.watch("agree_terms");
  const agreePrivacy = form.watch("agree_privacy");
  const agreeMarketing = form.watch("agree_marketing");

  function setAgreement(name: AgreementName, checked: boolean) {
    form.setValue(name, checked, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    if (checked) form.clearErrors(name);
  }

  async function sendCode() {
    setServerError("");
    const ok = await form.trigger(["email", "password", "confirmPassword", "agree_terms", "agree_privacy"]);
    if (!ok) return;
    setSendingCode(true);
    try {
      const email = String(form.getValues("email")).trim();
      const result = await requestRegistrationCode(email);
      form.setValue("verification_session", result.verification_session, { shouldValidate: true });
      form.setValue("verification_code", "", { shouldValidate: false });
      setCodeSentTo(email);
      setStep(2);
    } catch (error: any) {
      setServerError(formatRegisterError(error));
    } finally {
      setSendingCode(false);
    }
  }

  async function submit(values: RegisterForm) {
    setServerError("");
    const verificationCode = values.verification_code.trim();
    if (!values.verification_session) {
      form.setError("verification_session", { message: "인증 코드를 먼저 받아주세요." });
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      form.setError("verification_code", { message: "이메일로 받은 6자리 인증 코드를 입력해주세요." });
      return;
    }
    try {
      const result = await registerAcademy({
        email: values.email.trim(),
        password: values.password,
        verification_code: verificationCode,
        verification_session: values.verification_session,
        agree_terms: values.agree_terms === true,
        agree_privacy: values.agree_privacy === true,
        agree_marketing: values.agree_marketing === true,
      });
      setSuccessEmail(result.email);
    } catch (error: any) {
      setServerError(formatRegisterError(error));
    }
  }

  if (successEmail) {
    return (
      <AuthCard title="가입이 완료되었습니다" subtitle={`${successEmail} 계정으로 로그인할 수 있습니다.`}>
        <div className="space-y-4 text-center">
          <p className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-4 py-5 text-sm leading-6 text-emerald-100">
            이메일 인증이 완료되어 계정이 활성화되었습니다.
          </p>
          <Link href="/login" className="block">
            <Button className="h-11 w-full">로그인으로 이동</Button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Tena 통합 회원가입">
      <div className="mb-6 grid grid-cols-2 gap-2 text-center text-xs font-semibold">
        {["계정 정보", "이메일 확인"].map((label, index) => (
          <div key={label} className={`rounded-[8px] border py-2 ${step >= index + 1 ? "border-primary/50 bg-primary/90 text-white" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>
            {index + 1}. {label}
          </div>
        ))}
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        {step === 1 && (
          <>
            <label className="block text-sm font-semibold text-slate-200">
              이메일 *
              <Input type="email" autoComplete="email" className="mt-1.5 h-11" {...form.register("email")} />
              <FieldError message={form.formState.errors.email?.message} />
            </label>
            <label className="block text-sm font-semibold text-slate-200">
              비밀번호 *
              <div className="relative mt-1.5">
                <Input type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-11 pr-11" {...form.register("password")} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
              <FieldError message={form.formState.errors.password?.message} />
            </label>
            <label className="block text-sm font-semibold text-slate-200">
              비밀번호 확인 *
              <Input type="password" autoComplete="new-password" className="mt-1.5 h-11" {...form.register("confirmPassword")} />
              <FieldError message={form.formState.errors.confirmPassword?.message} />
            </label>
            <Agreement label="서비스 이용약관에 동의합니다. *" checked={agreeTerms === true} error={form.formState.errors.agree_terms?.message} onCheckedChange={(checked) => setAgreement("agree_terms", checked)} />
            <Agreement label="개인정보 처리방침에 동의합니다. *" checked={agreePrivacy === true} error={form.formState.errors.agree_privacy?.message} onCheckedChange={(checked) => setAgreement("agree_privacy", checked)} />
            <Agreement label="마케팅 정보 수신에 동의합니다." checked={agreeMarketing === true} onCheckedChange={(checked) => setAgreement("agree_marketing", checked)} />
            {serverError && <p className="whitespace-pre-line rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">{serverError}</p>}
            <Button type="button" className="h-11 w-full" disabled={sendingCode} onClick={sendCode}>
              {sendingCode ? "인증 코드 전송 중..." : "인증 코드 받기"}
            </Button>
            <DividerText />
            <SocialButtons compact />
            <p className="text-center text-sm text-slate-400">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                로그인
              </Link>
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div className="rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-100">
              {codeSentTo}로 보낸 6자리 코드를 입력해주세요.
            </div>
            <label className="block text-sm font-semibold text-slate-200">
              인증 코드 *
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mt-1.5 h-12 text-center text-lg font-bold tracking-[0.35em]" {...form.register("verification_code")} />
              <FieldError message={form.formState.errors.verification_code?.message || form.formState.errors.verification_session?.message} />
            </label>
            {serverError && <p className="whitespace-pre-line rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">{serverError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setStep(1)}>
                이전
              </Button>
              <FullWidthButton loading={form.formState.isSubmitting}>가입 완료</FullWidthButton>
            </div>
            <button type="button" disabled={sendingCode} onClick={sendCode} className="block w-full text-center text-sm font-semibold text-primary hover:underline disabled:opacity-60">
              인증 코드 다시 받기
            </button>
          </>
        )}
      </form>
    </AuthCard>
  );
}

function formatRegisterError(error: any) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter(Boolean);
    if (messages.length) return messages.join("\n");
  }
  if (typeof detail === "string") return detail;
  if (detail?.message) return String(detail.message);
  return "회원가입에 실패했습니다.";
}

function Agreement({ label, checked, error, onCheckedChange }: { label: string; checked: boolean; error?: string; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="block rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold text-slate-200">
      <span className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
        {label}
      </span>
      <FieldError message={error} />
    </label>
  );
}
