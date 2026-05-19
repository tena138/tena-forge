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
import { registerAcademy, resendVerification } from "@/lib/auth-api";

const checkboxBoolean = z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean());
const requiredAgreement = (message: string) => checkboxBoolean.refine((value) => value === true, { message });

const schema = z
  .object({
    email: z.string().email("올바른 이메일을 입력해주세요."),
    password: z.string().min(8, "8자 이상 입력해주세요."),
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력해주세요."),
    account_type: z.enum(["academy", "student"]),
    academy_name: z.string().min(2, "이름 또는 소속명은 2자 이상이어야 합니다."),
    business_number: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    address_detail: z.string().optional(),
    agree_terms: requiredAgreement("서비스 이용약관에 동의해주세요."),
    agree_privacy: requiredAgreement("개인정보 처리방침에 동의해주세요."),
    agree_marketing: checkboxBoolean,
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

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successEmail, setSuccessEmail] = useState("");
  const form = useForm<RegisterFormInput, unknown, RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      account_type: "academy",
      academy_name: "",
      business_number: "",
      phone: "",
      address: "",
      address_detail: "",
      agree_terms: false,
      agree_privacy: false,
      agree_marketing: false,
    },
    mode: "onChange",
  });
  const password = form.watch("password");
  const accountType = form.watch("account_type");

  async function next() {
    const fields = step === 1 ? ["email", "password", "confirmPassword"] : ["account_type", "academy_name"];
    const ok = await form.trigger(fields as Array<keyof RegisterFormInput>);
    if (ok) setStep((value) => value + 1);
  }

  async function submit(values: RegisterForm) {
    setServerError("");
    try {
      const address = [values.address, values.address_detail].map((value) => value?.trim()).filter(Boolean).join(" ");
      const result = await registerAcademy({
        email: values.email.trim(),
        password: values.password,
        account_type: values.account_type,
        academy_name: values.academy_name.trim(),
        business_number: values.business_number?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        address: address || undefined,
        agree_terms: values.agree_terms === true,
        agree_privacy: values.agree_privacy === true,
        agree_marketing: values.agree_marketing === true,
      });
      setSuccessEmail(result.email);
    } catch (error: any) {
      setServerError(formatRegisterError(error));
    }
  }

  function formatBusinessNumber(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    return digits.replace(/(\d{3})(\d{0,2})(\d{0,5})/, (_, a, b, c) => [a, b, c].filter(Boolean).join("-"));
  }

  if (successEmail) {
    return (
      <AuthCard title="이메일을 확인해주세요" subtitle={`${successEmail}로 인증 링크를 발송했습니다.`}>
        <div className="space-y-4 text-center">
          <p className="rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-5 text-sm leading-6 text-sky-100">
            받은 메일함에서 인증 링크를 눌러 가입을 완료해주세요.
          </p>
          <Button className="w-full" onClick={() => resendVerification(successEmail)}>
            이메일 재발송
          </Button>
          <Link href="/login" className="block text-sm font-semibold text-primary hover:underline">
            로그인으로 돌아가기
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Tena 통합 회원가입">
      <div className="mb-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        {["계정 정보", "사용 유형", "약관 동의"].map((label, index) => (
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
            <Button type="button" className="h-11 w-full" onClick={next}>
              다음
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
            <div className="grid gap-2 sm:grid-cols-2">
              <AccountTypeCard
                active={accountType === "academy"}
                title="학원 계정"
                description="Academy OS로 좌석, 클래스, 과제, 테스트, 자료 배포를 관리합니다."
                onClick={() => form.setValue("account_type", "academy", { shouldValidate: true })}
              />
              <AccountTypeCard
                active={accountType === "student"}
                title="학생 계정"
                description="Student App으로 학원 연결, 과제, 오답노트, 캘린더를 사용합니다."
                onClick={() => form.setValue("account_type", "student", { shouldValidate: true })}
              />
            </div>

            <label className="block text-sm font-semibold text-slate-200">
              {accountType === "academy" ? "학원명 또는 소속명 *" : "학생 이름 *"}
              <Input className="mt-1.5 h-11" {...form.register("academy_name")} />
              <FieldError message={form.formState.errors.academy_name?.message} />
            </label>

            {accountType === "academy" && (
              <>
                <label className="block text-sm font-semibold text-slate-200">
                  사업자등록번호
                  <Input className="mt-1.5 h-11" placeholder="___-__-_____" value={form.watch("business_number") || ""} onChange={(event) => form.setValue("business_number", formatBusinessNumber(event.target.value))} />
                  <span className="mt-1 block text-xs font-normal text-slate-400">선택사항이며 나중에 입력할 수 있습니다.</span>
                </label>
                <label className="block text-sm font-semibold text-slate-200">
                  대표 전화
                  <Input className="mt-1.5 h-11" {...form.register("phone")} />
                </label>
                <label className="block text-sm font-semibold text-slate-200">
                  주소
                  <Input className="mt-1.5 h-11" {...form.register("address")} />
                  <Input className="mt-2 h-11" placeholder="상세 주소" {...form.register("address_detail")} />
                </label>
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setStep(1)}>
                이전
              </Button>
              <Button type="button" className="h-11" onClick={next}>
                다음
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Agreement label="서비스 이용약관에 동의합니다. *" error={form.formState.errors.agree_terms?.message} {...form.register("agree_terms")} />
            <Agreement label="개인정보 처리방침에 동의합니다. *" error={form.formState.errors.agree_privacy?.message} {...form.register("agree_privacy")} />
            <Agreement label="마케팅 정보 수신에 동의합니다." {...form.register("agree_marketing")} />
            {serverError && <p className="whitespace-pre-line rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">{serverError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setStep(2)}>
                이전
              </Button>
              <FullWidthButton loading={form.formState.isSubmitting}>가입 완료</FullWidthButton>
            </div>
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

function AccountTypeCard({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" className={`rounded-[10px] border p-4 text-left transition ${active ? "border-sky-300/60 bg-sky-300/12 text-white" : "border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.06]"}`} onClick={onClick}>
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span>
    </button>
  );
}

function Agreement({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold text-slate-200">
      <span className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-primary" {...props} />
        {label}
      </span>
      <FieldError message={error} />
    </label>
  );
}
