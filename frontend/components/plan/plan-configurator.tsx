"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";

import { SiteLogo } from "@/components/site-logo";
import {
  BillingCycle,
  PACKAGE_GROUPS,
  PLANS,
  PackageGroup,
  PackageOption,
  PaidPlanType,
  SubjectEngineCode,
  calculateMonthlyPrice,
  calculateSingleEngineMonthlyPrice,
  calculateSubjectEngineMonthlyDelta,
  formatKRW,
  getDefaultSelections,
  getResolvedSpecs,
  stringifySelectedPackageIds,
  stringifySubjectEngines,
} from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";

type ChoiceGroup = Extract<PackageGroup, "ai" | "storage">;
type StepperGroup = Extract<PackageGroup, "student" | "staff">;

const billingCycle: BillingCycle = "monthly";

const planCopy: Record<PaidPlanType, { eyebrow: string; title: string; description: string }> = {
  basic: {
    eyebrow: "Basic setup",
    title: "Basic 플랜 구성",
    description: "개인 과외와 소규모 수업 운영에 필요한 항목만 선택하세요.",
  },
  pro: {
    eyebrow: "Pro setup",
    title: "Pro 플랜 구성",
    description: "학원 운영 규모에 맞춰 과목, 사용량, 좌석만 간단히 조정하세요.",
  },
};

const subjectEngineOptions: Array<{
  code: SubjectEngineCode;
  title: string;
  badge: string;
  description: string;
}> = [
  {
    code: "math",
    title: "수학",
    badge: "1.0",
    description: "수식, 객관식, 서술형 수학 문항 추출",
  },
  {
    code: "korean",
    title: "국어",
    badge: "beta",
    description: "지문, 문항, 선택지 구조화",
  },
  {
    code: "english",
    title: "영어",
    badge: "beta",
    description: "영어 지문과 문항 세트 구조화",
  },
];

const packageCopy: Record<ChoiceGroup, { title: string; description: string }> = {
  ai: {
    title: "AI 사용량",
    description: "PDF 문항 추출과 자료 제작에 사용할 월간 credits를 선택합니다.",
  },
  storage: {
    title: "문항 DB와 저장공간",
    description: "보관할 문항 수와 PDF/출력물 저장공간을 선택합니다.",
  },
};

const stepperCopy: Record<StepperGroup, { title: string; description: string; unit: string; addon: string }> = {
  student: {
    title: "학생 수",
    description: "학생 앱, 과제, 오답 복습을 사용할 학생 수입니다.",
    unit: "명",
    addon: "학생 1명 추가당 월 8,000원",
  },
  staff: {
    title: "강사/매니저 좌석",
    description: "운영 워크스페이스에 함께 들어올 스태프 좌석입니다.",
    unit: "명",
    addon: "좌석 1개 추가당 월 10,000원",
  },
};

