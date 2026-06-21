"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import zxcvbn from "zxcvbn";

import { AuthCard, FieldError, FullWidthButton, PasswordStrength } from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/input";
import { resetPassword, validateResetToken } from "@/lib/auth-api";

const schema = z.object({
  password: z.string().min(8, "8자 이상 입력해주세요."),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "비밀번호가 일치하지 않습니다." });
  if (zxcvbn(data.password).score < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "더 강한 비밀번호를 사용해주세요." });
});

function ResetPasswordPageContent() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirmPassword: "" } });
  const password = form.watch("password");

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    validateResetToken(token).then((result) => setValid(result.valid)).catch(() => setValid(false));
  }, [token]);

  async function submit(values: z.infer<typeof schema>) {
    await resetPassword(token, values.password);
    router.replace("/login?message=password_changed");
  }

  if (valid === null) return <AuthCard title="링크 확인 중..." subtitle="비밀번호 재설정 링크를 확인하고 있습니다." />;
  if (!valid) {
    return (
      <AuthCard title="재설정 링크가 만료되었습니다" subtitle="새 비밀번호 재설정 링크를 받아주세요.">
        <Link href="/forgot-password" className="block rounded-md bg-black px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-zinc-800">새 링크 받기</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="새 비밀번호 설정">
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <label className="block text-sm font-semibold text-zinc-950">
          새 비밀번호 *
          <div className="relative mt-1.5">
            <Input type={showPassword ? "text" : "password"} className="h-11 pr-11" {...form.register("password")} />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-950" onClick={() => setShowPassword((value) => !value)} aria-label="비밀번호 표시 전환">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordStrength password={password} />
          <FieldError message={form.formState.errors.password?.message} />
        </label>
        <label className="block text-sm font-semibold text-zinc-950">
          새 비밀번호 확인 *
          <Input type="password" className="mt-1.5 h-11" {...form.register("confirmPassword")} />
          <FieldError message={form.formState.errors.confirmPassword?.message} />
        </label>
        <FullWidthButton loading={form.formState.isSubmitting}>비밀번호 변경</FullWidthButton>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard title="링크 확인 중..." subtitle="비밀번호 재설정 링크를 확인하고 있습니다." />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
