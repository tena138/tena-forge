"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, ShieldCheck, UserCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

import { signupAction } from "@/lib/auth-actions";
import {
  BUSINESS_INFO_ROWS,
  LEGAL_DOCUMENTS,
  LEGAL_VERSIONS,
  SERVICE_INFO,
  type LegalBlock,
  type LegalDocument,
  type LegalDocumentKey,
} from "@/lib/legal";

type RequiredAgreementId = "terms" | "privacy" | "age";

type AgreementDefinition = {
  id: RequiredAgreementId | string;
  label: string;
  required: boolean;
  description: string;
  documentKey?: LegalDocumentKey;
  icon: LucideIcon;
};

const requiredAgreementItems = [
  {
    id: "terms",
    label: "서비스 이용약관 동의",
    required: true,
    description: "서비스 이용 조건과 책임 범위를 확인했습니다.",
    documentKey: "terms",
    icon: FileText,
  },
  {
    id: "privacy",
    label: "개인정보 처리방침 동의",
    required: true,
    description: "개인정보 수집, 이용, 보관, 파기 기준을 확인했습니다.",
    documentKey: "privacy",
    icon: ShieldCheck,
  },
  {
    id: "age",
    label: "만 14세 이상입니다",
    required: true,
    description: "본인은 만 14세 이상임을 확인합니다.",
    icon: UserCheck,
  },
] satisfies AgreementDefinition[];

const optionalAgreementItems: AgreementDefinition[] = [];

const initialRequiredAgreements: Record<RequiredAgreementId, boolean> = {
  terms: false,
  privacy: false,
  age: false,
};

