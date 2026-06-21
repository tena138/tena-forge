"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

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
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [plansError, setPlansError] = useState("");

  useEffect(() => {
    getUsageSummary()
      .then((data) => {
        setSummary(data);
        setSelectedEngines(data.subscription?.enabled_subject_engines?.length ? data.subscription.enabled_subject_engines : data.plan.enabled_subject_engines || ["math"]);
        setSummaryError("");
      })
      .catch(() => {
        setSummary(null);
        setSummaryError("구독 정보를 불러오지 못했습니다.");
      })
      .finally(() => setSummaryLoading(false));
    listPlans()
      .then((items) => {
        setPlans(items);
        setPlansError("");
      })
      .catch(() => {
        setPlans([]);
        setPlansError("플랜 목록을 불러오지 못했습니다.");
      })
      .finally(() => setPlansLoading(false));
  }, []);

  function toggleEngine(engine: string) {
    setSelectedEngines((current) => {
      const next = current.includes(engine) ? current.filter((item) => item !== engine) : [...current, engine];
      return next.length ? next : ["math"];
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[14px] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Billing</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-950">구독 및 사용량</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-zinc-600">현재 사용량을 확인하고, 결제수단 등록 전 필요한 플랜 구성을 선택합니다.</p>
      </section>

      {summaryLoading && (
        <section className="grid gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-[10px] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]" />
          ))}
        </section>
      )}

      {!summaryLoading && summaryError && (
        <section className="flex items-center gap-2 rounded-[12px] bg-white p-5 text-sm font-semibold text-zinc-700 shadow-sm">
          <AlertCircle className="h-4 w-4 text-zinc-950" />
          {summaryError}
        </section>
      )}

      {!summaryLoading && summary && (
        <section className="grid gap-3 md:grid-cols-5">
          {[
            ["현재 플랜", summary.plan.name],
            ["과목 엔진", (summary.subscription?.enabled_subject_engines || summary.plan.enabled_subject_engines || ["math"]).map(engineLabel).join(" + ")],
            ["AI credits", `${summary.extraction_credits_used ?? summary.monthly_ai_tokens_used}/${summary.monthly_credit_limit || summary.plan.monthly_ai_tokens}`],
            ["처리 예산", `${won(summary.estimated_cost_used_krw)}/${won(summary.monthly_cost_cap_krw)}`],
            ["업로드", `${(summary.uploaded_mb_this_month || 0).toFixed(1)}MB/${summary.monthly_upload_mb_limit || summary.plan.storage_quota_mb}MB`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold text-zinc-500">{label}</p>
              <p className="mt-2 text-xl font-bold text-zinc-950">{value}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-[12px] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">Subject Engines</h2>
            <p className="mt-1 text-sm font-medium text-zinc-500">최소 1개 엔진을 유지합니다.</p>
          </div>
          <p className="text-sm font-semibold text-zinc-700">선택: {selectedEngines.map(engineLabel).join(" + ")}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {subjectEngineOptions.map((engine) => {
            const selected = selectedEngines.includes(engine.code);
            const locked = selected && selectedEngines.length === 1;
            return (
              <button
                key={engine.code}
                type="button"
                aria-pressed={selected}
                disabled={locked}
                className={`rounded-[8px] px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  selected
                    ? "bg-black text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)] disabled:opacity-80"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-950"
                }`}
                onClick={() => toggleEngine(engine.code)}
              >
                {subjectEngineLabel(engine.code)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plansLoading && Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-[12px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]" />
        ))}
        {!plansLoading && plansError && (
          <div className="rounded-[12px] bg-white p-5 text-sm font-semibold text-zinc-700 shadow-sm md:col-span-2 xl:col-span-4">
            <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-zinc-950" />{plansError}</div>
          </div>
        )}
        {!plansLoading && !plansError && !plans.length && (
          <div className="rounded-[12px] bg-white p-5 text-sm font-semibold text-zinc-700 shadow-sm md:col-span-2 xl:col-span-4">
            표시할 플랜이 없습니다.
          </div>
        )}
        {plans.map((plan) => {
          const engineCount = Math.max(selectedEngines.length, 1);
          const engineDelta = Math.max(engineCount - 1, 0) * plan.monthly_price;
          const monthlyPrice = plan.monthly_price * engineCount;
          return (
            <div key={plan.code} className="rounded-[12px] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
              <h2 className="text-lg font-bold text-zinc-950">{plan.name}</h2>
              <p className="mt-2 text-2xl font-bold text-zinc-950">{won(monthlyPrice)}</p>
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                Base {won(plan.monthly_price)}{engineDelta ? ` + engine ${won(engineDelta)}` : ""}
              </p>
              {plan.code === "basic" || plan.code === "pro" ? (
                <Link className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-black px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15" href={`/plan/${plan.code}`}>
                  구성하기
                </Link>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
