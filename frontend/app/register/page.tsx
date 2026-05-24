"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, GraduationCap } from "lucide-react";

import { AuthCard, FieldError, SocialButtons } from "@/components/auth/auth-ui";

type AccountType = "academy" | "student";

const oauthErrorMessages: Record<string, string> = {
  account_type_conflict: "이미 다른 계정 유형으로 가입된 소셜 계정입니다.",
  account_type_required: "계정 유형을 선택한 뒤 다시 시도해주세요.",
  signup_required: "회원가입을 먼저 진행해주세요.",
};

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("oauth_error");
  const [accountType, setAccountType] = useState<AccountType>("academy");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const disabled = !agreeTerms || !agreePrivacy;

  return (
    <AuthCard title="Tena 회원가입" subtitle="계정 유형을 선택한 뒤 카카오 또는 네이버로 가입합니다.">
      <div className="space-y-5">
        {oauthError ? (
          <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
            {oauthErrorMessages[oauthError] || "소셜 회원가입에 실패했습니다."}
          </p>
        ) : null}

        <div className="grid gap-2">
          <AccountTypeButton
            active={accountType === "academy"}
            icon={<Building2 className="h-4 w-4" />}
            title="학원 / 연구실 / 과외 교습자"
            detail="가입 즉시 Basic 7일 무료 체험"
            onClick={() => setAccountType("academy")}
          />
          <AccountTypeButton
            active={accountType === "student"}
            icon={<GraduationCap className="h-4 w-4" />}
            title="학생 / 학부모"
            detail="학생용 학습 공간으로 이동"
            onClick={() => setAccountType("student")}
          />
        </div>

        <div className="space-y-2">
          <Agreement checked={agreeTerms} onChange={setAgreeTerms}>
            <Link href="/terms" className="underline underline-offset-4">서비스 이용약관</Link>에 동의합니다.
          </Agreement>
          <Agreement checked={agreePrivacy} onChange={setAgreePrivacy}>
            <Link href="/privacy" className="underline underline-offset-4">개인정보 처리방침</Link>에 동의합니다.
          </Agreement>
          {disabled ? <FieldError message="필수 약관에 동의하면 소셜 가입을 시작할 수 있습니다." /> : null}
        </div>

        <SocialButtons mode="signup" accountType={accountType} disabled={disabled} />

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

function AccountTypeButton({
  active,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
        active ? "border-violet-300/70 bg-violet-500/18 text-white" : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/25"
      }`}
      onClick={onClick}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-md ${active ? "bg-violet-400 text-white" : "bg-white/[0.06] text-slate-300"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{detail}</span>
      </span>
    </button>
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