export function SignupConsentForm({ message }: { message?: string }) {
  const agreedAtRef = useRef<HTMLInputElement>(null);
  const [requiredAgreements, setRequiredAgreements] = useState(initialRequiredAgreements);
  const [optionalAgreements, setOptionalAgreements] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(optionalAgreementItems.map((item) => [item.id, false])),
  );
  const [activeDocumentKey, setActiveDocumentKey] = useState<LegalDocumentKey | null>(null);

  const requiredComplete = requiredAgreementItems.every((item) => requiredAgreements[item.id as RequiredAgreementId]);
  const optionalComplete = optionalAgreementItems.every((item) => optionalAgreements[item.id]);
  const allChecked = requiredComplete && optionalComplete;

  function setAllAgreements(checked: boolean) {
    setRequiredAgreements({
      terms: checked,
      privacy: checked,
      age: checked,
    });
    setOptionalAgreements(Object.fromEntries(optionalAgreementItems.map((item) => [item.id, checked])));
  }

  function setRequiredAgreement(id: RequiredAgreementId, checked: boolean) {
    setRequiredAgreements((current) => ({ ...current, [id]: checked }));
  }

  function setOptionalAgreement(id: string, checked: boolean) {
    setOptionalAgreements((current) => ({ ...current, [id]: checked }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!requiredComplete) {
      event.preventDefault();
      return;
    }

    if (agreedAtRef.current) {
      agreedAtRef.current.value = new Date().toISOString();
    }
  }

  const displayMessage =
    message === "missing_env"
      ? "Supabase 환경 변수가 설정되지 않았습니다."
      : message;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="forge-panel rounded-[12px] p-5 sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <span className="forge-brand-mark grid h-11 w-11 place-items-center rounded-[10px] text-sm font-black text-white">T</span>
            <div>
              <p className="text-sm font-bold text-neutral-200">{SERVICE_INFO.serviceName}</p>
              <p className="text-xs text-neutral-500">시행일 {SERVICE_INFO.effectiveDateLabel}</p>
            </div>
          </div>

          <div className="mb-7">
            <h1 className="text-3xl font-bold text-white sm:text-4xl">회원가입 전 약관 동의</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300 sm:text-base">
              tena-forge 이용을 위해 아래 필수 항목을 확인하고 동의해 주세요.
            </p>
          </div>

          {displayMessage ? (
            <p className="forge-notice mb-5 rounded-[8px] p-3 text-sm leading-6">
              {displayMessage}
            </p>
          ) : null}

          <form action={signupAction} className="space-y-5" onSubmit={handleSubmit}>
            <input type="hidden" name="termsAgreed" value={requiredAgreements.terms ? "true" : "false"} readOnly />
            <input type="hidden" name="privacyAgreed" value={requiredAgreements.privacy ? "true" : "false"} readOnly />
            <input type="hidden" name="ageConfirmed" value={requiredAgreements.age ? "true" : "false"} readOnly />
            <input ref={agreedAtRef} type="hidden" name="agreedAt" defaultValue="" />
            <input type="hidden" name="termsVersion" value={LEGAL_VERSIONS.terms} readOnly />
            <input type="hidden" name="privacyVersion" value={LEGAL_VERSIONS.privacy} readOnly />

            <section className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 sm:p-5" aria-labelledby="account-info-title">
              <h2 id="account-info-title" className="text-base font-bold text-white">
                계정 정보
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-neutral-300">
                  이름
                  <input
                    name="name"
                    className="forge-input mt-2 h-11 w-full rounded-[8px] px-3"
                    autoComplete="name"
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-300">
                  이메일
                  <input
                    name="email"
                    className="forge-input mt-2 h-11 w-full rounded-[8px] px-3"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-300 sm:col-span-2">
                  비밀번호
                  <input
                    name="password"
                    className="forge-input mt-2 h-11 w-full rounded-[8px] px-3"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 sm:p-5" aria-labelledby="agreement-title">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="agreement-title" className="text-base font-bold text-white">
                    필수 약관 확인
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">필수 항목 3개를 모두 동의해야 회원가입을 계속할 수 있습니다.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-3 rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-neutral-100 transition hover:bg-white/[0.06] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/20">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-white/20 bg-black text-white accent-white"
                    checked={allChecked}
                    onChange={(event) => setAllAgreements(event.target.checked)}
                    aria-label="전체 동의"
                  />
                  전체 동의
                </label>
              </div>

              <div className="mt-4 space-y-3">
                {requiredAgreementItems.map((item) => (
                  <AgreementRow
                    key={item.id}
                    item={item}
                    checked={requiredAgreements[item.id as RequiredAgreementId]}
                    onCheckedChange={(checked) => setRequiredAgreement(item.id as RequiredAgreementId, checked)}
                    onView={item.documentKey ? () => setActiveDocumentKey(item.documentKey) : undefined}
                  />
                ))}
              </div>

              {optionalAgreementItems.length > 0 ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <h3 className="text-sm font-bold text-neutral-200">선택 동의 항목</h3>
                  <div className="mt-3 space-y-3">
                    {optionalAgreementItems.map((item) => {
                      const documentKey = item.documentKey;

                      return (
                        <AgreementRow
                          key={item.id}
                          item={item}
                          checked={optionalAgreements[item.id]}
                          onCheckedChange={(checked) => setOptionalAgreement(item.id, checked)}
                          onView={documentKey ? () => setActiveDocumentKey(documentKey) : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            {!requiredComplete ? (
              <p className="forge-notice rounded-[8px] p-3 text-sm leading-6" role="status">
                필수 약관과 만 14세 이상 확인에 모두 동의하면 회원가입 버튼이 활성화됩니다.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!requiredComplete}
              aria-disabled={!requiredComplete}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] border border-white/80 bg-white px-4 text-sm font-bold text-black transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.08] disabled:text-neutral-500"
            >
              {requiredComplete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
              동의하고 회원가입 계속하기
            </button>

            <p className="text-center text-sm text-neutral-400">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="font-semibold text-white hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
                로그인
              </Link>
            </p>
          </form>
        </section>

        <BusinessInfoPanel />
      </div>

      {activeDocumentKey ? (
        <LegalModal
          activeKey={activeDocumentKey}
          onActiveKeyChange={setActiveDocumentKey}
          onClose={() => setActiveDocumentKey(null)}
        />
      ) : null}
    </main>
  );
}

function AgreementRow({
  item,
  checked,
  onCheckedChange,
  onView,
}: {
  item: AgreementDefinition;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onView?: () => void;
}) {
  const checkboxId = `agreement-${item.id}`;
  const descriptionId = `${checkboxId}-description`;
  const Icon = item.icon;

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-white/10 bg-black/30 p-3 transition hover:border-white/20 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 rounded border-white/20 bg-black text-white accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          aria-describedby={descriptionId}
        />
        <div className="min-w-0">
          <label htmlFor={checkboxId} className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-bold text-neutral-100">
            <Icon className="h-4 w-4 text-neutral-200" aria-hidden="true" />
            <span>{item.required ? "[필수] " : "[선택] "}{item.label}</span>
            <span
              className={clsx(
                "inline-flex rounded-[6px] border px-2 py-0.5 text-[11px] font-bold",
                item.required
                  ? "border-white/25 bg-white/[0.10] text-white"
                  : "border-white/15 bg-white/[0.055] text-neutral-300",
              )}
            >
              {item.required ? "필수" : "선택"}
            </span>
          </label>
          <p id={descriptionId} className="mt-1 text-xs leading-5 text-neutral-400">
            {item.description}
          </p>
        </div>
      </div>
      {onView ? (
        <button
          type="button"
          onClick={onView}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.055] px-3 text-sm font-bold text-neutral-100 transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          aria-label={`${item.label} 보기`}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          보기
        </button>
      ) : null}
    </div>
  );
}

function BusinessInfoPanel() {
  return (
    <aside className="forge-surface rounded-[12px] p-5 text-xs leading-6 text-neutral-400 lg:sticky lg:top-8">
      <h2 className="text-sm font-bold text-neutral-100">사업자 정보</h2>
      <dl className="mt-4 space-y-2">
        {BUSINESS_INFO_ROWS.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="break-keep text-neutral-300">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function LegalModal({
  activeKey,
  onActiveKeyChange,
  onClose,
}: {
  activeKey: LegalDocumentKey;
  onActiveKeyChange: (key: LegalDocumentKey) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeDocument = LEGAL_DOCUMENTS[activeKey];

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeKey, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="forge-panel flex max-h-[88vh] w-full max-w-4xl flex-col rounded-[12px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
          <div>
            <h2 id="legal-dialog-title" className="text-xl font-bold text-white">
              {activeDocument.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.055] text-neutral-100 transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            aria-label="닫기"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-white/10 px-4 pt-3 sm:px-5" role="tablist" aria-label="약관 문서 선택">
          {(["terms", "privacy"] as LegalDocumentKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeKey === key}
              aria-controls={`legal-panel-${key}`}
              id={`legal-tab-${key}`}
              onClick={() => onActiveKeyChange(key)}
              className={clsx(
                "mr-2 rounded-t-[8px] border border-b-0 px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                activeKey === key
                  ? "border-white/10 bg-white/[0.08] text-white"
                  : "border-transparent text-neutral-400 hover:text-white",
              )}
            >
              {LEGAL_DOCUMENTS[key].title}
            </button>
          ))}
        </div>

        <div className="scrollbar-dark min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <LegalDocumentView document={activeDocument} />
        </div>
      </section>
    </div>
  );
}

function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article id={`legal-panel-${document.key}`} role="tabpanel" aria-labelledby={`legal-tab-${document.key}`} className="space-y-6">
      <header>
        <h3 className="text-2xl font-bold text-white">{document.title}</h3>
        <dl className="mt-4 grid gap-2 rounded-[10px] border border-white/10 bg-white/[0.035] p-3 text-sm sm:grid-cols-3">
          {document.meta.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-neutral-500">{label}</dt>
              <dd className="mt-1 font-semibold text-neutral-200">{value}</dd>
            </div>
          ))}
        </dl>
        {document.intro?.map((text) => (
          <p key={text} className="mt-4 text-sm leading-7 text-neutral-300">
            {text}
          </p>
        ))}
      </header>

      {document.sections.map((section) => (
        <section key={section.title} className="rounded-[10px] border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-base font-bold text-white">{section.title}</h4>
          <div className="mt-3 space-y-3">
            {section.blocks.map((block, index) => (
              <LegalBlockView key={`${section.title}-${index}`} block={block} />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  if (block.type === "paragraph") {
    return <p className="text-sm leading-7 text-neutral-300">{block.text}</p>;
  }

  if (block.type === "note") {
    return (
      <p className="forge-notice rounded-[8px] p-3 text-sm leading-7">
        {block.text}
      </p>
    );
  }

  if (block.type === "list") {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-neutral-300">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[8px] border border-white/10">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead className="bg-white/[0.06] text-neutral-200">
          <tr>
            <th scope="col" className="w-48 px-3 py-2 font-bold">
              {block.headers[0]}
            </th>
            <th scope="col" className="px-3 py-2 font-bold">
              {block.headers[1]}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-neutral-300">
          {block.rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row" className="px-3 py-2 align-top font-semibold text-neutral-200">
                {label}
              </th>
              <td className="px-3 py-2 align-top leading-6">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
