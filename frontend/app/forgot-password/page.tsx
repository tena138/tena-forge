"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthCard, FieldError, FullWidthButton } from "@/components/auth/auth-ui";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/auth-api";

const schema = z.object({ email: z.string().email("올바른 이메일을 입력해주세요.") });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  async function submit(values: z.infer<typeof schema>) {
    await forgotPassword(values.email);
    setSent(true);
  }

  return (
    <AuthCard title="비밀번호 찾기" subtitle="가입한 이메일을 입력하시면 재설정 링크를 보내드립니다.">
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="rounded-lg border border-zinc-300/20 bg-zinc-400/10 px-4 py-5 text-sm font-medium text-zinc-100">이메일을 발송했습니다. 받은 편지함을 확인해주세요.</p>
          <Link href="/login" className="block text-sm font-semibold text-primary hover:underline">로그인으로 돌아가기</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <label className="block text-sm font-semibold text-slate-200">
            이메일
            <Input type="email" className="mt-1.5 h-11" {...form.register("email")} />
            <FieldError message={form.formState.errors.email?.message} />
          </label>
          <FullWidthButton loading={form.formState.isSubmitting}>재설정 링크 보내기</FullWidthButton>
          <Link href="/login" className="block text-center text-sm font-semibold text-primary hover:underline">← 로그인으로 돌아가기</Link>
        </form>
      )}
    </AuthCard>
  );
}
