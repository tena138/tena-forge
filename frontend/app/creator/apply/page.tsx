"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCreatorApplication, submitCreatorApplication, CreatorApplication } from "@/lib/saas";

const applicationStatusLabels: Record<string, string> = {
  pending: "검토 중",
  approved: "승인됨",
  rejected: "반려됨",
};

export default function CreatorApplyPage() {
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCreatorApplication().then(setApplication).catch(() => setApplication(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      legal_name: String(form.get("legal_name") || ""),
      display_name: String(form.get("display_name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      business_type: String(form.get("business_type") || "individual"),
      payout_bank_name: String(form.get("payout_bank_name") || ""),
      payout_account_number: String(form.get("payout_account_number") || ""),
      payout_account_holder: String(form.get("payout_account_holder") || ""),
      introduction: String(form.get("introduction") || ""),
      rights_agreed: true,
      seller_terms_agreed: true,
      infringement_policy_agreed: true,
      payout_policy_agreed: true,
    };

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const next = await submitCreatorApplication(payload);
      setApplication(next);
      setMessage("신청이 제출되었습니다. 승인 후 상품 관리가 열립니다.");
    } catch {
      setError("신청을 제출하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (application) {
    const statusLabel = applicationStatusLabels[application.status] || application.status;

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-[14px] bg-white p-7 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Creator Application</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-normal text-zinc-950">크리에이터 신청</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-zinc-600">
                {application.rejection_reason || "관리자 검토가 끝나면 판매 기능이 활성화됩니다."}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-800">{statusLabel}</span>
          </div>
          {application.status === "approved" ? (
            <Link
              href="/creator/products"
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            >
              상품 관리로 이동
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          ) : null}
        </section>
        {message ? <p className="rounded-[10px] bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700">{message}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5 rounded-[14px] bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Creator Onboarding</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-zinc-950">크리에이터 신청</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">판매 권리와 정산 정보를 확인해 관리자 검토를 요청합니다.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input name="legal_name" placeholder="실명 / 법인명" required />
        <Input name="display_name" placeholder="스토어 표시 이름" required />
        <Input name="email" type="email" placeholder="이메일" required />
        <Input name="phone" placeholder="연락처" />
        <Input name="business_type" placeholder="사업자 유형" defaultValue="individual" />
        <Input name="payout_bank_name" placeholder="정산 은행" required />
        <Input name="payout_account_number" placeholder="정산 계좌번호" required />
        <Input name="payout_account_holder" placeholder="예금주" required />
      </div>

      <textarea
        name="introduction"
        className="min-h-32 w-full rounded-[7px] border-0 bg-zinc-100 p-3 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-500 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-black/10"
        placeholder="콘텐츠 소개, 경력, 판매 권리 설명"
        required
      />

      <div className="rounded-[10px] bg-zinc-100 p-4 text-sm font-medium leading-6 text-zinc-700">
        <div className="mb-1 flex items-center gap-2 font-bold text-zinc-950">
          <ShieldCheck className="h-4 w-4" />
          판매 권리 확인
        </div>
        본인은 판매 콘텐츠에 대한 정당한 권리를 보유하며, 마켓플레이스 판매와 저작권 침해 시 제재 및 정산 보류 정책에 동의합니다.
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submitting ? "제출 중" : "신청 제출"}
      </Button>
      {message ? <p className="rounded-[8px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">{message}</p> : null}
      {error ? <p className="rounded-[8px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950">{error}</p> : null}
    </form>
  );
}
