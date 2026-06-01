"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AuthCard, FieldError, SocialButtons } from "@/components/auth/auth-ui";
import { LegalDocumentDialog } from "@/components/auth/legal-document-dialog";
import { BUSINESS_INFO_ROWS, type LegalDocumentKey } from "@/lib/legal";

const oauthErrorMessages: Record<string, string> = {
  account_type_conflict: "이미 다른 계정 유형으로 가입된 소셜 계정입니다.",
  account_type_required: "회원가입을 다시 시작해주세요.",
  signup_required: "회원가입을 먼저 진행해주세요.",
  oauth_token_failed: "소셜 인증에 실패했습니다. 앱 설정을 확인해주세요.",
  oauth_profile_failed: "소셜 프로필을 불러오지 못했습니다. 다시 시도해주세요.",
};
const hiddenOAuthErrors = new Set(["oauth_state_expired"]);

type AgreementId = "terms" | "privacy" | "age";

type AgreementItem = {
  id: AgreementId;
  label: string;
  inactiveText: string;
  activeText: string;
  documentKey?: LegalDocumentKey;
};

const requiredAgreementItems: AgreementItem[] = [
  {
    id: "terms",
    label: "[필수] 서비스 이용약관 동의",
    inactiveText: "보기",
    activeText: "동의 완료",
    documentKey: "terms",
  },
  {
    id: "privacy",
    label: "[필수] 개인정보 처리방침 동의",
    inactiveText: "보기",
    activeText: "동의 완료",
    documentKey: "privacy",
  },
  {
    id: "age",
    label: "[필수] 만 14세 이상입니다",
    inactiveText: "확인하기",
    activeText: "확인 완료",
  },
];

const optionalAgreementItems: AgreementItem[] = [];

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("oauth_error");
  const visibleOauthError = oauthError && !hiddenOAuthErrors.has(oauthError) ? oauthError : null;
  const [agreements, setAgreements] = useState<Record<AgreementId, boolean>>({
    terms: false,
    privacy: false,
    age: false,
  });
  const [activeDocumentKey, setActiveDocumentKey] = useState<LegalDocumentKey | null>(null);
  const requiredComplete = requiredAgreementItems.every((item) => agreements[item.id]);

  function agreeToDocument(key: LegalDocumentKey) {
    setAgreements((current) => ({
      ...current,
      [key]: true,
    }));
    setActiveDocumentKey(null);
  }

  function activateAgreement(item: AgreementItem) {
    if (item.documentKey) {
      setActiveDocumentKey(item.documentKey);
      return;
    }
    setAgreements((current) => ({ ...current, [item.id]: true }));
  }

  return (
    <>
      <AuthCard title="Tena 회원가입" subtitle="카카오 인증 후 아이디와 비밀번호를 설정합니다.">
        <div className="space-y-5">
          {visibleOauthError ? (
            <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
              {oauthErrorMessages[visibleOauthError] || "소셜 회원가입에 실패했습니다."}
            </p>
          ) : null}

          <section className="space-y-3" aria-labelledby="signup-agreement-title">
            <div>
              <h2 id="signup-agreement-title" className="text-sm font-bold text-white">
                회원가입 전 약관 동의
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">내용을 끝까지 확인한 뒤 동의해 주세요.</p>
            </div>

            <div className="space-y-2">
              {requiredAgreementItems.map((item) => (
                <AgreementRow key={item.id} item={item} active={agreements[item.id]} onClick={() => activateAgreement(item)} />
              ))}

              {optionalAgreementItems.map((item) => (
                <AgreementRow key={item.id} item={item} active={agreements[item.id]} onClick={() => activateAgreement(item)} />
              ))}
            </div>

            {requiredComplete ? null : <FieldError message="필수 항목을 모두 동의하면 소셜 인증을 시작할 수 있습니다." />}
          </section>

          <SocialButtons mode="signup" disabled={!requiredComplete} />

          <p className="pt-2 text-center text-sm text-slate-400">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              로그인
            </Link>
          </p>

          <BusinessInfoSummary />
        </div>
      </AuthCard>

      {activeDocumentKey ? (
        <LegalDocumentDialog
          activeKey={activeDocumentKey}
          onActiveKeyChange={setActiveDocumentKey}
          onAgree={agreeToDocument}
          onClose={() => setActiveDocumentKey(null)}
        />
      ) : null}
    </>
  );
}

function AgreementRow({ item, active, onClick }: { item: AgreementItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        active
          ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-50"
          : "border-white/10 bg-white/[0.035] text-slate-200 hover:border-white/20 hover:bg-white/[0.055]",
      ].join(" ")}
    >
      <span className="font-semibold">{item.label}</span>
      <span className={active ? "shrink-0 text-xs font-bold text-emerald-200" : "shrink-0 text-xs font-bold text-slate-400"}>
        {active ? item.activeText : item.inactiveText}
      </span>
    </button>
  );
}

function BusinessInfoSummary() {
  return (
    <dl className="border-t border-white/10 pt-4 text-[11px] leading-5 text-slate-500">
      {BUSINESS_INFO_ROWS.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
          <dt>{label}</dt>
          <dd className="break-keep text-slate-400">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthCard title="회원가입 준비 중..." />}>
      <RegisterPageContent />
    </Suspense>
  );
}
