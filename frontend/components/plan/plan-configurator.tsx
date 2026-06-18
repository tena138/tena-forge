"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ClipboardCheck,
  ClipboardList,
  CheckCircle2,
  CreditCard,
  Database,
  FileUp,
  FileText,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  Gauge,
  HardDrive,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  LockKeyhole,
  Megaphone,
  Minus,
  PackageCheck,
  PanelLeftClose,
  Plus,
  RefreshCcw,
  School,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  UploadCloud,
  UserMinus,
  UserCircle,
  Users,
} from "lucide-react";

import { SiteLogo } from "@/components/site-logo";
import {
  BillingCycle,
  PACKAGE_GROUPS,
  PACKAGE_LABELS,
  PLANS,
  PackageGroup,
  PaidPlanType,
  SubjectEngineCode,
  SUBJECT_ENGINES,
  calculateSubjectEngineMonthlyDelta,
  calculateMonthlyPrice,
  calculateSingleEngineMonthlyPrice,
  formatKRW,
  getDefaultSelections,
  getResolvedSpecs,
  subjectEngineLabel,
  stringifySelectedPackageIds,
  stringifySubjectEngines,
} from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";

type SceneKey = "ai" | "storage" | "student";

const sectionScenes: Partial<Record<string, SceneKey>> = {
  ai: "ai",
  storage: "storage",
  student: "student",
  staff: "student",
};

export function PlanConfigurator({ plan }: { plan: PaidPlanType }) {
  const [selectedPackageIds, setSelectedPackageIds] = useState<Record<PackageGroup, string>>(getDefaultSelections(plan));
  const [selectedSubjectEngines, setSelectedSubjectEngines] = useState<SubjectEngineCode[]>(["math"]);
  const [billingCycle] = useState<BillingCycle>("monthly");
  const [activeScene, setActiveScene] = useState<SceneKey>("ai");
  const transitionSceneRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const previousPackageIdsRef = useRef<Record<PackageGroup, string>>(selectedPackageIds);

  const specs = useMemo(() => getResolvedSpecs(plan, selectedPackageIds, selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const singleEngineMonthlyPrice = useMemo(() => calculateSingleEngineMonthlyPrice(plan, selectedPackageIds), [plan, selectedPackageIds]);
  const monthlyPrice = useMemo(() => calculateMonthlyPrice(plan, selectedPackageIds, selectedSubjectEngines), [plan, selectedPackageIds, selectedSubjectEngines]);
  const subjectEngineDelta = useMemo(() => calculateSubjectEngineMonthlyDelta(singleEngineMonthlyPrice, selectedSubjectEngines), [singleEngineMonthlyPrice, selectedSubjectEngines]);
  const planConfig = PLANS[plan];

  useEffect(() => {
    const previous = previousPackageIdsRef.current;
    const changedGroup = (["ai", "storage", "student", "staff"] as const).find((group) => previous[group] !== selectedPackageIds[group]);
    previousPackageIdsRef.current = selectedPackageIds;
    if (changedGroup) setActiveScene(changedGroup === "staff" ? "student" : changedGroup);
  }, [selectedPackageIds]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextScene = visible?.target.id ? sectionScenes[visible.target.id] : undefined;
        if (nextScene) setActiveScene(nextScene);
      },
      { root: null, rootMargin: "-30% 0px -50% 0px", threshold: [0.2, 0.45, 0.7] }
    );
    Object.values(sectionRefs.current).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [plan]);

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

  const reviewHref = `/checkout/review?plan=${plan}&billing=${billingCycle}&packages=${encodeURIComponent(stringifySelectedPackageIds(selectedPackageIds))}&engines=${encodeURIComponent(stringifySubjectEngines(selectedSubjectEngines))}`;
  return (
    <main data-plan-theme={plan} className="relative min-h-screen overflow-x-clip bg-[#07080d] text-white">
      <ConfiguratorNav plan={plan} />
      {plan === "basic" && <ProPlanBackdrop />}
      {plan === "pro" && <BasicPlanBackdrop />}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />
      <div data-plan-divider className="pointer-events-none fixed inset-x-0 top-16 h-px bg-gradient-to-r from-transparent via-zinc-200/30 to-transparent" />
      <section ref={transitionSceneRef} data-plan-journey className="relative z-10 bg-transparent px-4 pb-16 pt-24 sm:px-6">
        <div data-plan-sticky className="mx-auto max-w-[92rem] bg-transparent">
          <PlanIntroStage
            plan={plan}
            specs={specs}
            selectedSubjectEngines={selectedSubjectEngines}
            monthlyPrice={monthlyPrice}
            billingCycle={billingCycle}
            progress={1}
            style={{ opacity: 1 }}
          />

          <div
            id="plan-config-workspace"
            className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start"
          >
            <aside className="min-h-0 lg:sticky lg:top-24" data-plan-stage>
              <ProductStage scene={activeScene} plan={plan} specs={specs} />
            </aside>

            <div ref={rightPanelRef} data-plan-scroll-panel className="space-y-6 pb-4">
              <SubjectEngineSection selectedSubjectEngines={selectedSubjectEngines} engineDelta={subjectEngineDelta} onToggle={toggleSubjectEngine} register={sectionRefs} />
              <PackageSection plan={plan} group="ai" selectedPackageIds={selectedPackageIds} onSelect={selectPackage} register={sectionRefs} />
              <PackageSection plan={plan} group="storage" selectedPackageIds={selectedPackageIds} onSelect={selectPackage} register={sectionRefs} />
              <StudentKeyPackageSection plan={plan} selectedPackageIds={selectedPackageIds} onSelect={selectPackage} register={sectionRefs}>
                <p className="mt-4 text-sm font-semibold text-slate-400">
                  {plan === "basic" ? "Basic은 학생 키 5개 포함, 최대 10개까지 1명당 월 8,000원으로 확장합니다." : "Pro는 학생 키 10개 포함, 최대 100개까지 1명당 월 8,000원으로 확장합니다."}
                </p>
              </StudentKeyPackageSection>
              <StaffSeatPackageSection plan={plan} selectedPackageIds={selectedPackageIds} onSelect={selectPackage} register={sectionRefs} />

              {plan === "basic" ? <LockedProFeatures register={sectionRefs} /> : null}

              {plan === "pro" && (
                <ConfigSection id="marketplace" register={sectionRefs} eyebrow="Marketplace" title="마켓플레이스 포함">
                  <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_18px_52px_rgba(0,0,0,0.24)]">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.06] text-zinc-100">
                        <Store className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-black">저작권 등록 자료를 전산화해 판매하고, 새로운 문항 공모에 참여하세요.</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-400">Pro에는 Marketplace access가 기본 포함됩니다.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {["저작권 교육 자료 전산화 판매", "문제 세트 및 템플릿 등록", "문항 공모 참여", "콘텐츠 리뷰와 정산 구조 확장"].map((item) => (
                        <SpecPill key={item} icon={Check} label={item} />
                      ))}
                    </div>
                    <p className="mt-5 rounded-[8px] border border-zinc-200/20 bg-zinc-200/10 px-4 py-3 text-sm font-bold text-zinc-100">
                      본인이 권리를 보유하거나 사용 허가를 받은 자료만 등록할 수 있습니다.
                    </p>
                  </div>
                </ConfigSection>
              )}

              <ConfigSection id="billing" register={sectionRefs} eyebrow="Billing" title="결제수단 등록">
                <div className="grid gap-3">
                  <BillingCard active title="7일 무료 체험" price={`${formatKRW(monthlyPrice)} / 월`} detail="오늘 0원, 체험 종료 후 자동결제" onClick={() => {}} />
                </div>
              </ConfigSection>

            </div>
          </div>
        </div>
      </section>
      <FullPlanSummarySection
        plan={plan}
        specs={specs}
        selectedPackageIds={selectedPackageIds}
        selectedSubjectEngines={selectedSubjectEngines}
        billingCycle={billingCycle}
        monthlyPrice={monthlyPrice}
        reviewHref={reviewHref}
      />
    </main>
  );
}

function BasicPlanBackdrop() {
  return (
    <div className="basic-plan-backdrop" aria-hidden="true">
      <span className="basic-plan-spectrum basic-plan-spectrum-a" />
      <span className="basic-plan-spectrum basic-plan-spectrum-b" />
      <span className="basic-plan-hairline basic-plan-hairline-a" />
      <span className="basic-plan-hairline basic-plan-hairline-b" />
    </div>
  );
}

function ProPlanBackdrop() {
  return (
    <div className="pro-plan-backdrop" aria-hidden="true">
      <span className="pro-plan-zinc-field pro-plan-zinc-field-a" />
      <span className="pro-plan-zinc-field pro-plan-zinc-field-b" />
      <span className="pro-plan-rail pro-plan-rail-a" />
      <span className="pro-plan-rail pro-plan-rail-b" />
      <span className="pro-plan-prism" />
    </div>
  );
}

function ConfiguratorNav({ plan }: { plan: PaidPlanType }) {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#07080d]/76 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[104rem] items-center justify-between px-4 sm:px-6 xl:px-8">
        <Link href="/plan" className="inline-flex h-11 min-w-0 items-center gap-3 text-sm font-black text-slate-300 transition hover:text-white" aria-label="플랜 다시 선택">
          <img src="/tenaforgelogo-dark.png" alt="Tena Forge" className="h-9 w-auto max-w-[8.75rem] object-contain sm:max-w-none" />
          <span className="hidden items-center gap-1 sm:inline-flex">
            <ArrowLeft className="h-4 w-4" /> 플랜 다시 선택
          </span>
        </Link>
        <span data-plan-badge className="rounded-[7px] border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black text-zinc-100">{PLANS[plan].name}</span>
      </div>
    </nav>
  );
}

