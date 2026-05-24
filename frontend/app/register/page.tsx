"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { FileText, ShieldCheck, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { AuthCard, FieldError, SocialButtons } from "@/components/auth/auth-ui";
import { LegalDocumentDialog } from "@/components/auth/legal-document-dialog";
import { BUSINESS_INFO_ROWS, LEGAL_VERSIONS, type LegalDocumentKey } from "@/lib/legal";

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
  description: string;
  documentKey?: LegalDocumentKey;
  icon: LucideIcon;
};

const requiredAgreementItems: AgreementItem[] = [
  {
    id: "terms",
    label: "서비스 이용약관 동의",
    description: `약관 버전 ${LEGAL_VERSIONS.terms}`,
    documentKey: "terms",
    icon: FileText,
  },
  {
    id: "privacy",
    label: "개인정보 처리방침 동의",
    description: `방침 버전 ${LEGAL_VERSIONS.privacy}`,
    documentKey: "privacy",
    icon: ShieldCheck,
  },
  {
    id: "age",
    label: "만 14세 이상입니다",
    description: "본인은 만 14세 이상임을 확인합니다.",
    icon: UserCheck,
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
  const allChecked = requiredComplete && optionalAgreementItems.every((item) => agreements[item.id]);

  function setAgreement(id: AgreementId, checked: boolean) {
    setAgreements((current) => ({ ...current, [id]: checked }));
  }

  function setAllAgreements(checked: boolean) {
    setAgreements({ terms: checked, privacy: checked, age: checked });
  }

  return (
    <>
      <AuthCard title="Tena 회원가입" subtitle="카카오 또는 네이버 인증 후 아이디와 비밀번호를 설정합니다.">
        <div className="space-y-5">
          {visibleOauthError ? (
            <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
              {oauthErrorMessages[visibleOauthError] || "소셜 회원가입에 실패했습니다."}
            </p>
          ) : null}

          <section className="space-y-3" aria-labelledby="signup-agreement-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="signup-agreement-title" className="text-sm font-bold text-white">
                  회원가입 전 약관 동의
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">tena-forge 이용을 위해 필수 항목을 확인해 주세요.</p>
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.07] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/60">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={allChecked}
                  onChange={(event) => setAllAgreements(event.target.checked)}
                  aria-label="전체 동의"
                />
                전체 동의
              </label>
            </div>

            <div className="space-y-2">
              {requiredAgreementItems.map((item) => (
                <AgreementRow
                  key={item.id}
                  item={item}
                  checked={agreements[item.id]}
                  onChange={(checked) => setAgreement(item.id, checked)}
                  onView={item.documentKey ? () => setActiveDocumentKey(item.documentKey!) : undefined}
                />
              ))}
            </div>

            {requiredComplete ? null : <FieldError message="필수 약관에 모두 동의하면 소셜 인증을 시작할 수 있습니다." />}
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
          onClose={() => setActiveDocumentKey(null)}
        />
      ) : null}
    </>
  );
}

function AgreementRow({
  item,
  checked,
  onChange,
  onView,
}: {
  item: AgreementItem;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onView?: () => void;
}) {
  const checkboxId = `agreement-${item.id}`;
  const descriptionId = `${checkboxId}-description`;
  const Icon = item.icon;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-200">
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={descriptionId}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={checkboxId} className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">
            <Icon className="h-4 w-4 text-violet-200" aria-hidden="true" />
            <span>[필수] {item.label}</span>
            <span className="rounded-md border border-red-300/20 bg-red-400/10 px-2 py-0.5 text-[11px] font-bold text-red-100">필수</span>
          </label>
          <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-400">
            {item.description}
          </p>
        </div>
        {onView ? (
          <button
            type="button"
            onClick={onView}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.055] px-2.5 text-xs font-bold text-slate-100 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label={`${item.label} 전문 보기`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            보기
          </button>
        ) : null}
      </div>
    </div>
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
