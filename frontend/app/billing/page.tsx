"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getUsageSummary, listPlans, Plan, UsageSummary } from "@/lib/saas";
import { SUBJECT_ENGINES, subjectEngineLabel } from "@/lib/plan-pricing";

const subjectEngineOptions = SUBJECT_ENGINES;

function engineLabel(code: string) {
  return subjectEngineLabel(code);
}

function won(value: number | undefined) {
  return `${Math.max(0, value || 0).toLocaleString("ko-KR")}원`;
}

export default function BillingPage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedEngines, setSelectedEngines] = useState<string[]>(["math"]);

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

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-white/10 bg-white/[0.045] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-200">Billing</p>
        <h1 className="mt-2 text-3xl font-bold text-white">구독 및 사용량</h1>
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
        <div className="mt-4 flex flex-wrap gap-2">
          {subjectEngineOptions.map((engine) => (
            <button
              key={engine.code}
              type="button"
              className={`rounded-[8px] border px-3 py-2 text-sm font-semibold transition ${
                selectedEngines.includes(engine.code)
                  ? "border-zinc-300/70 bg-zinc-500/20 text-zinc-50"
                  : "border-white/10 bg-black/20 text-slate-300 hover:border-white/25"
              }`}
              onClick={() => toggleEngine(engine.code)}
            >
              {subjectEngineLabel(engine.code)}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const engineCount = Math.max(selectedEngines.length, 1);
          const engineDelta = Math.max(engineCount - 1, 0) * plan.monthly_price;
          const monthlyPrice = plan.monthly_price * engineCount;
          return (
            <div key={plan.code} className="rounded-[10px] border border-white/10 bg-white/[0.045] p-5">
              <h2 className="text-lg font-bold text-white">{plan.name}</h2>
              <p className="mt-2 text-2xl font-bold text-zinc-200">{won(monthlyPrice)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Base {won(plan.monthly_price)}{engineDelta ? ` + engine ${won(engineDelta)}` : ""}
              </p>
              {plan.code === "basic" || plan.code === "pro" ? (
                <Link className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" href={`/plan/${plan.code}`}>
                  결제 / 업그레이드
                </Link>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