function PlanIntroStage({
  plan,
  specs,
  selectedSubjectEngines,
  monthlyPrice,
  billingCycle,
  progress,
  style,
}: {
  plan: PaidPlanType;
  specs: ReturnType<typeof getResolvedSpecs>;
  selectedSubjectEngines: SubjectEngineCode[];
  monthlyPrice: number;
  billingCycle: BillingCycle;
  progress: number;
  style: React.CSSProperties;
}) {
  const planConfig = PLANS[plan];
  const displayPrice = monthlyPrice;

  return (
    <section className="relative z-10 flex min-h-screen items-center px-4 pt-16 sm:px-6">
      <div className="mx-auto w-full max-w-5xl py-20 transition-transform duration-300 ease-out" style={style}>
        <div className="mx-auto max-w-3xl text-center">
          <p data-plan-kicker className="text-xs font-black uppercase tracking-[0.22em] text-zinc-200">Plan</p>
          <h1 className="mt-5 text-5xl font-black tracking-normal text-white sm:text-7xl">{planConfig.name} 구성하기</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">{planConfig.positioning}</p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <PlanIntroMetric icon={Sparkles} label="AI credits" value={`${specs.monthlyAiCredits.toLocaleString()} / 월`} />
          <PlanIntroMetric icon={Database} label="문제 DB" value={`${specs.problemDb.toLocaleString()}문항`} />
          <PlanIntroMetric icon={HardDrive} label="Storage" value={Number(specs.fileStorageGb) >= 1024 ? "1TB" : `${specs.fileStorageGb.toLocaleString()}GB`} />
          <PlanIntroMetric icon={School} label="Student keys" value={`${specs.studentKeys.toLocaleString()}개`} />
          <PlanIntroMetric icon={Users} label="Staff seats" value={`${Number(specs.staffSeats).toLocaleString()}명`} />
        </div>

        <div data-plan-intro-callout className="mx-auto mt-8 max-w-2xl rounded-[12px] border border-zinc-200/20 bg-zinc-200/10 p-5 text-center shadow-[0_24px_80px_rgba(8,145,178,0.10)]">
          <p className="text-sm font-bold leading-6 text-zinc-100">PDF 추출은 AI credits를 사용합니다. 별도의 PDF 페이지 제한 없이, 선택한 AI 사용량 안에서 작업할 수 있습니다.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm font-black">
            <span className="rounded-[7px] border border-white/10 bg-white/[0.06] px-3 py-1.5 text-white">
              {selectedSubjectEngines.map(subjectEngineLabel).join(" + ")}
            </span>
            <span className="rounded-[7px] border border-white/10 bg-white/[0.06] px-3 py-1.5 text-white">{formatKRW(displayPrice)} / 월</span>
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <div className="h-12 w-7 rounded-full border border-white/15 p-1">
            <span className="mx-auto block h-2 w-1 rounded-full bg-white/60 transition-transform duration-300" style={{ transform: `translateY(${progress * 18}px)`, opacity: Math.max(0.2, 1 - progress) }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PlanIntroMetric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div data-plan-intro-metric className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 text-left shadow-[0_18px_52px_rgba(0,0,0,0.24)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <Icon data-plan-intro-icon className="h-4 w-4 text-zinc-100" />
      </div>
      <p className="mt-3 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function ConfigSection({ id, register, eyebrow, title, children }: { id: string; register: React.MutableRefObject<Record<string, HTMLElement | null>>; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} data-config-section ref={(node) => { register.current[id] = node; }} className="scroll-mt-24 rounded-[10px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-md sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-200">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-normal text-white sm:text-3xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PackageSection({ plan, group, selectedPackageIds, onSelect, register, children }: { plan: PaidPlanType; group: PackageGroup; selectedPackageIds: Record<PackageGroup, string>; onSelect: (group: PackageGroup, id: string) => void; register: React.MutableRefObject<Record<string, HTMLElement | null>>; children?: React.ReactNode }) {
  const options = PACKAGE_GROUPS[plan][group] || [];
  return (
    <ConfigSection id={group} register={register} eyebrow={PACKAGE_LABELS[group]} title={`${PACKAGE_LABELS[group]} 선택`}>
      <div role="radiogroup" aria-label={PACKAGE_LABELS[group]} className="grid gap-3">
        {options.map((option) => {
          const selected = selectedPackageIds[group] === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-plan-package-option
              data-selected={selected}
              onClick={() => onSelect(group, option.id)}
              className={cn(
                "rounded-[10px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-200/30",
                selected ? "border-zinc-200/60 bg-zinc-200/10 text-white shadow-[0_18px_50px_rgba(34,211,238,0.12)]" : "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.065]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{option.name}</h3>
                  <p className={cn("mt-1 text-sm leading-6", selected ? "text-slate-300" : "text-slate-400")}>{option.description}</p>
                </div>
                <span data-plan-check-dot className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border", selected ? "border-zinc-100 bg-zinc-100 text-slate-950" : "border-white/15 text-transparent")}>
                  <Check className="h-4 w-4" />
                </span>
              </div>
              <p data-plan-option-label className={cn("mt-4 text-sm font-black", selected ? "text-zinc-100" : "text-slate-200")}>{option.label}</p>
            </button>
          );
        })}
      </div>
      {children}
    </ConfigSection>
  );
}

function StudentKeyPackageSection({ plan, selectedPackageIds, onSelect, register, children }: { plan: PaidPlanType; selectedPackageIds: Record<PackageGroup, string>; onSelect: (group: PackageGroup, id: string) => void; register: React.MutableRefObject<Record<string, HTMLElement | null>>; children?: React.ReactNode }) {
  const options = PACKAGE_GROUPS[plan].student || [];
  const matchedIndex = options.findIndex((option) => option.id === selectedPackageIds.student);
  const selectedIndex = Math.max(matchedIndex, 0);
  const selectedOption = options[selectedIndex] || options[0];
  const includedKeys = Number(options[0]?.specs.studentKeys || 0);
  const maxKeys = Number(options[options.length - 1]?.specs.studentKeys || includedKeys);
  const studentKeys = Number(selectedOption?.specs.studentKeys || includedKeys);
  const additionalKeys = Math.max(studentKeys - includedKeys, 0);
  const canDecrease = selectedIndex > 0;
  const canIncrease = selectedIndex < options.length - 1;

  function selectIndex(nextIndex: number) {
    const option = options[Math.max(0, Math.min(options.length - 1, nextIndex))];
    if (option) onSelect("student", option.id);
  }

  return (
    <ConfigSection id="student" register={register} eyebrow={PACKAGE_LABELS.student} title="Student Key 선택">
      <div className="rounded-[10px] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">총 학생 키</p>
            <p className="mt-2 text-4xl font-black text-white">{studentKeys.toLocaleString("ko-KR")}명</p>
            <p className="mt-2 text-sm font-semibold text-slate-400">포함 {includedKeys}명 · 추가 {additionalKeys}명 · 최대 {maxKeys}명</p>
          </div>
          <div className="rounded-[8px] border border-zinc-200/20 bg-zinc-200/10 px-4 py-3 text-right">
            <p className="text-xs font-bold text-zinc-100">Student key addon</p>
            <p className="mt-1 text-lg font-black text-white">{selectedOption?.label || "포함"}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button type="button" disabled={!canDecrease} onClick={() => selectIndex(selectedIndex - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-white/[0.05] text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35" aria-label="학생 키 1명 줄이기">
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(options.length - 1, 0)}
            step={1}
            value={selectedIndex}
            onChange={(event) => selectIndex(Number(event.target.value))}
            className="h-2 w-full accent-zinc-200"
            aria-label="학생 키 수 선택"
          />
          <button type="button" disabled={!canIncrease} onClick={() => selectIndex(selectedIndex + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-white/[0.05] text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35" aria-label="학생 키 1명 늘리기">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <span>{includedKeys}명</span>
          <span>1명당 ₩8,000 / 월</span>
          <span>{maxKeys}명</span>
        </div>
      </div>
      {children}
    </ConfigSection>
  );
}

function StaffSeatPackageSection({ plan, selectedPackageIds, onSelect, register }: { plan: PaidPlanType; selectedPackageIds: Record<PackageGroup, string>; onSelect: (group: PackageGroup, id: string) => void; register: React.MutableRefObject<Record<string, HTMLElement | null>> }) {
  const options = PACKAGE_GROUPS[plan].staff || [];
  const matchedIndex = options.findIndex((option) => option.id === selectedPackageIds.staff);
  const selectedIndex = Math.max(matchedIndex, 0);
  const selectedOption = options[selectedIndex] || options[0];
  const maxSeats = Number(options[options.length - 1]?.specs.staffSeats || 0);
  const staffSeats = Number(selectedOption?.specs.staffSeats || 0);
  const canDecrease = selectedIndex > 0;
  const canIncrease = selectedIndex < options.length - 1;

  function selectIndex(nextIndex: number) {
    const option = options[Math.max(0, Math.min(options.length - 1, nextIndex))];
    if (option) onSelect("staff", option.id);
  }

  return (
    <ConfigSection id="staff" register={register} eyebrow={PACKAGE_LABELS.staff} title="Staff Seat 선택">
      <div className="rounded-[10px] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">초대 강사 좌석</p>
            <p className="mt-2 text-4xl font-black text-white">{staffSeats.toLocaleString("ko-KR")}명</p>
            <p className="mt-2 text-sm font-semibold text-slate-400">소유자 제외 · 초대 강사 {staffSeats}명 · 최대 {maxSeats}명</p>
          </div>
          <div className="rounded-[8px] border border-zinc-200/20 bg-zinc-200/10 px-4 py-3 text-right">
            <p className="text-xs font-bold text-zinc-100">Staff seat addon</p>
            <p className="mt-1 text-lg font-black text-white">{selectedOption?.label || "포함 없음"}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button type="button" disabled={!canDecrease} onClick={() => selectIndex(selectedIndex - 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-white/[0.05] text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35" aria-label="강사 좌석 1명 줄이기">
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(options.length - 1, 0)}
            step={1}
            value={selectedIndex}
            onChange={(event) => selectIndex(Number(event.target.value))}
            className="h-2 w-full accent-zinc-200"
            aria-label="강사 좌석 수 선택"
          />
          <button type="button" disabled={!canIncrease} onClick={() => selectIndex(selectedIndex + 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-white/10 bg-white/[0.05] text-white transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-35" aria-label="강사 좌석 1명 늘리기">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <span>0명</span>
          <span>1명당 ₩10,000 / 월</span>
          <span>{maxSeats}명</span>
        </div>
      </div>
    </ConfigSection>
  );
}

function SubjectEngineSection({
  selectedSubjectEngines,
  engineDelta,
  onToggle,
  register,
}: {
  selectedSubjectEngines: SubjectEngineCode[];
  engineDelta: number;
  onToggle: (engine: SubjectEngineCode) => void;
  register: React.MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  const capacityMultiplier = Math.max(selectedSubjectEngines.length, 1);

  return (
    <ConfigSection id="engines" register={register} eyebrow="Subject Engine" title="엔진 선택">
      <div className="grid gap-3">
        {SUBJECT_ENGINES.map((engine) => {
          const selected = selectedSubjectEngines.includes(engine.code);
          const disabled = selected && selectedSubjectEngines.length === 1;
          return (
            <button
              key={engine.code}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToggle(engine.code)}
              className={cn(
                "rounded-[10px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-200/30 disabled:cursor-not-allowed",
                selected ? "border-zinc-200/60 bg-zinc-200/10 text-white shadow-[0_18px_50px_rgba(34,211,238,0.12)]" : "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.065]",
                disabled && "opacity-85"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{engine.label} {engine.version}</h3>
                  <p className={cn("mt-1 text-sm leading-6", selected ? "text-slate-300" : "text-slate-400")}>{engine.description}</p>
                </div>
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border", selected ? "border-zinc-100 bg-zinc-100 text-slate-950" : "border-white/15 text-transparent")}>
                  <Check className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-3">
          <p className="text-xs font-bold text-slate-500">추가 금액</p>
          <p className="mt-1 text-sm font-black text-white">{engineDelta ? `+${formatKRW(engineDelta)} / 월` : "포함"}</p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-3">
          <p className="text-xs font-bold text-slate-500">용량 배율</p>
          <p className="mt-1 text-sm font-black text-white">x{capacityMultiplier} 적용</p>
        </div>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-400">엔진을 2개 선택하면 선택한 구성 금액이 정확히 2배가 되고, AI credits와 문제 DB 용량도 같은 배율로 계산됩니다.</p>
    </ConfigSection>
  );
}

function LockedProFeatures({ register }: { register: React.MutableRefObject<Record<string, HTMLElement | null>> }) {
  return (
    <ConfigSection id="locked" register={register} eyebrow="Pro features" title="Pro 전용 기능">
      <div className="grid gap-3 sm:grid-cols-2">
        <LockedCard title="여러 PDF 동시 추출" body="Pro에서 여러 PDF를 동시에 업로드하고 추출할 수 있습니다." />
        <LockedCard title="Marketplace" body="Pro에서 저작권 자료를 전산화해 판매하고, 문항 공모에 참여할 수 있습니다." />
      </div>
    </ConfigSection>
  );
}

function LockedCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.04] p-5">
      <LockKeyhole className="h-5 w-5 text-slate-400" />
      <h3 className="mt-4 font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function BillingCard({ active, title, price, detail, badge, onClick }: { active: boolean; title: string; price: string; detail: string; badge?: string; onClick: () => void }) {
  return (
    <button type="button" data-plan-billing-card data-active={active} onClick={onClick} className={cn("rounded-[10px] border p-5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-200/30", active ? "border-zinc-200/60 bg-zinc-200/10 shadow-[0_18px_50px_rgba(34,211,238,0.12)]" : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.065]")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-black text-white">{title}</h3>
        {badge && <span data-plan-discount-badge className="rounded-[6px] bg-zinc-200 px-2 py-1 text-[11px] font-black text-slate-950">{badge}</span>}
      </div>
      <p data-plan-billing-price className="mt-4 text-2xl font-black text-zinc-100">{price}</p>
      <p className="mt-1 text-sm font-semibold text-slate-400">{detail}</p>
    </button>
  );
}

function ProductStage({
  scene,
  plan,
  specs,
}: {
  scene: SceneKey;
  plan: PaidPlanType;
  specs: ReturnType<typeof getResolvedSpecs>;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const consoleSectionRefs = useRef<Partial<Record<SceneKey, HTMLElement | null>>>({});
  const [cameraY, setCameraY] = useState(0);
  const [focusSettled, setFocusSettled] = useState(true);
  const focusSignature = `${scene}:${specs.monthlyAiCredits}:${specs.fileStorageGb}:${specs.studentKeys}:${specs.staffSeats}:${specs.processingSpeed}:${specs.concurrentJobs}`;

  useEffect(() => {
    setFocusSettled(false);
    const timeout = window.setTimeout(() => setFocusSettled(true), 1120);
    return () => window.clearTimeout(timeout);
  }, [focusSignature]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const target = consoleSectionRefs.current[scene] || consoleSectionRefs.current.ai;
    if (!viewport || !content || !target) return;

    const updateCamera = () => {
      const maxOffset = Math.max(0, content.scrollHeight - viewport.clientHeight);
      const centerOffset = Math.max(24, (viewport.clientHeight - target.offsetHeight) / 2);
      const nextOffset = Math.min(Math.max(target.offsetTop - centerOffset, 0), maxOffset);
      setCameraY(-nextOffset);
    };

    updateCamera();
    const frame = window.requestAnimationFrame(updateCamera);
    const timeout = window.setTimeout(updateCamera, 90);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateCamera) : null;
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(content);
    window.addEventListener("resize", updateCamera);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateCamera);
    };
  }, [focusSignature]);

  const registerConsoleSection = (key: SceneKey) => (node: HTMLElement | null) => {
    consoleSectionRefs.current[key] = node;
  };

  return (
    <div data-product-stage-root className="relative h-[680px] min-h-[34rem] overflow-hidden rounded-[10px] border border-white/10 bg-[#07080d] shadow-[0_30px_100px_rgba(0,0,0,0.38)] backdrop-blur-md lg:min-h-0" style={{ height: "calc(100vh - 7rem)" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_4%,rgba(124,58,237,0.17),transparent_20rem),radial-gradient(circle_at_94%_18%,rgba(34,211,238,0.12),transparent_22rem),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(7,8,13,0.94)_44%,rgba(8,10,16,0.98))]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="flex h-14 items-center justify-between border-b border-white/10 bg-black/55 px-4 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo className="h-9 sm:h-9" />
            <button
              type="button"
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-transparent text-slate-400 transition hover:bg-white/[0.08] hover:text-white lg:inline-flex"
              aria-label="사이드바 접기"
              title="사이드바 접기"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-[7px] border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-bold text-slate-300 sm:inline-flex">{consoleSectionMeta[scene].route}</span>
            <span className="hidden rounded-[7px] border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black text-zinc-100 sm:inline-flex">{PLANS[plan].name}</span>
            <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300">
              <UserCircle className="h-3.5 w-3.5" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300">
              <Bell className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[12rem_minmax(0,1fr)]">
          <aside className="scrollbar-thin-dark overflow-y-auto border-r border-white/10 bg-black/45 px-1.5 py-3 shadow-[8px_0_32px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-2">
            <div className="space-y-3">
              {consoleSidebarSections.map((section) => (
                <section key={section.title} className={cn("overflow-hidden rounded-[12px] border shadow-[0_12px_30px_rgba(0,0,0,0.14)]", section.panel)}>
                  <div className="flex items-center justify-center border-b border-white/10 px-1 py-2 sm:justify-start sm:gap-2 sm:px-2.5 sm:py-2.5">
                    <span className={cn("rounded-full", section.accent, "h-1.5 w-8 sm:h-8 sm:w-1")} />
                    <div className="hidden min-w-0 sm:block">
                      <h2 className={cn("text-[12px] font-bold tracking-[0.02em]", section.header)}>{section.title}</h2>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{section.description}</p>
                    </div>
                  </div>
                  <div className="space-y-0.5 p-1">
                    {section.items.map((item, index) => {
                      const Icon = item.icon;
                      const active = item.scenes.includes(scene);
                      return (
                        <div
                          key={`${item.href}-${index}`}
                          title={item.label}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-[7px] border border-transparent px-0 text-sm font-medium transition-all duration-500 sm:justify-start sm:px-2.5",
                            active
                              ? "border-white/10 bg-white/[0.08] text-white shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                              : "text-slate-400 hover:border-white/10 hover:bg-white/[0.06] hover:text-white hover:shadow-sm"
                          )}
                          style={{ transform: active ? "translateX(2px)" : "translateX(0)" }}
                        >
                          <span className={cn("absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-transparent transition-colors sm:block", active && "bg-zinc-400")} />
                          <Icon className={cn("h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-slate-200", active && "text-zinc-300 group-hover:text-zinc-300")} />
                          <span className="hidden truncate sm:inline">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col bg-[#090b10]/[0.92]">
            <div data-console-header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-200">{consoleSectionMeta[scene].eyebrow}</p>
                <p className="mt-0.5 text-sm font-black text-slate-100">{consoleSectionMeta[scene].pageTitle}</p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="h-2 w-2 rounded-full bg-zinc-300 shadow-[0_0_18px_rgba(255,255,255,0.7)]" />
                <span className="text-xs font-bold text-slate-400">Live console preview</span>
              </div>
            </div>

            <div ref={viewportRef} data-console-viewport className="relative min-h-0 flex-1 overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-[#090b10] via-[#090b10]/[0.82] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-[#090b10] via-[#090b10]/80 to-transparent" />
              <div
                ref={contentRef}
                data-console-camera
                className="px-3 py-8 sm:px-5"
                style={{
                  transform: `translate3d(0, ${cameraY}px, 0)`,
                  transition: "transform 900ms cubic-bezier(0.18, 0.92, 0.22, 1)",
                }}
              >
                <ConsoleSection sceneKey="ai" innerRef={registerConsoleSection("ai")} active={scene === "ai"} settled={focusSettled} meta={consoleSectionMeta.ai}>
                  <AiUsageConsoleSection plan={plan} specs={specs} />
                </ConsoleSection>
                <ConsoleSection sceneKey="storage" innerRef={registerConsoleSection("storage")} active={scene === "storage"} settled={focusSettled} meta={consoleSectionMeta.storage}>
                  <StorageConsoleSection plan={plan} specs={specs} />
                </ConsoleSection>
                <ConsoleSection sceneKey="student" innerRef={registerConsoleSection("student")} active={scene === "student"} settled={focusSettled} meta={consoleSectionMeta.student}>
                  <StudentKeyConsoleSection plan={plan} specs={specs} />
                </ConsoleSection>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const consoleSectionMeta: Record<SceneKey, { label: string; shortLabel: string; pageTitle: string; eyebrow: string; route: string; icon: React.ComponentType<{ className?: string }> }> = {
  ai: { label: "AI 사용량", shortLabel: "AI", pageTitle: "제작 콘솔", eyebrow: "Private Studio", route: "/academy", icon: Sparkles },
  storage: { label: "Storage 용량", shortLabel: "Storage", pageTitle: "내 문항 아카이브", eyebrow: "Private Studio", route: "/problems", icon: HardDrive },
  student: { label: "Student Key 개수", shortLabel: "Keys", pageTitle: "학생 좌석, 과제, 클래스 운영", eyebrow: "Academy Operations", route: "/academy?panel=seats", icon: KeyRound },
};

const consoleSidebarSections: Array<{
  title: string;
  description: string;
  accent: string;
  panel: string;
  header: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; scenes: SceneKey[] }>;
}> = [
  {
    title: "Private Studio",
    description: "내 자료 제작",
    accent: "bg-zinc-400",
    panel: "border-zinc-400/20 bg-zinc-400/[0.055]",
    header: "text-zinc-100",
    items: [
      { href: "/academy", label: "제작 콘솔", icon: LayoutDashboard, scenes: ["ai"] },
      { href: "/archive/new", label: "추출", icon: FileUp, scenes: [] },
      { href: "/problems?needs_review=true", label: "문항 확인", icon: ClipboardCheck, scenes: [] },
      { href: "/problems", label: "보관", icon: Archive, scenes: ["storage"] },
      { href: "/problem-sets", label: "문항 세트", icon: FolderKanban, scenes: [] },
      { href: "/templates/mine", label: "템플릿", icon: LayoutTemplate, scenes: [] },
    ],
  },
  {
    title: "Licensed Library",
    description: "구독 및 구매 콘텐츠",
    accent: "bg-zinc-300",
    panel: "border-zinc-300/20 bg-zinc-300/[0.045]",
    header: "text-zinc-100",
    items: [
      { href: "/licensed-library", label: "라이선스 보관함", icon: Library, scenes: [] },
    ],
  },
  {
    title: "Marketplace",
    description: "공개 허브 및 스토어",
    accent: "bg-zinc-300",
    panel: "border-zinc-300/20 bg-zinc-300/[0.045]",
    header: "text-zinc-100",
    items: [
      { href: "/templates", label: "템플릿 허브", icon: LayoutTemplate, scenes: [] },
      { href: "/marketplace/problem-sets", label: "문항 세트 마켓", icon: Store, scenes: [] },
      { href: "/marketplace/books", label: "교재 마켓", icon: BookOpen, scenes: [] },
      { href: "/stores", label: "학원 스토어", icon: GraduationCap, scenes: [] },
      { href: "/stores", label: "강사 스토어", icon: UserCircle, scenes: [] },
    ],
  },
  {
    title: "Academy OS",
    description: "Seats, classes, assignments",
    accent: "bg-zinc-300",
    panel: "border-zinc-300/20 bg-zinc-300/[0.045]",
    header: "text-zinc-100",
    items: [
      { href: "/academy?panel=operations", label: "학원 운영", icon: GraduationCap, scenes: [] },
      { href: "/academy?panel=seats", label: "좌석 / 키", icon: KeyRound, scenes: ["student"] },
      { href: "/academy?panel=classes", label: "클래스 / 과제", icon: ClipboardList, scenes: [] },
    ],
  },
  {
    title: "Admin",
    description: "계정 및 정책",
    accent: "bg-slate-300",
    panel: "border-white/12 bg-white/[0.035]",
    header: "text-slate-200",
    items: [
      { href: "/account/profile", label: "프로필", icon: UserCircle, scenes: [] },
      { href: "/admin/announcements", label: "소식 관리", icon: Megaphone, scenes: [] },
      { href: "/account/rights-policy", label: "권리 및 업로드 정책", icon: ShieldCheck, scenes: [] },
      { href: "/settings", label: "설정", icon: Settings, scenes: [] },
    ],
  },
];

function ConsoleSection({
  sceneKey,
  innerRef,
  active,
  settled,
  softFocus = false,
  meta,
  children,
}: {
  sceneKey: SceneKey;
  innerRef: (node: HTMLElement | null) => void;
  active: boolean;
  settled: boolean;
  softFocus?: boolean;
  meta: { label: string; icon: React.ComponentType<{ className?: string }> };
  children: React.ReactNode;
}) {
  const Icon = meta.icon;
  const activeScale = softFocus ? (settled ? "scale-[1.01]" : "scale-[1.035]") : settled ? "scale-[1.025]" : "scale-[1.08]";

  return (
    <section
      ref={innerRef}
      data-console-scene={sceneKey}
      className={cn(
        "relative mb-6 origin-center rounded-[8px] border p-4 transition-all duration-700 ease-out sm:p-5",
        active
          ? cn("z-10 border-zinc-200/[0.55] bg-[#111a24] opacity-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_24px_70px_rgba(8,145,178,0.24)]", activeScale)
          : "border-white/[0.08] bg-[#0d131c]/72 opacity-45 scale-[0.985]"
      )}
      style={{ animation: active && !settled ? "consoleFocusPulse 1550ms ease-out 1" : undefined }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <span className={cn("grid h-8 w-8 place-items-center rounded-[7px] border", active ? "border-zinc-200/30 bg-zinc-200/[0.12] text-zinc-100" : "border-white/10 bg-white/[0.04] text-slate-500")}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-black text-white">{meta.label}</p>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Console section</p>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-black", active ? "bg-zinc-200 text-slate-950" : "bg-white/[0.05] text-slate-500")}>{active ? "Focused" : "Live"}</span>
      </div>
      {children}
    </section>
  );
}

function AiUsageConsoleSection({ plan, specs }: { plan: PaidPlanType; specs: ReturnType<typeof getResolvedSpecs> }) {
  const creditLimit = numericSpec(specs.monthlyAiCredits);
  const creditMax = plan === "basic" ? 2000 : 10000;
  const animatedCredits = useAnimatedNumber(creditLimit, 820);
  const animatedRemaining = useAnimatedNumber(Math.round(creditLimit * 0.62), 760);
  const animatedRequests = useAnimatedNumber(Math.round(creditLimit * 1.72), 700);
  const animatedProblems = useAnimatedNumber(Math.round(creditLimit * 9.8), 820);
  const animatedReview = useAnimatedNumber(Math.max(2, Math.round(creditLimit * 0.08)), 720);
  const animatedUntagged = useAnimatedNumber(Math.max(1, Math.round(creditLimit * 0.05)), 720);
  const animatedTemplates = useAnimatedNumber(Math.max(3, Math.round(creditLimit / 260)), 700);
  const capacityPercent = percentage(creditLimit, creditMax);
  const chartBars = [0.38, 0.62, 0.46, 0.72, 0.58, 0.84, 0.68];

  return (
    <div className="space-y-4">
      <ConsoleHero
        activeLabel="새 PDF 업로드"
        secondaryLabel="검토 대기 문항 보기"
        title="AI 콘텐츠 제작소"
        body="PDF 문항을 추출하고, 검토하고, 태깅하여 문제 세트로 완성합니다."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AcademyStat label="전체 문항" value={formatNumber(animatedProblems)} icon={Archive} detail="문항 아카이브" />
        <AcademyStat label="검토 대기" value={formatNumber(animatedReview)} icon={ClipboardCheck} detail="추출 후 확인 필요" tone="warning" />
        <AcademyStat label="문제 세트" value={formatNumber(Math.round(animatedCredits / 125))} icon={FolderKanban} detail="조립된 수업 자료" />
        <AcademyStat label="템플릿" value={formatNumber(animatedTemplates)} icon={LayoutTemplate} detail="출력 양식" />
      </div>

      <ConsoleNextAction reviewCount={Math.round(animatedReview)} untaggedCount={Math.round(animatedUntagged)} actionLabel="문항 확인" />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-400">AI usage meter</p>
              <p className="mt-1 text-3xl font-black text-white">{formatNumber(animatedCredits)} credits</p>
            </div>
            <span className="rounded-[6px] bg-zinc-300/[0.14] px-2.5 py-1 text-xs font-black text-zinc-100">limit expanded</span>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-zinc-300 via-zinc-300 to-zinc-300 transition-[width] duration-700 ease-out" style={{ width: `${capacityPercent}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
            <span>선택된 패키지 한도</span>
            <span>{formatNumber(creditMax)} max</span>
          </div>
          <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-slate-300">
            {formatNumber(animatedRequests)} monthly requests가 새 credit limit 안에서 다시 계산됩니다.
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ConsoleMiniCard label="Remaining this month" value={`${formatNumber(animatedRemaining)} credits`} tone="emerald" />
          <ConsoleMiniCard label="Monthly production scale" value={`${formatNumber(animatedRequests)} requests`} tone="cyan" />
        </div>

        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-white">최근 배치</p>
            <p className="text-xs font-bold text-slate-500">PDF extraction / parse / review</p>
          </div>
          <div className="mt-5 flex h-28 items-end gap-2">
            {chartBars.map((bar, index) => (
              <div key={index} className="flex-1 overflow-hidden rounded-t-[5px] bg-white/[0.055]">
                <div
                  className="rounded-t-[5px] bg-gradient-to-t from-zinc-500/70 via-zinc-400/80 to-zinc-100 transition-[height] duration-700 ease-out"
                  style={{ height: `${Math.max(18, Math.min(96, bar * capacityPercent + 18))}%`, transitionDelay: `${index * 55}ms` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-[8px] border border-white/10">
            {[
              ["algebra_midterm.pdf", "processing", Math.round(creditLimit * 0.18), "AI credits 차감"],
              ["reading_set.pdf", "needs_review", Math.round(creditLimit * 0.12), "검토 필요"],
              ["extract_042.pdf", "done", Math.round(creditLimit * 0.08), "태깅 완료"],
            ].map(([file, status, count, stage], index) => (
              <ConsoleBatchRow key={String(file)} index={index} file={String(file)} status={String(status)} count={Number(count)} stage={String(stage)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StorageConsoleSection({ plan, specs }: { plan: PaidPlanType; specs: ReturnType<typeof getResolvedSpecs> }) {
  const capacity = numericSpec(specs.fileStorageGb);
  const problemDb = numericSpec(specs.problemDb);
  const storageMax = plan === "basic" ? 100 : 1024;
  const baseStorageValue = PACKAGE_GROUPS[plan].storage?.[0]?.specs.fileStorageGb;
  const baseProblemDbValue = PACKAGE_GROUPS[plan].storage?.[0]?.specs.problemDb;
  const baseStorage = typeof baseStorageValue === "number" ? baseStorageValue : capacity;
  const baseProblemDb = typeof baseProblemDbValue === "number" ? baseProblemDbValue : problemDb;
  const animatedCapacity = useAnimatedNumber(capacity, 820);
  const animatedDb = useAnimatedNumber(problemDb, 780);
  const usedStorage = Math.max(4, Math.round(capacity * 0.34));
  const animatedUsedStorage = useAnimatedNumber(usedStorage, 700);
  const animatedAvailable = useAnimatedNumber(Math.max(0, capacity - usedStorage), 760);
  const animatedDbIncrease = useAnimatedNumber(Math.max(0, problemDb - baseProblemDb), 760);
  const animatedStorageIncrease = useAnimatedNumber(Math.max(0, capacity - baseStorage), 760);
  const capacityPercent = percentage(capacity, storageMax);
  const usedPercent = capacity > 0 ? Math.min(86, Math.round((usedStorage / capacity) * 100)) : 0;
  const visibleCards = Math.min(8, Math.max(4, Math.ceil(problemDb / (plan === "basic" ? 3600 : 42000))));
  const problemCards = [
    ["중2 함수 활용", "수학", "중", "검토 완료", true],
    ["고1 내신 독해", "영어", "상", "세트 가능", false],
    ["기하 닮음", "수학", "중", "검토 필요", true],
    ["문법 빈칸", "영어", "하", "태깅 완료", false],
    ["확률 심화", "수학", "상", "세트 가능", false],
    ["독서 추론", "국어", "최상", "검토 완료", true],
    ["좌표평면 응용", "수학", "상", "신규 저장", false],
    ["비문학 자료 해석", "국어", "중", "신규 저장", true],
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_56px_rgba(0,0,0,0.34)] backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">문항 브라우저</h3>
            <p className="mt-1 text-sm text-slate-400">{formatNumber(animatedDb)}개 문항 · {formatStorageLabel(animatedCapacity)} 파일 저장소</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-[7px] border border-zinc-200/25 bg-zinc-200/[0.10] px-3 py-2 text-xs font-black text-zinc-100">
              +{formatStorageLabel(animatedStorageIncrease)} 확보
            </span>
            <MockButton icon={UploadCloud} label="PDF 업로드" active />
          </div>
        </div>

        <StorageQuotaStrip
          capacity={animatedCapacity}
          usedStorage={animatedUsedStorage}
          availableStorage={animatedAvailable}
          storageIncrease={animatedStorageIncrease}
          dbIncrease={animatedDbIncrease}
          capacityPercent={capacityPercent}
          usedPercent={usedPercent}
          baseStorage={baseStorage}
          problemDb={animatedDb}
        />

        <div className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3">
          <Search className="h-4 w-4 text-zinc-300" />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-500">문항 검색</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
          <StorageFilter label="과목" values={["수학", "영어", "국어"]} activeIndex={capacity >= 50 ? 1 : 0} />
          <StorageFilter label="난이도" values={["하", "중", "상", "최상"]} activeIndex={capacity >= 100 ? 2 : 1} />
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">단원</label>
            <div className="flex h-10 items-center rounded-md border border-white/10 bg-card/50 px-3 text-sm text-slate-500">단원 검색</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <StorageFilter label="문항 유형" values={["객관식", "서술형", "응용", "답안 포함"]} activeIndex={capacity >= 50 ? 3 : 1} wide />
          <label className="flex h-12 items-center justify-between gap-4 rounded-md border border-white/10 bg-card/70 p-3 text-sm text-slate-200 xl:self-end">
            검토 필요만 보기
            <span className="h-4 w-4 rounded border border-primary bg-primary/80 shadow-[0_0_18px_rgba(124,58,237,0.25)]" />
          </label>
        </div>

        <div className="space-y-4">
          <div className="relative grid select-none gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {problemCards.map(([title, subject, difficulty, state, hasVisual], index) => {
              const enabled = index < visibleCards;
              return (
                <ArchiveProblemCard
                  key={String(title)}
                  title={String(title)}
                  subject={String(subject)}
                  difficulty={String(difficulty)}
                  state={String(state)}
                  hasVisual={Boolean(hasVisual)}
                  index={index}
                  enabled={enabled}
                  newlyStored={enabled && index >= Math.max(0, visibleCards - 2)}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <MockButton icon={ArrowLeft} label="이전" />
            <span className="text-sm text-slate-500">1 / {Math.max(1, Math.round(problemDb / 5000))}</span>
            <MockButton icon={ArrowRight} label="다음" />
          </div>

          <div className="mx-auto flex w-[min(92%,680px)] items-center justify-between gap-3 rounded-full border border-white/10 bg-card/95 px-4 py-3 shadow-[0_18px_45px_rgba(255,255,255,0.20)] backdrop-blur">
            <span className="text-sm font-medium text-white">문항 {Math.max(2, Math.round(visibleCards / 2))}개 선택됨</span>
            <div className="flex gap-2">
              <MockButton icon={FolderKanban} label="세트에 추가" />
              <MockButton icon={FileText} label="바로 내보내기" active light />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StudentKeyConsoleSection({ plan, specs }: { plan: PaidPlanType; specs: ReturnType<typeof getResolvedSpecs> }) {
  const studentKeys = numericSpec(specs.studentKeys);
  const keyMax = plan === "basic" ? 10 : 100;
  const animatedKeys = useAnimatedNumber(studentKeys, 760);
  const activeRows = Math.min(8, Math.max(3, Math.ceil(studentKeys / (plan === "basic" ? 4 : 20))));
  const [previousRows, setPreviousRows] = useState(activeRows);

  useEffect(() => {
    if (previousRows === activeRows) return;
    const timeout = window.setTimeout(() => setPreviousRows(activeRows), 980);
    return () => window.clearTimeout(timeout);
  }, [activeRows, previousRows]);

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-zinc-300/18 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.22),rgba(8,10,16,0.72)_48%)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-200">Academy Operations</p>
            <h3 className="mt-1 text-xl font-black tracking-normal text-white">학생 좌석, 과제, 클래스 운영</h3>
            <p className="mt-2 max-w-xl text-xs leading-5 text-slate-400">좌석은 학원이 소유하는 재사용 가능한 접근 단위이고, 초대 코드는 학생이 좌석을 claim하는 자격 증명입니다.</p>
          </div>
          <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-[7px] bg-zinc-500 px-3 text-xs font-black text-white shadow-[0_10px_28px_rgba(124,58,237,0.28)]">
            <PlusGlyph /> 좌석 추가
          </button>
        </div>
      </div>

      <div className="rounded-[12px] border border-zinc-300/20 bg-zinc-400/[0.08] p-4 text-sm transition-all duration-700">
        <div className="text-zinc-100">좌석을 만들었습니다. 초대 코드는 지금 한 번만 전체 표시됩니다.</div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/35 px-3 py-2">
          <span className="truncate font-mono text-xs text-slate-100">TF-{plan.toUpperCase()}-{String(2000 + studentKeys * 19).slice(-4)}-{String(8471 + studentKeys * 13).slice(-4)}</span>
          <MockButton icon={ClipboardCheck} label="복사" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ConsoleStat label="현재 플랜" value={PLANS[plan].name} icon={PackageCheck} />
        <ConsoleStat label="포함 좌석" value={formatNumber(animatedKeys)} icon={KeyRound} tone="violet" />
        <ConsoleStat label="활성 좌석" value={formatNumber(Math.round(animatedKeys * 0.72))} icon={Users} />
        <ConsoleStat label="배정 좌석" value={formatNumber(Math.round(animatedKeys * 0.48))} icon={School} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-black text-white"><KeyRound className="h-4 w-4" /> 좌석 / 키 관리</p>
            <span className="rounded-[6px] bg-zinc-200/[0.12] px-2.5 py-1 text-xs font-black text-zinc-100">auto-provision</span>
          </div>
          <div className="grid gap-2">
            {Array.from({ length: 8 }).map((_, index) => {
              const enabled = index < activeRows;
              const newlyEnabled = previousRows < activeRows && index >= previousRows && enabled;
              const assigned = enabled && index % 3 !== 2;
              return (
                <div
                  key={index}
                  className={cn("grid gap-3 rounded-[10px] border px-3 py-3 transition-all duration-500 md:grid-cols-[1fr_auto] md:items-center", enabled ? "border-white/10 bg-white/[0.035] opacity-100" : "border-white/5 bg-white/[0.02] opacity-30", newlyEnabled && "border-zinc-200/[0.45] bg-zinc-200/10 shadow-[0_0_24px_rgba(34,211,238,0.16)]")}
                  style={{ transform: enabled ? "translateY(0)" : "translateY(8px)", transitionDelay: `${index * 70}ms` }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">Seat {String(index + 1).padStart(2, "0")}</span>
                      <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-black", assigned ? "bg-zinc-200 text-slate-950" : "bg-white/[0.08] text-slate-300")}>{assigned ? "배정됨" : "미배정"}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">코드 미리보기: ****{String(8471 + index * 137).slice(-4)} · 학생: {assigned ? `student_${index + 1}` : "-"}</p>
                  </div>
                  <div className="flex gap-2">
                    <SeatAction icon={RefreshCcw} label="코드 회전" />
                    <SeatAction icon={UserMinus} label="해제" muted={!assigned} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="flex items-center gap-2 text-sm font-black text-white"><Landmark className="h-4 w-4" /> 클래스 / 과제 빠른 생성</p>
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-md border border-white/10 bg-card/50 px-3 text-sm text-slate-500">예: 고1 내신반</div>
              <MockButton icon={Check} label="생성" active />
            </div>
            <div className="grid gap-2">
              {["중2 심화반", "고1 내신반"].map((name, index) => (
                <div key={name} className="rounded-[8px] border border-white/10 px-3 py-2 text-sm text-slate-200 transition-all duration-700" style={{ transitionDelay: `${index * 80}ms` }}>{name}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-md border border-white/10 bg-card/50 px-3 text-sm text-slate-500">과제 제목</div>
              <MockButton icon={ClipboardCheck} label="과제" />
            </div>
            <div className="rounded-[8px] border border-white/10 px-3 py-2 text-sm text-slate-200">일차함수 오답 세트</div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs font-bold text-slate-500">
                <span>Student key capacity</span>
                <span>{formatNumber(studentKeys)} / {formatNumber(keyMax)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-zinc-300 to-zinc-300 transition-[width] duration-700 ease-out" style={{ width: `${percentage(studentKeys, keyMax)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingConsoleSection({ monthlyPrice }: { billingCycle: BillingCycle; monthlyPrice: number }) {
  const animatedMonthly = useAnimatedNumber(monthlyPrice, 720);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ConsoleStat label="오늘 결제" value="0원" icon={CreditCard} tone="violet" />
        <ConsoleStat label="첫 결제" value={formatKRW(Math.round(animatedMonthly))} icon={Gauge} />
        <ConsoleStat label="결제 방식" value="자동결제" icon={PackageCheck} />
        <ConsoleStat label="주기" value="Monthly" icon={ClipboardCheck} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-bold text-slate-400">Billing cycle</p>
          <div className="mt-4 rounded-[8px] border border-white/10 bg-black/20 p-1.5">
            <div className="rounded-[6px] bg-white px-3 py-2 text-center text-xs font-black text-slate-950 shadow-lg">Monthly</div>
          </div>
          <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-bold text-slate-500">현재 구독 상태</p>
            <p className="mt-1 text-3xl font-black text-white">{formatKRW(Math.round(animatedMonthly))}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">월간 결제가 billing 영역에 반영되었습니다.</p>
          </div>
        </div>

        <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-white">Invoice preview</p>
            <span className="rounded-[6px] bg-white/[0.06] px-2.5 py-1 text-xs font-black text-slate-400">Monthly billing</span>
          </div>
          <div className="mt-4 grid gap-2">
            <InvoiceRow label="Payment method" value="Card ending 2048" />
            <InvoiceRow label="Billing period" value="1 month" />
            <InvoiceRow label="Monthly amount" value={formatKRW(Math.round(animatedMonthly))} highlighted />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryConsoleSection({
  plan,
  specs,
  selectedPackageIds,
  billingCycle,
  monthlyPrice,
}: {
  plan: PaidPlanType;
  specs: ReturnType<typeof getResolvedSpecs>;
  selectedPackageIds: Record<PackageGroup, string>;
  billingCycle: BillingCycle;
  monthlyPrice: number;
}) {
  const animatedAi = useAnimatedNumber(numericSpec(specs.monthlyAiCredits), 700);
  const animatedStorage = useAnimatedNumber(numericSpec(specs.fileStorageGb), 700);
  const animatedKeys = useAnimatedNumber(numericSpec(specs.studentKeys), 700);
  const animatedStaffSeats = useAnimatedNumber(numericSpec(specs.staffSeats), 700);
  const animatedPrice = useAnimatedNumber(monthlyPrice, 700);

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-slate-400">Checkout review</p>
            <p className="mt-1 text-3xl font-black text-white">{formatKRW(Math.round(animatedPrice))} / 월</p>
          </div>
          <span className="rounded-[6px] bg-zinc-200/[0.12] px-2.5 py-1 text-xs font-black text-zinc-100">Monthly</span>
        </div>
        <div className="mt-5 rounded-[8px] border border-zinc-200/20 bg-zinc-200/10 p-3 text-xs font-bold leading-5 text-zinc-100">
          결제 전 마지막 단계에서 선택한 Basic Plan 옵션이 한 번 더 정리됩니다.
        </div>
      </div>

      <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <p className="text-sm font-black text-white">{PLANS[plan].name}</p>
          <span className="rounded-[6px] bg-white/[0.07] px-2.5 py-1 text-xs font-black text-slate-300">구성 요약</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SummaryConsoleItem label="AI Pack" value={selectedOptionName(plan, selectedPackageIds, "ai")} detail={`${formatNumber(animatedAi)} credits`} />
          <SummaryConsoleItem label="Storage Pack" value={selectedOptionName(plan, selectedPackageIds, "storage")} detail={`${formatStorageLabel(animatedStorage)} storage`} />
          <SummaryConsoleItem label="Student Pack" value={selectedOptionName(plan, selectedPackageIds, "student")} detail={`${formatNumber(animatedKeys)} keys`} />
          <SummaryConsoleItem label="Staff Pack" value={selectedOptionName(plan, selectedPackageIds, "staff")} detail={`${formatNumber(animatedStaffSeats)} seats`} />
          <SummaryConsoleItem label="Billing" value="Monthly billing" detail="monthly renewal" />
        </div>
      </div>
    </div>
  );
}

function FullPlanSummarySection({
  plan,
  specs,
  selectedPackageIds,
  selectedSubjectEngines,
  billingCycle,
  monthlyPrice,
  reviewHref,
}: {
  plan: PaidPlanType;
  specs: ReturnType<typeof getResolvedSpecs>;
  selectedPackageIds: Record<PackageGroup, string>;
  selectedSubjectEngines: SubjectEngineCode[];
  billingCycle: BillingCycle;
  monthlyPrice: number;
  reviewHref: string;
}) {
  const planConfig = PLANS[plan];
  const displayPrice = monthlyPrice;
  const singleEngineMonthlyPrice = calculateSingleEngineMonthlyPrice(plan, selectedPackageIds);
  const subjectEngineDelta = calculateSubjectEngineMonthlyDelta(singleEngineMonthlyPrice, selectedSubjectEngines);

  return (
    <section id="summary" data-plan-summary className="relative z-20 min-h-screen bg-transparent px-4 py-24 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-[92rem]">
        <div className="max-w-3xl">
          <p data-plan-summary-kicker className="text-xs font-black uppercase tracking-[0.18em] text-zinc-200">Summary</p>
          <h2 className="mt-3 text-4xl font-black tracking-normal text-white sm:text-5xl">구성 요약</h2>
          <p className="mt-4 text-base leading-7 text-slate-400">콘솔 데모를 벗어나 결제 전 마지막 구성만 넓게 다시 확인합니다.</p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
          <div data-plan-summary-card className="rounded-[12px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-400">{planConfig.name}</p>
                <p className="mt-2 text-4xl font-black text-white">{formatKRW(displayPrice)} / 월</p>
              </div>
              <span data-plan-cycle-badge className="w-fit rounded-[7px] bg-zinc-200 px-3 py-1.5 text-xs font-black text-slate-950">Monthly</span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <SummaryConsoleItem
                label="Subject Engine"
                value={selectedSubjectEngines.map(subjectEngineLabel).join(" + ")}
                detail={selectedSubjectEngines.length > 1 ? `+${formatKRW(subjectEngineDelta)} / 월 · 가격 x${selectedSubjectEngines.length}` : "기본 포함"}
              />
              {(Object.keys(PACKAGE_GROUPS[plan]) as PackageGroup[]).map((group) => {
                const option = PACKAGE_GROUPS[plan][group]?.find((item) => item.id === selectedPackageIds[group]);
                if (!option) return null;
                return <SummaryConsoleItem key={group} label={PACKAGE_LABELS[group]} value={option.name} detail={option.description} />;
              })}
            </div>

            <div className="mt-6 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              <SummaryLine>월 AI {specs.monthlyAiCredits.toLocaleString()} credits</SummaryLine>
              <SummaryLine>문제 DB {Number(specs.problemDb).toLocaleString()}문항 · 저장공간 {Number(specs.fileStorageGb) >= 1024 ? "1TB" : `${specs.fileStorageGb}GB`}</SummaryLine>
              <SummaryLine>학생 키 {specs.studentKeys.toLocaleString()}개</SummaryLine>
              <SummaryLine>강사 좌석 {Number(specs.staffSeats).toLocaleString()}명</SummaryLine>
              <SummaryLine>PDF 추출은 클라우드에서 처리되며 AI credits를 사용합니다.</SummaryLine>
              {plan === "basic" ? (
                <>
                  <SummaryLine>마켓플레이스는 Pro에서 사용 가능</SummaryLine>
                </>
              ) : (
                <SummaryLine>마켓플레이스 포함</SummaryLine>
              )}
            </div>
          </div>

          <aside data-plan-checkout className="rounded-[12px] border border-zinc-200/18 bg-zinc-200/[0.08] p-6 shadow-[0_24px_80px_rgba(8,145,178,0.10)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-100">Checkout</p>
            <h3 className="mt-3 text-2xl font-black text-white">마지막 확인</h3>
            <div className="mt-6 space-y-3 text-sm">
              <InvoiceRow label="Subject engines" value={selectedSubjectEngines.map(subjectEngineLabel).join(" + ")} highlighted />
              <InvoiceRow label="Billing cycle" value="Monthly billing" highlighted />
              <InvoiceRow label="Monthly equivalent" value={formatKRW(displayPrice)} />
              <InvoiceRow label="Today" value={formatKRW(monthlyPrice)} highlighted />
            </div>
            <Link href={reviewHref} data-plan-checkout-link className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-zinc-200 text-sm font-black text-slate-950 transition hover:bg-white">
              구성 확인하기 <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-center text-xs text-slate-500">결제 전 마지막 단계에서 구성을 다시 확인할 수 있습니다.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function StorageQuotaStrip({
  capacity,
  usedStorage,
  availableStorage,
  storageIncrease,
  dbIncrease,
  capacityPercent,
  usedPercent,
  baseStorage,
  problemDb,
}: {
  capacity: number;
  usedStorage: number;
  availableStorage: number;
  storageIncrease: number;
  dbIncrease: number;
  capacityPercent: number;
  usedPercent: number;
  baseStorage: number;
  problemDb: number;
}) {
  return (
    <div className="grid gap-3 rounded-[10px] border border-zinc-200/18 bg-[linear-gradient(135deg,rgba(34,211,238,0.10),rgba(124,58,237,0.07)_44%,rgba(255,255,255,0.035))] p-3 shadow-[0_20px_60px_rgba(8,145,178,0.13)] xl:grid-cols-[0.92fr_1.08fr]">
      <div className="rounded-[8px] border border-white/10 bg-black/25 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-100">Storage Pack applied</p>
            <p className="mt-1 text-2xl font-black text-white">{formatStorageLabel(capacity)}</p>
          </div>
          <span className="rounded-[6px] bg-zinc-200 text-slate-950 px-2 py-1 text-[11px] font-black">
            +{formatStorageLabel(storageIncrease || Math.max(0, capacity - baseStorage))}
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1.5 flex justify-between text-xs font-bold text-slate-500">
              <span>업로드/원본 PDF 저장소</span>
              <span>{formatStorageLabel(usedStorage)} used</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-slate-300/70 transition-[width] duration-700 ease-out" style={{ width: `${usedPercent}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs font-bold text-slate-500">
              <span>새로 확보된 여유 공간</span>
              <span>{formatStorageLabel(availableStorage)} available</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-zinc-300 via-zinc-300 to-zinc-300 transition-[width] duration-700 ease-out" style={{ width: `${capacityPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-bold text-slate-500">문항 DB 상한</p>
          <p className="mt-1 text-xl font-black text-white">{formatNumber(problemDb)}</p>
          <p className="mt-1 text-[11px] font-bold text-zinc-100">+{formatNumber(dbIncrease)} rows</p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-bold text-slate-500">PDF source</p>
          <p className="mt-1 text-xl font-black text-white">{formatStorageLabel(capacity * 0.18)}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-500">encrypted</p>
        </div>
        <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-bold text-slate-500">Rendered output</p>
          <p className="mt-1 text-xl font-black text-white">{formatStorageLabel(capacity * 0.1)}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-500">cached</p>
        </div>
      </div>
    </div>
  );
}

function ArchiveProblemCard({
  title,
  subject,
  difficulty,
  state,
  hasVisual,
  index,
  enabled,
  newlyStored,
}: {
  title: string;
  subject: string;
  difficulty: string;
  state: string;
  hasVisual: boolean;
  index: number;
  enabled: boolean;
  newlyStored: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border bg-white/[0.04] p-4 transition-all duration-700 hover:-translate-y-0.5",
        enabled ? "border-white/10 opacity-100 shadow-[0_18px_45px_rgba(255,255,255,0.10)]" : "border-white/5 opacity-28",
        newlyStored && "ring-1 ring-zinc-200/25 shadow-[0_0_26px_rgba(34,211,238,0.12)]"
      )}
      style={{ transform: enabled ? "translateY(0)" : "translateY(12px)", transitionDelay: `${index * 70}ms` }}
    >
      {newlyStored && <span className="absolute right-3 top-3 rounded-[6px] bg-zinc-200 px-2 py-0.5 text-[10px] font-black text-slate-950">저장됨</span>}
      <div className="mb-3 flex items-start justify-between gap-2 pr-12">
        <div className="truncate font-semibold text-white">{title}</div>
        <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-black", state === "검토 필요" ? "bg-zinc-300/12 text-zinc-100" : state === "신규 저장" ? "bg-zinc-300/12 text-zinc-100" : "bg-zinc-300/12 text-zinc-100")}>{state}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-[6px] border border-white/10 bg-white/[0.055] px-2 py-0.5 text-[11px] font-bold text-slate-300">{subject}</span>
        <span className="rounded-[6px] border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[11px] font-bold text-slate-400">난이도 {difficulty}</span>
      </div>
      {hasVisual && (
        <div className="mb-3 h-20 overflow-hidden rounded-md border border-white/10 bg-[linear-gradient(135deg,rgba(124,58,237,0.20),rgba(15,23,42,0.70)_52%,rgba(34,211,238,0.12))]">
          <div className="grid h-full grid-cols-3 gap-2 p-2">
            <span className="rounded bg-white/10" />
            <span className="rounded bg-white/[0.06]" />
            <span className="rounded bg-white/10" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <span className="block h-2 rounded-full bg-white/10" />
        <span className="block h-2 w-5/6 rounded-full bg-white/10" />
        <span className="block h-2 w-2/3 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function StorageFilter({ label, values, activeIndex, wide = false }: { label: string; values: string[]; activeIndex: number; wide?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-200">{label}</label>
      <div className={cn("flex flex-wrap gap-2 overflow-hidden rounded-md border border-white/10 bg-card/50 p-2", wide ? "min-h-12" : "min-h-10")}>
        {values.map((value, index) => {
          const active = index <= activeIndex;
          return (
            <span
              key={value}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-all duration-700",
                active ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(124,58,237,0.18)]" : "border-white/10 bg-card/70 text-slate-400"
              )}
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              {value}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ConsoleMiniCard({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" }) {
  return (
    <div className={cn("rounded-[8px] border p-4", tone === "cyan" ? "border-zinc-200/[0.16] bg-zinc-200/[0.08]" : "border-zinc-200/[0.16] bg-zinc-200/[0.08]")}>
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function ConsoleHero({ title, body, activeLabel, secondaryLabel }: { title: string; body: string; activeLabel: string; secondaryLabel: string }) {
  const flow = [
    { label: "PDF 업로드", detail: "원자료", icon: UploadCloud },
    { label: "문항 추출", detail: "AI parse", icon: Sparkles },
    { label: "검토", detail: "review", icon: FileCheck2 },
    { label: "태깅", detail: "정제", icon: TagsGlyph },
    { label: "세트 생성", detail: "조립", icon: PackageCheck },
  ];

  return (
    <section className="overflow-hidden rounded-[12px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(15,23,42,0.74)_46%,rgba(88,28,135,0.34)_100%)] shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
      <div className="grid gap-5 p-4 xl:grid-cols-[1.05fr_1fr]">
        <div className="flex min-w-0 flex-col justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[7px] border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300 shadow-sm">
              Tena Forge Console
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-normal text-white">{title}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MockButton icon={UploadCloud} label={activeLabel} active />
            <MockButton icon={FileCheck2} label={secondaryLabel} />
          </div>
        </div>

        <div className="rounded-[10px] border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <div className="text-xs font-bold text-white">Production Pipeline</div>
              <div className="mt-0.5 text-[11px] text-slate-400">원자료에서 완성본까지</div>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-300" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {flow.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="relative min-h-[78px] rounded-[8px] border border-white/10 bg-white/[0.045] px-2 py-2 transition-all duration-700" style={{ transitionDelay: `${index * 75}ms` }}>
                  <div className="flex items-center justify-between">
                    <Icon className="h-4 w-4 text-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="mt-2 text-[11px] font-bold leading-tight text-white">{step.label}</div>
                  <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{step.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function AcademyStat({ label, value, icon: Icon, detail, tone = "neutral" }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; detail: string; tone?: "neutral" | "violet" | "warning" }) {
  return (
    <div className="group overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.28)] transition-all duration-500">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span className="truncate font-bold">{label}</span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[7px] border",
            tone === "neutral" && "border-white/10 bg-white/[0.08] text-slate-200",
            tone === "violet" && "border-zinc-400/30 bg-zinc-400/[0.18] text-zinc-100",
            tone === "warning" && "border-zinc-400/25 bg-zinc-400/10 text-zinc-200"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 truncate text-3xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-2 truncate text-xs font-medium text-slate-400">{detail}</div>
    </div>
  );
}

function ConsoleNextAction({ reviewCount, untaggedCount, actionLabel }: { reviewCount: number; untaggedCount: number; actionLabel: string }) {
  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="rounded-[10px] border border-white/10 bg-black/45 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.34)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200">
              <Gauge className="h-3.5 w-3.5" />
              Next Action
            </div>
            <h3 className="mt-2 text-base font-bold leading-6 [word-break:keep-all]">검토가 필요한 문항 {reviewCount.toLocaleString("ko-KR")}개가 있습니다.</h3>
            <p className="mt-1 text-sm leading-6 text-slate-300 [word-break:keep-all]">검토를 끝내면 태깅과 문제 세트 조립 단계가 더 정확해집니다.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <MockButton icon={ArrowRight} label={actionLabel} active light />
            <MockButton icon={Archive} label="최근 배치 보기" />
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-zinc-300" />
          Refinement Queue
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-white">{untaggedCount.toLocaleString("ko-KR")}</div>
            <div className="mt-1 text-sm text-slate-400">태깅 대기 문항</div>
          </div>
          <CheckCircle2 className="h-7 w-7 text-slate-600" />
        </div>
      </div>
    </section>
  );
}

function MockButton({ icon: Icon, label, active = false, light = false }: { icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean; light?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-500",
        active && light && "border-white/20 bg-white text-slate-950 hover:bg-slate-100",
        active && !light && "border-zinc-400/40 bg-primary text-primary-foreground shadow-[0_10px_28px_rgba(124,58,237,0.28)]",
        !active && "border-white/12 bg-white/[0.04] text-slate-100 hover:border-white/20 hover:bg-white/[0.08]"
      )}
      style={{ transform: active ? "translateY(-1px)" : "translateY(0)" }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

function ConsoleBatchRow({ file, status, count, stage, index }: { file: string; status: string; count: number; stage: string; index: number }) {
  return (
    <div className={cn("grid grid-cols-[1.1fr_0.75fr_0.7fr_0.85fr] items-center gap-3 border-t border-white/10 px-3 py-2.5 text-xs first:border-t-0", index % 2 === 0 ? "bg-white/[0.025]" : "bg-transparent")}>
      <span className="truncate font-black text-slate-100">{file}</span>
      <span className={cn("w-fit rounded-[6px] px-2 py-0.5 font-black", status === "done" ? "bg-zinc-300/12 text-zinc-100" : status === "needs_review" ? "bg-zinc-300/12 text-zinc-100" : "bg-zinc-300/12 text-zinc-100")}>{status}</span>
      <span className="font-semibold text-slate-500">{count.toLocaleString("ko-KR")}문항</span>
      <span className="truncate font-bold text-zinc-100">{stage}</span>
    </div>
  );
}

function TagsGlyph({ className }: { className?: string }) {
  return <Tags className={className} />;
}

function ConsoleStat({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone?: "neutral" | "violet" }) {
  return (
    <div className={cn("rounded-[10px] border p-3", tone === "violet" ? "border-zinc-300/20 bg-zinc-300/[0.08]" : "border-white/10 bg-black/30")}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-bold text-slate-500">{label}</p>
        <Icon className={cn("h-4 w-4 shrink-0", tone === "violet" ? "text-zinc-100" : "text-slate-500")} />
      </div>
      <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}

function ConsoleTableRow({ columns, index }: { columns: string[]; index: number }) {
  return (
    <div className={cn("grid items-center gap-3 border-t border-white/10 px-3 py-2.5 text-xs first:border-t-0", columns.length === 4 ? "grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr]" : "grid-cols-[1fr_0.7fr_0.7fr]", index % 2 === 0 ? "bg-white/[0.025]" : "bg-transparent")}>
      {columns.map((column, columnIndex) => (
        <span key={`${column}-${columnIndex}`} className={cn("truncate", columnIndex === 0 ? "font-black text-slate-100" : columnIndex === columns.length - 1 ? "font-bold text-zinc-100" : "font-semibold text-slate-500")}>
          {column}
        </span>
      ))}
    </div>
  );
}

function SeatAction({ icon: Icon, label, muted = false }: { icon: React.ComponentType<{ className?: string }>; label: string; muted?: boolean }) {
  return (
    <span className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border px-2 text-[11px] font-bold", muted ? "border-white/5 text-slate-600" : "border-white/10 bg-white/[0.04] text-slate-300")}>
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function PlusGlyph() {
  return (
    <span className="relative h-3.5 w-3.5">
      <span className="absolute left-0 top-1/2 h-0.5 w-3.5 -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute left-1/2 top-0 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-current" />
    </span>
  );
}

function InvoiceRow({ label, value, highlighted = false, positive = false }: { label: string; value: string; highlighted?: boolean; positive?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between rounded-[7px] border px-3 py-2.5 text-sm transition-all duration-500", highlighted ? "border-zinc-200/30 bg-zinc-200/10" : "border-white/10 bg-black/[0.18]")}>
      <span className="font-bold text-slate-500">{label}</span>
      <span className={cn("font-black", positive ? "text-zinc-100" : "text-white")}>{value}</span>
    </div>
  );
}

function SummaryConsoleItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[7px] border border-white/10 bg-black/[0.18] px-3 py-3 transition-all duration-500">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-zinc-100">{detail}</p>
    </div>
  );
}

function useAnimatedNumber(value: number, duration = 720) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const startValue = previousValueRef.current;
    const delta = value - startValue;
    if (delta === 0) return;

    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + delta * eased);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previousValueRef.current = value;
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);

  return displayValue;
}

function numericSpec(value: number | "custom" | false) {
  return typeof value === "number" ? value : 0;
}

function percentage(value: number, max: number) {
  if (!max) return 0;
  return Math.max(8, Math.min(100, Math.round((value / max) * 100)));
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatStorageLabel(value: number) {
  if (value >= 1024) return `${Number((value / 1024).toFixed(value % 1024 === 0 ? 0 : 1)).toLocaleString("ko-KR")}TB`;
  return `${formatNumber(value)}GB`;
}

function selectedOptionName(plan: PaidPlanType, selectedPackageIds: Record<PackageGroup, string>, group: PackageGroup) {
  return PACKAGE_GROUPS[plan][group]?.find((item) => item.id === selectedPackageIds[group])?.name || "Included";
}

function LegacyProductStage({ scene, plan, specs }: { scene: any; plan: PaidPlanType; specs: ReturnType<typeof getResolvedSpecs> }) {
  return (
    <div className="relative min-h-[30rem] overflow-hidden rounded-[10px] border border-white/10 bg-[#101820]/90 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.36)] backdrop-blur-md sm:p-8 lg:h-full">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.075)_0%,rgba(15,23,42,0.62)_52%,rgba(8,145,178,0.16)_100%)]" />
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="rounded-[6px] bg-zinc-200 px-3 py-1 text-xs font-black text-slate-950">{PLANS[plan].name}</span>
          <span className="rounded-[6px] border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black text-slate-300">{scene}</span>
        </div>
        <div className="mt-8 transition-all duration-500 motion-reduce:transition-none">
          {scene === "overview" && <OverviewScene specs={specs} />}
          {scene === "ai" && <AiScene specs={specs} />}
          {scene === "storage" && <StorageScene specs={specs} />}
          {scene === "student" && <StudentScene specs={specs} />}
          {scene === "processing" && <ProcessingScene plan={plan} specs={specs} />}
          {scene === "marketplace" && <MarketplaceScene />}
        </div>
      </div>
    </div>
  );
}

function OverviewScene({ specs }: { specs: ReturnType<typeof getResolvedSpecs> }) {
  return (
    <div className="grid gap-4">
      <StageCard icon={UploadCloud} title="PDF Upload" value="source.pdf" />
      <Connector />
      <StageCard icon={Sparkles} title="AI Extraction" value={`${specs.monthlyAiCredits.toLocaleString()} credits`} />
      <Connector />
      <StageCard icon={Database} title="Question DB" value={`${specs.problemDb.toLocaleString()} questions`} />
      <Connector />
      <StageCard icon={School} title="Student Assignment" value={`${specs.studentKeys.toLocaleString()} keys`} />
    </div>
  );
}

function AiScene({ specs }: { specs: ReturnType<typeof getResolvedSpecs> }) {
  return (
    <div className="grid gap-4">
      <StageCard icon={FileText} title="AI extracting questions..." value={`${specs.monthlyAiCredits.toLocaleString()} monthly credits`} />
      <div className="grid gap-3 sm:grid-cols-2">
        {["단원", "난이도", "유형", "정답", "답안"].map((tag) => <span key={tag} className="rounded-[8px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white shadow-sm">{tag}</span>)}
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-2/3 rounded-full bg-zinc-400" />
      </div>
    </div>
  );
}

function StorageScene({ specs }: { specs: ReturnType<typeof getResolvedSpecs> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
      <div className="space-y-2">
        {["Algebra", "Geometry", "Reading", "Mock Exam"].map((folder) => <div key={folder} className="rounded-[8px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-white shadow-sm">{folder}</div>)}
      </div>
      <div className="rounded-[10px] border border-white/10 bg-white/[0.06] p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {["단원", "난이도", "유형"].map((filter) => <span key={filter} className="rounded-[6px] bg-white/[0.08] px-3 py-1 text-xs font-black text-slate-200">{filter}</span>)}
        </div>
        <div className="mt-8 text-4xl font-black text-white">{specs.problemDb.toLocaleString()}</div>
        <p className="mt-1 text-sm font-bold text-slate-400">문항 DB · 저장공간 {Number(specs.fileStorageGb) >= 1024 ? "1TB" : `${specs.fileStorageGb}GB`}</p>
      </div>
    </div>
  );
}

function StudentScene({ specs }: { specs: ReturnType<typeof getResolvedSpecs> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[10px] border border-white/10 bg-white/[0.06] p-5 shadow-sm">
        <Users className="h-5 w-5" />
        <h3 className="mt-5 text-xl font-black">Assign to students</h3>
        <p className="mt-2 text-sm font-semibold text-slate-400">Teacher selects problem set → Student app receives task.</p>
      </div>
      <div className="rounded-[14px] border border-white/10 bg-black/35 p-3 text-white shadow-xl">
        <div className="rounded-[10px] border border-white/10 bg-white/[0.06] p-4 text-white">
          <p className="text-xs font-black text-zinc-100">학생 앱</p>
          <p className="mt-5 text-3xl font-black">{specs.studentKeys.toLocaleString()}</p>
          <p className="text-sm font-bold text-slate-400">student keys</p>
        </div>
      </div>
    </div>
  );
}

function ProcessingScene({ plan, specs }: { plan: PaidPlanType; specs: ReturnType<typeof getResolvedSpecs> }) {
  const jobs = plan === "basic" ? 1 : Number(specs.concurrentPdfExtractions || 1);
  return (
    <div>
      <StageCard icon={Gauge} title={plan === "basic" ? "Pro에서 확장 가능" : `${jobs} concurrent PDF extraction jobs`} value={`${specs.processingSpeed} processing`} />
      <div className="mt-5 grid gap-3">
        {Array.from({ length: Math.min(jobs, 5) }).map((_, index) => (
          <div key={index} className="rounded-[8px] border border-white/10 bg-white/[0.06] p-4 shadow-sm">
            <div className="flex justify-between text-sm font-black"><span>PDF Queue {index + 1}</span><span>AI credits 사용</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-zinc-400" style={{ width: `${50 + index * 8}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketplaceScene() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {["저작권 자료 전산화", "문제 세트 listing", "템플릿 listing", "문항 공모"].map((title) => (
        <div key={title} className="rounded-[10px] border border-white/10 bg-white/[0.06] p-5 shadow-sm">
          <Store className="h-5 w-5" />
          <h3 className="mt-5 font-black">{title}</h3>
          <p className="mt-2 text-xs font-bold text-slate-400">권리를 보유한 자료만 등록하세요.</p>
        </div>
      ))}
    </div>
  );
}

function StageCard({ icon: Icon, title, value }: { icon: React.ComponentType<{ className?: string }>; title: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.06] p-5 shadow-sm">
      <Icon className="h-5 w-5" />
      <p className="mt-4 text-sm font-bold text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Connector() {
  return <div className="mx-8 h-6 w-px bg-white/20" />;
}

function SpecPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-bold text-slate-300">
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

function SummaryLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-200" />
      <span>{children}</span>
    </div>
  );
}