export function PlanConfigurator({ plan }: { plan: PaidPlanType }) {
  const [selectedPackageIds, setSelectedPackageIds] = useState<Record<PackageGroup, string>>(getDefaultSelections(plan));
  const [selectedSubjectEngines, setSelectedSubjectEngines] = useState<SubjectEngineCode[]>(["math"]);

  const specs = useMemo(() => getResolvedSpecs(plan, selectedPackageIds, selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const singleEngineMonthlyPrice = useMemo(() => calculateSingleEngineMonthlyPrice(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const monthlyPrice = useMemo(() => calculateMonthlyPrice(plan, selectedPackageIds, selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const subjectEngineDelta = useMemo(() => calculateSubjectEngineMonthlyDelta(singleEngineMonthlyPrice, selectedSubjectEngines), [singleEngineMonthlyPrice, selectedSubjectEngines]);
  const reviewHref = `/checkout/review?plan=${plan}&billing=${billingCycle}&packages=${encodeURIComponent(stringifySelectedPackageIds(selectedPackageIds))}&engines=${encodeURIComponent(stringifySubjectEngines(selectedSubjectEngines))}`;

  function selectPackage(group: PackageGroup, id: string) {
    setSelectedPackageIds((current) => ({ ...current, [group]: id }));
  }

  function toggleSubjectEngine(engine: SubjectEngineCode) {
    setSelectedSubjectEngines((current) => {
      if (current.includes(engine)) {
        const next = current.filter((item) => item !== engine);
        return next.length ? next : current;
      }
      return [...current, engine];
    });
  }

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-zinc-950">
      <ConfiguratorNav plan={plan} />
      <section className="px-4 pb-20 pt-28 sm:px-6 lg:pb-24 lg:pt-32">
        <div className="mx-auto w-full max-w-[96rem]">
          <header className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{planCopy[plan].eyebrow}</p>
            <h1 className="mt-4 text-5xl font-black tracking-normal text-zinc-950 sm:text-7xl">{planCopy[plan].title}</h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-zinc-600">{planCopy[plan].description}</p>
          </header>

          <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start">
            <div>
              <SubjectEngineSection selectedSubjectEngines={selectedSubjectEngines} subjectEngineDelta={subjectEngineDelta} onToggle={toggleSubjectEngine} />
              <PackageChoiceSection plan={plan} group="ai" selectedPackageIds={selectedPackageIds} onSelect={selectPackage} />
              <PackageChoiceSection plan={plan} group="storage" selectedPackageIds={selectedPackageIds} onSelect={selectPackage} />
              <StepperPackageSection plan={plan} group="student" selectedPackageIds={selectedPackageIds} onSelect={selectPackage} />
              <StepperPackageSection plan={plan} group="staff" selectedPackageIds={selectedPackageIds} onSelect={selectPackage} />
            </div>

            <PlanSummary
              plan={plan}
              specs={specs}
              selectedPackageIds={selectedPackageIds}
              selectedSubjectEngines={selectedSubjectEngines}
              monthlyPrice={monthlyPrice}
              reviewHref={reviewHref}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function ConfiguratorNav({ plan }: { plan: PaidPlanType }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-black/10 bg-[#fbfbfa]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[104rem] items-center justify-between px-4 sm:px-6 xl:px-8">
        <Link href="/plan" className="inline-flex h-11 min-w-0 items-center gap-3 text-sm font-black text-zinc-600 transition hover:text-black" aria-label="플랜 다시 선택">
          <SiteLogo className="h-9" />
          <span className="hidden items-center gap-1 sm:inline-flex">
            <ArrowLeft className="h-4 w-4" /> 플랜 다시 선택
          </span>
        </Link>
        <span className="rounded-full bg-black px-4 py-2 text-xs font-black text-white">{PLANS[plan].name}</span>
      </div>
    </nav>
  );
}

function ConfigSection({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-black/10 py-10 first:border-t-0 first:pt-0">
      <div className="grid gap-7 lg:grid-cols-[minmax(14rem,0.38fr)_minmax(0,0.62fr)] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{step}</p>
          <h2 className="mt-3 text-3xl font-black tracking-normal text-zinc-950">{title}</h2>
          <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-zinc-600 sm:text-base sm:leading-7">{description}</p>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

function SubjectEngineSection({
  selectedSubjectEngines,
  subjectEngineDelta,
  onToggle,
}: {
  selectedSubjectEngines: SubjectEngineCode[];
  subjectEngineDelta: number;
  onToggle: (engine: SubjectEngineCode) => void;
}) {
  return (
    <ConfigSection step="01" title="과목 엔진" description="추출할 과목을 선택하세요. 최소 한 과목은 유지됩니다.">
      <div role="group" aria-label="과목 엔진 선택" className="grid gap-3 sm:grid-cols-3">
        {subjectEngineOptions.map((engine) => {
          const selected = selectedSubjectEngines.includes(engine.code);
          const disabled = selected && selectedSubjectEngines.length === 1;
          return (
            <button
              key={engine.code}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToggle(engine.code)}
              className={choiceClassName(selected, disabled)}
            >
              <ChoiceHeader selected={selected} title={engine.title} badge={engine.badge} />
              <p className="mt-3 text-sm font-semibold leading-6 text-zinc-600">{engine.description}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-sm font-bold text-zinc-500">
        {subjectEngineDelta > 0 ? `추가 과목 금액 ${formatKRW(subjectEngineDelta)} / 월` : "수학 엔진은 기본 포함"}
      </p>
    </ConfigSection>
  );
}

function PackageChoiceSection({
  plan,
  group,
  selectedPackageIds,
  onSelect,
}: {
  plan: PaidPlanType;
  group: ChoiceGroup;
  selectedPackageIds: Record<PackageGroup, string>;
  onSelect: (group: PackageGroup, id: string) => void;
}) {
  const options = PACKAGE_GROUPS[plan][group] || [];

  return (
    <ConfigSection step={group === "ai" ? "02" : "03"} title={packageCopy[group].title} description={packageCopy[group].description}>
      <div role="radiogroup" aria-label={packageCopy[group].title} className="grid gap-3 md:grid-cols-3">
        {options.map((option) => {
          const selected = selectedPackageIds[group] === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(group, option.id)}
              className={choiceClassName(selected)}
            >
              <ChoiceHeader selected={selected} title={option.name} badge={priceDeltaLabel(option.monthlyPriceDelta)} />
              <p className="mt-3 text-sm font-semibold leading-6 text-zinc-600">{packageOptionDetail(group, option)}</p>
            </button>
          );
        })}
      </div>
    </ConfigSection>
  );
}

function StepperPackageSection({
  plan,
  group,
  selectedPackageIds,
  onSelect,
}: {
  plan: PaidPlanType;
  group: StepperGroup;
  selectedPackageIds: Record<PackageGroup, string>;
  onSelect: (group: PackageGroup, id: string) => void;
}) {
  const options = PACKAGE_GROUPS[plan][group] || [];
  const selectedIndex = Math.max(options.findIndex((option) => option.id === selectedPackageIds[group]), 0);
  const selectedOption = options[selectedIndex] || options[0];
  const minOption = options[0];
  const maxOption = options[options.length - 1];
  const value = packageMetric(group, selectedOption);
  const minValue = packageMetric(group, minOption);
  const maxValue = packageMetric(group, maxOption);
  const canDecrease = selectedIndex > 0;
  const canIncrease = selectedIndex < options.length - 1;

  function selectIndex(nextIndex: number) {
    const option = options[Math.max(0, Math.min(options.length - 1, nextIndex))];
    if (option) onSelect(group, option.id);
  }

  return (
    <ConfigSection step={group === "student" ? "04" : "05"} title={stepperCopy[group].title} description={stepperCopy[group].description}>
      <div className="rounded-[8px] border border-black/10 bg-white px-5 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black text-zinc-500">현재 선택</p>
            <p className="mt-2 text-5xl font-black tracking-normal text-zinc-950">
              {value.toLocaleString("ko-KR")}
              <span className="ml-1 text-2xl">{stepperCopy[group].unit}</span>
            </p>
          </div>
          <p className="text-sm font-black text-zinc-700">{priceDeltaLabel(selectedOption?.monthlyPriceDelta || 0)}</p>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button type="button" disabled={!canDecrease} onClick={() => selectIndex(selectedIndex - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] bg-zinc-100 text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35" aria-label={`${stepperCopy[group].title} 줄이기`}>
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(options.length - 1, 0)}
            step={1}
            value={selectedIndex}
            onChange={(event) => selectIndex(Number(event.target.value))}
            className="h-2 w-full accent-black"
            aria-label={`${stepperCopy[group].title} 선택`}
          />
          <button type="button" disabled={!canIncrease} onClick={() => selectIndex(selectedIndex + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] bg-zinc-100 text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35" aria-label={`${stepperCopy[group].title} 늘리기`}>
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black text-zinc-500">
          <span>{minValue.toLocaleString("ko-KR")}{stepperCopy[group].unit}</span>
          <span>{stepperCopy[group].addon}</span>
          <span>{maxValue.toLocaleString("ko-KR")}{stepperCopy[group].unit}</span>
        </div>
      </div>
    </ConfigSection>
  );
}

function PlanSummary({
  plan,
  specs,
  selectedPackageIds,
  selectedSubjectEngines,
  monthlyPrice,
  reviewHref,
}: {
  plan: PaidPlanType;
  specs: ReturnType<typeof getResolvedSpecs>;
  selectedPackageIds: Record<PackageGroup, string>;
  selectedSubjectEngines: SubjectEngineCode[];
  monthlyPrice: number;
  reviewHref: string;
}) {
  return (
    <aside className="rounded-[8px] border border-black/10 bg-white p-6 lg:sticky lg:top-24">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Summary</p>
      <h2 className="mt-3 text-3xl font-black tracking-normal text-zinc-950">{PLANS[plan].name}</h2>
      <p className="mt-5 text-sm font-bold text-zinc-500">7일 후 첫 자동결제 금액</p>
      <p className="mt-2 text-4xl font-black tracking-normal text-zinc-950">{formatKRW(monthlyPrice)}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-zinc-600">오늘은 결제수단만 등록하고 7일 무료 체험을 시작합니다.</p>

      <div className="mt-7 space-y-3 border-t border-black/10 pt-6 text-sm">
        <SummaryRow label="과목" value={selectedSubjectEngines.map(subjectEngineTitle).join(" + ")} />
        <SummaryRow label="AI" value={`${formatNumber(specNumber(specs.monthlyAiCredits))} credits / 월`} />
        <SummaryRow label="문항 DB" value={`${formatNumber(specNumber(specs.problemDb))}문항`} />
        <SummaryRow label="저장공간" value={formatStorage(specNumber(specs.fileStorageGb))} />
        <SummaryRow label="학생" value={`${formatNumber(specNumber(specs.studentKeys))}명`} />
        <SummaryRow label="스태프" value={`${formatNumber(specNumber(specs.staffSeats))}명`} />
      </div>

      <div className="mt-6 border-t border-black/10 pt-6">
        <SummaryRow label="AI Pack" value={selectedOptionName(plan, selectedPackageIds, "ai")} />
        <SummaryRow label="Storage" value={selectedOptionName(plan, selectedPackageIds, "storage")} />
      </div>

      <Link href={reviewHref} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-black text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/15">
        구성 확인하기 <ArrowRight className="h-4 w-4" />
      </Link>
      <p className="mt-3 text-center text-xs font-semibold leading-5 text-zinc-500">다음 화면에서 약관 확인 후 결제수단을 등록합니다.</p>
    </aside>
  );
}

function ChoiceHeader({ selected, title, badge }: { selected: boolean; title: string; badge: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-black tracking-normal text-zinc-950">{title}</h3>
        <span className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-700">{badge}</span>
      </div>
      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border", selected ? "border-black bg-black text-white" : "border-black/15 text-transparent")}>
        <Check className="h-4 w-4" />
      </span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 py-1">
      <span className="shrink-0 font-bold text-zinc-500">{label}</span>
      <span className="text-right font-black text-zinc-950">{value}</span>
    </div>
  );
}

function choiceClassName(selected: boolean, disabled = false) {
  return cn(
    "min-h-36 rounded-[8px] border p-5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10 disabled:cursor-not-allowed",
    selected ? "border-black bg-white shadow-[0_14px_36px_rgba(0,0,0,0.08)]" : "border-black/10 bg-white/60 hover:border-black/25 hover:bg-white",
    disabled && "opacity-85"
  );
}

function priceDeltaLabel(delta: number) {
  return delta > 0 ? `+${formatKRW(delta)} / 월` : "포함";
}

function packageOptionDetail(group: ChoiceGroup, option: PackageOption) {
  if (group === "ai") {
    return `${formatNumber(specNumber(option.specs.monthlyAiCredits))} credits / 월`;
  }
  return `${formatNumber(specNumber(option.specs.problemDb))}문항, ${formatStorage(specNumber(option.specs.fileStorageGb))}`;
}

function packageMetric(group: StepperGroup, option?: PackageOption) {
  if (!option) return 0;
  return group === "student" ? specNumber(option.specs.studentKeys) : specNumber(option.specs.staffSeats);
}

function selectedOptionName(plan: PaidPlanType, selectedPackageIds: Record<PackageGroup, string>, group: ChoiceGroup) {
  const option = (PACKAGE_GROUPS[plan][group] || []).find((item) => item.id === selectedPackageIds[group]);
  return option?.name || "기본";
}

function subjectEngineTitle(code: SubjectEngineCode) {
  return subjectEngineOptions.find((engine) => engine.code === code)?.title || code;
}

function specNumber(value: number | "custom" | false | undefined) {
  return typeof value === "number" ? value : 0;
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatStorage(gb: number) {
  if (gb >= 1024) return `${Math.round((gb / 1024) * 10) / 10}TB`;
  return `${formatNumber(gb)}GB`;
}
