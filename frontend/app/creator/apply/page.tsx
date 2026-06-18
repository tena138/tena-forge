"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCreatorApplication, submitCreatorApplication, CreatorApplication } from "@/lib/saas";

export default function CreatorApplyPage() {
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getCreatorApplication().then(setApplication).catch(() => setApplication(null));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
    const next = await submitCreatorApplication(payload);
    setApplication(next);
    setMessage("크리에이터 신청이 제출되었습니다. 관리자 승인 후 판매 기능이 열립니다.");
  }

  if (application) {
    return (
      <div className="rounded-[14px] border border-white/10 bg-white/[0.045] p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-200">Creator Application</p>
        <h1 className="mt-2 text-3xl font-bold text-white">신청 상태: {application.status}</h1>
        <p className="mt-3 text-sm text-slate-400">{application.rejection_reason || "관리자 검토가 완료되면 크리에이터 관리 화면이 활성화됩니다."}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5 rounded-[14px] border border-white/10 bg-white/[0.045] p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-200">Creator Onboarding</p>
        <h1 className="mt-2 text-3xl font-bold text-white">크리에이터 신청</h1>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input name="legal_name" placeholder="실명 / 법인명" required />
        <Input name="display_name" placeholder="스토어 표시 이름" required />
        <Input name="email" type="email" placeholder="이메일" required />
        <Input name="phone" placeholder="연락처" />
        <Input name="business_type" placeholder="business type: individual / academy / corporation" defaultValue="individual" />
        <Input name="payout_bank_name" placeholder="정산 은행" required />
        <Input name="payout_account_number" placeholder="정산 계좌번호" required />
        <Input name="payout_account_holder" placeholder="예금주" required />
      </div>
      <textarea name="introduction" className="min-h-32 w-full rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white" placeholder="콘텐츠 소개와 경력, 판매 권리 설명" required />
      <div className="rounded-md border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
        본인은 판매 콘텐츠에 대한 정당한 권리를 보유하며, 마켓플레이스 판매자 약관과 저작권 침해 시 제재 및 정산 보류 정책에 동의합니다.
      </div>
      <Button type="submit">신청 제출</Button>
      {message && <p className="text-sm text-zinc-200">{message}</p>}
    </form>
  );
}
