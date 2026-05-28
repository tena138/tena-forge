"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard, DividerText, FieldError, FullWidthButton, SocialButtons } from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/input";
import { loginAcademy } from "@/lib/auth-api";
import { AccountType, resolvePostLoginRedirect } from "@/lib/auth-redirect";

const schema = z.object({
  email: z.string().min(3, "아이디를 입력해주세요."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
  remember: z.boolean(),
});

type LoginForm = z.infer<typeof schema>;

const oauthErrorMessages: Record<string, string> = {
  signup_required: "가입되지 않은 소셜 계정입니다. 먼저 회원가입을 진행해주세요.",
  account_type_conflict: "이미 다른 계정 유형으로 가입된 소셜 계정입니다.",
  account_type_required: "회원가입에서 계정 유형을 먼저 선택해주세요.",
  oauth_token_failed: "소셜 인증에 실패했습니다. 앱 설정을 확인해주세요.",
  oauth_profile_failed: "소셜 프로필을 불러오지 못했습니다. 다시 시도해주세요.",
};
const hiddenOAuthErrors = new Set(["oauth_state_expired"]);

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const oauthError = searchParams.get("oauth_error");
  const visibleOauthError = oauthError && !hiddenOAuthErrors.has(oauthError) ? oauthError : null;
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  function finishLogin(accountType?: AccountType) {
    router.replace(resolvePostLoginRedirect(redirect, accountType));
  }

  async function submit(values: LoginForm) {
    setServerError("");
    try {
      const result = await loginAcademy(values);
      if (result.requires_totp) {
        setServerError("2단계 인증 계정은 보안 설정 화면에서 소셜 로그인으로 계속해주세요.");
        return;
      }
      finishLogin(result.academy?.account_type);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      setServerError(typeof detail === "string" ? detail : "로그인에 실패했습니다.");
    }
  }

  return (
    <AuthCard>
      <div className="space-y-5">
        {visibleOauthError ? (
          <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
            {oauthErrorMessages[visibleOauthError] || "소셜 로그인에 실패했습니다."}
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <label className="block">
            <span className="sr-only">아이디</span>
            <Input autoComplete="username" className="h-11" placeholder="ID" {...form.register("email")} />
            <FieldError message={form.formState.errors.email?.message} />
          </label>
          <label className="block">
            <span className="sr-only">비밀번호</span>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 pr-11" placeholder="PASSWORD" {...form.register("password")} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <FieldError message={form.formState.errors.password?.message} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-primary" {...form.register("remember")} />
            로그인 상태 유지
          </label>
          {serverError ? <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">{serverError}</p> : null}
          <FullWidthButton loading={form.formState.isSubmitting}>로그인</FullWidthButton>
        </form>

        <DividerText />
        <SocialButtons mode="login" redirect={redirect} />
        <p className="pt-1 text-center text-sm text-slate-400">
          계정이 없으신가요?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            회원가입
          </Link>
        </p>
      </div>
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
