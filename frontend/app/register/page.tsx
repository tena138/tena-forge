"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AuthCard, FieldError, SocialButtons } from "@/components/auth/auth-ui";

const oauthErrorMessages: Record<string, string> = {
  account_type_conflict: "이미 다른 계정 유형으로 가입된 소셜 계정입니다.",
  account_type_required: "회원가입을 다시 시작해주세요.",
  signup_required: "회원가입을 먼저 진행해주세요.",
  oauth_state_expired: "소셜 인증 세션이 만료되었습니다. 다시 시도해주세요.",
  oauth_token_failed: "소셜 인증에 실패했습니다. 앱 설정을 확인해주세요.",
  oauth_profile_failed: "소셜 프로필을 불러오지 못했습니다. 다시 시도해주세요.",
};

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("oauth_error");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const disabled = !agreeTerms || !agreePrivacy;

  return (
    <AuthCard title="Tena 회원가입" subtitle="카카오 또는 네이버 인증 후 아이디와 비밀번호를 설정합니다.">
      <div className="space-y-5">
        {oauthError ? (
          <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
            {oauthErrorMessages[oauthError] || "소셜 회원가입에 실패했습니다."}
          </p>
        ) : null}

        <div className="space-y-2">
          <Agreement checked={agreeTerms} onChange={setAgreeTerms}>
            <Link href="/terms" className="underline underline-offset-4">서비스 이용약관</Link>에 동의합니다.
          </Agreement>
          <Agreement checked={agreePrivacy} onChange={setAgreePrivacy}>
            <Link href="/privacy" className="underline underline-offset-4">개인정보 처리방침</Link>에 동의합니다.
          </Agreement>
          {disabled ? <FieldError message="필수 약관에 동의하면 소셜 인증을 시작할 수 있습니다." /> : null}
        </div>

        <SocialButtons mode="signup" disabled={disabled} />

        <p className="pt-2 text-center text-sm text-slate-400">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

function Agreement({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold text-slate-200">
      <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthCard title="회원가입 준비 중..." />}>
      <RegisterPageContent />
    </Suspense>
  );
}
