"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getUsageSummary, listPlans, mockCheckout, Plan, UsageSummary } from "@/lib/saas";

const subjectEngineOptions = [
  { code: "math", label: "Math" },
  { code: "korean", label: "Korean Language" },
];

function engineLabel(code: string) {
  return subjectEngineOptions.find((engine) => engine.code === code)?.label || code;
}

function won(value: number | undefined) {
  return `${Math.max(0, value || 0).toLocaleString("ko-KR")}원`;
}

export default function BillingPage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedEngines, setSelectedEngines] = useState<string[]>(["math"]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getUsageSummary()
      .then((data) => {
        setSummary(data);
        setSelectedEngines(data.subscription?.enabled_subject_engines?.length ? data.subscription.enabled_subject_engines : data.plan.enabled_subject_engines || ["math"]);
      })
      .catch(() => setSummary(null));
    listPlans().then(setPlans).catch(() => setPlans([]));
  }, []);

  function toggleEngine(engine: string) {
    setSelectedEngines((current) => {
      const next = current.includes(engine) ? current.filter((item) => item !== engine) : [...current, engine];
      return next.length ? next : ["math"];
    });
  }

  async function checkout(plan: string) {
    const result = await mockCheckout(plan, selectedEngines);
    setMessage(result.message);
    setSummary(await getUsageSummary());
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-white/[0.045] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">Billing</p>
        <h1 className="mt-2 text-3xl font-bold text-white">구독 및 사용량</h1>
        <p className="mt-2 text-sm text-slate-400">AI credits, 처리 예산, 업로드 용량, 과목 엔진을 한 곳에서 확인합니다.</p>
      </section>

      {summary && (
        <section className="grid gap-3 md:grid-cols-5">
          {[
            ["현재 플랜", summary.plan.name],
            ["과목 엔진", (summary.subscription?.enabled_subject_engines || summary.plan.enabled_subject_engines || ["math"]).map(engineLabel).join(" + ")],
            ["AI credits", `${summary.extraction_credits_used ?? summary.monthly_ai_tokens_used}/${summary.monthly_credit_limit || summary.plan.monthly_ai_tokens}`],
            ["처리 예산", `${won(summary.estimated_cost_used_krw)}/${won(summary.monthly_cost_cap_krw)}`],
            ["업로드", `${(summary.uploaded_mb_this_month || 0).toFixed(1)}MB/${summary.monthly_upload_mb_limit || summary.plan.storage_quota_mb}MB`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] border border-white/10 bg-black/30 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-bold text-white">{value}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-[10px] border border-white/10 bg-white/[0.045] p-5">
        <h2 className="text-lg font-bold text-white">Subject Engines</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Korean Language extraction uses a separate high-precision pipeline for long passages, shared passage-question groups, and exact multiple-choice extraction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {subjectEngineOptions.map((engine) => (
            <button
              key={engine.code}
              type="button"
              className={`rounded-[8px] border px-3 py-2 text-sm font-semibold transition ${
                selectedEngines.includes(engine.code)
                  ? "border-violet-300/70 bg-violet-500/20 text-violet-50"
                  : "border-white/10 bg-black/20 text-slate-300 hover:border-white/25"
              }`}
              onClick={() => toggleEngine(engine.code)}
            >
              {engine.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Subject multiplier: x{Math.max(selectedEngines.length, 1)}. Base plan includes one subject engine; additional engines add the same base subject price.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const multiplier = Math.max(selectedEngines.length, 1);
          const monthlyCredits = plan.monthly_ai_tokens.toLocaleString("ko-KR");
          return (
            <div key={plan.code} className="rounded-[10px] border border-white/10 bg-white/[0.045] p-5">
              <h2 className="text-lg font-bold text-white">{plan.name}</h2>
              <p className="mt-2 text-2xl font-bold text-violet-200">{won(plan.monthly_price * multiplier)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Base {won(plan.monthly_price)} x {multiplier} engine{multiplier > 1 ? "s" : ""}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                월 {monthlyCredits} AI credits / 저장소 {plan.storage_quota_mb.toLocaleString("ko-KR")}MB
              </p>
              <Button className="mt-5 w-full" onClick={() => checkout(plan.code)}>mock 업그레이드</Button>
            </div>
          );
        })}
      </section>

      {message && <p className="rounded-md border border-violet-300/20 bg-violet-500/10 p-3 text-sm text-violet-100">{message}</p>}
    </div>
  );
}
