"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AuthCard, SocialButtons } from "@/components/auth/auth-ui";

const oauthErrorMessages: Record<string, string> = {
  signup_required: "가입되지 않은 소셜 계정입니다. 먼저 회원가입을 진행해주세요.",
  account_type_conflict: "이미 다른 계정 유형으로 가입된 소셜 계정입니다.",
  account_type_required: "회원가입에서 계정 유형을 먼저 선택해주세요.",
};

function LoginPageContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const oauthError = searchParams.get("oauth_error");

  return (
    <AuthCard title="Tena 로그인" subtitle="카카오 또는 네이버 계정으로 계속합니다.">
      <div className="space-y-4">
        {oauthError ? (
          <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
            {oauthErrorMessages[oauthError] || "소셜 로그인에 실패했습니다."}
          </p>
        ) : null}
        <SocialButtons mode="login" redirect={redirect} />
        <p className="pt-2 text-center text-sm text-slate-400">
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
