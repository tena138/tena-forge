"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Archive,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileUp,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  PanelLeftClose,
  UserCircle,
  Users,
} from "lucide-react";

import { PLANS, formatKRW } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";
import { SiteLogo } from "@/components/site-logo";

type IconComponent = ComponentType<{ className?: string }>;

const workflowSteps: Array<{ title: string; body: string; href: string; icon: IconComponent }> = [
  { title: "추출", body: "PDF를 문항 단위로 분리", href: "/upload", icon: FileUp },
  { title: "검토", body: "원본과 해설을 빠르게 확인", href: "/problems/review", icon: ClipboardCheck },
  { title: "보관", body: "태그와 출처로 문항 정리", href: "/problems", icon: Archive },
  { title: "세트", body: "시험지와 과제 세트 제작", href: "/problem-sets", icon: FolderKanban },
  { title: "학생", body: "채점 결과와 오답 기록 연결", href: "/student-management", icon: Users },
];

const planCards = [
  {
    name: "Free",
    price: "무료",
    href: "/register?plan=free",
    cta: "무료로 시작하기",
    points: ["기본 체험", "문항 추출 테스트", "시험지 제작"],
  },
  {
    name: "Basic",
    price: `${formatKRW(PLANS.basic.baseMonthlyPrice)} / 월`,
    href: "/plan/basic",
    cta: "Basic",
    points: ["학생 키 3명", "소규모 수업", "표준 처리"],
    featured: true,
  },
  {
    name: "Pro",
    price: `${formatKRW(PLANS.pro.baseMonthlyPrice)} / 월`,
    href: "/plan/pro",
    cta: "Pro",
    points: ["학생 키 10명", "동시 추출", "빠른 처리"],
  },
];

export function PlanLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--landing-bg-base)] text-[var(--landing-text-primary)]">
      <LandingNav />

      <section className="relative min-h-screen overflow-hidden pt-16">
        <AuroraBackdrop />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[104rem] flex-col justify-center px-4 py-8 sm:px-6 lg:py-10 xl:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(21rem,0.55fr)_minmax(0,1.45fr)] lg:items-center">
            <div className="max-w-[34rem]">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200/80">TENA FORGE</p>
              <h1 className="landing-hero-title landing-keep-words mt-4 text-white">
                <span className="block">문제를 꺼내고,</span>
                <span className="block">수업으로 보낸다.</span>
              </h1>
              <p className="landing-keep-words mt-5 max-w-[31rem] text-lg leading-8 text-[var(--landing-text-secondary)]">
                PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/register?plan=free"
                  className="landing-motion-safe inline-flex h-12 items-center gap-2 rounded-[8px] bg-[var(--landing-accent)] px-6 text-sm font-black text-white shadow-[0_18px_42px_rgba(124,92,255,0.36)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--landing-accent-hover)] hover:shadow-[0_22px_54px_rgba(124,92,255,0.44)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/35 active:scale-[0.98]"
                >
                  무료로 시작하기 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login?redirect=/academy"
                  className="text-sm font-black text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25"
                >
                  로그인
                </Link>
              </div>
            </div>

            <ProductPreview />
          </div>

          <WorkflowSection />
        </div>
      </section>

      <PlanSection />
    </main>
  );
}

function LandingNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.08] bg-[rgba(10,10,15,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[104rem] items-center justify-between px-4 sm:px-6 xl:px-8">
        <Link href="/" className="inline-flex min-w-0 items-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25" aria-label="Tena Forge">
          <img src="/tenaforgelogo-dark.png" alt="Tena Forge" className="h-9 w-auto max-w-[8.75rem] object-contain sm:max-w-none" />
        </Link>
        <div className="flex items-center gap-2 text-sm font-black">
          <a href="#plans" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25 sm:inline-flex">플랜</a>
          <Link href="/login?redirect=/academy" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25 sm:inline-flex">로그인</Link>
          <Link href="/register?plan=free" className="landing-motion-safe inline-flex h-9 items-center rounded-[7px] bg-[var(--landing-accent)] px-4 text-white transition hover:-translate-y-0.5 hover:bg-[var(--landing-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/35 active:scale-[0.98]">무료로 시작하기</Link>
        </div>
      </div>
    </nav>
  );
}

function AuroraBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--landing-bg-deep)_0%,var(--landing-bg-base)_54%,#07070b_100%)]" />
      <div className="landing-aurora bg-[radial-gradient(ellipse_at_26%_18%,rgba(124,92,255,0.38),transparent_42%),radial-gradient(ellipse_at_70%_24%,rgba(139,107,255,0.26),transparent_38%),linear-gradient(116deg,transparent_0_22%,rgba(124,92,255,0.30)_38%,transparent_62%)] [animation:landingAuroraA_22s_ease-in-out_infinite_alternate]" />
      <div className="landing-aurora opacity-45 mix-blend-screen bg-[radial-gradient(ellipse_at_56%_36%,rgba(45,212,191,0.07),transparent_34%),linear-gradient(128deg,transparent_0_38%,rgba(167,139,250,0.22)_56%,transparent_78%)] [animation:landingAuroraB_30s_ease-in-out_infinite_alternate]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,10,15,0.05)_0%,rgba(10,10,15,0.42)_54%,rgba(10,10,15,0.96)_100%)]" />
      <div className="absolute inset-x-0 top-16 h-px bg-white/10" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-[linear-gradient(180deg,transparent,var(--landing-bg-base)_82%)]" />
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="landing-mock-perspective relative min-h-[32rem] lg:min-h-[42rem]">
      <div className="absolute right-[-1rem] top-1/2 h-[26rem] w-[46rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.36),transparent_68%)] blur-3xl" />
      <div className="landing-mock-frame absolute right-0 top-1/2 w-full max-w-[74rem] -translate-y-1/2 rounded-2xl border border-white/[0.09] bg-[#07080d] shadow-[0_38px_140px_rgba(0,0,0,0.56),0_0_90px_rgba(124,92,255,0.18)] backdrop-blur-md">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_18%_4%,rgba(124,92,255,0.18),transparent_20rem),radial-gradient(circle_at_92%_16%,rgba(139,107,255,0.12),transparent_22rem),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(7,8,13,0.94)_44%,rgba(8,10,16,0.98))]" />
        <div className="relative z-10 overflow-hidden rounded-2xl">
          <div className="flex h-14 items-center justify-between border-b border-white/10 bg-black/55 px-4 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <SiteLogo className="h-9 sm:h-9" />
              <button type="button" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-slate-400 lg:inline-flex" aria-label="사이드바 닫기">
                <PanelLeftClose className="h-4 w-4" />
              </button>
              <span className="hidden min-w-0 border-l border-white/10 pl-3 text-xs font-semibold tracking-normal text-slate-400 sm:inline">제작 콘솔</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-[7px] border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-bold text-slate-300 sm:inline-flex">/problems</span>
              <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300">
                <UserCircle className="h-3.5 w-3.5" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300">
                <Bell className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          <div className="grid min-h-[35rem] grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[12rem_minmax(0,1fr)]">
            <aside className="border-r border-white/10 bg-black/45 px-1.5 py-3 shadow-[8px_0_32px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-2">
              <SidebarGroup
                title="Private Studio"
                accent="bg-violet-400"
                panel="border-violet-400/20 bg-violet-400/[0.055]"
                items={[
                  ["제작 콘솔", LayoutDashboard, true],
                  ["추출", FileUp, false],
                  ["검토", ClipboardCheck, false],
                  ["보관", Archive, true],
                  ["문항 세트", FolderKanban, false],
                ]}
              />
              <SidebarGroup
                title="Academy OS"
                accent="bg-violet-300"
                panel="border-violet-300/20 bg-violet-300/[0.045]"
                items={[
                  ["학생 관리", GraduationCap, false],
                  ["클래스", Users, false],
                ]}
              />
            </aside>

            <section className="min-w-0 bg-[#090b10]/[0.92]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-200">Private Studio</p>
                  <p className="mt-0.5 text-sm font-black text-slate-100">문항 보관함</p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.7)]" />
                  <span className="text-xs font-bold text-slate-400">Live preview</span>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[1fr_18rem]">
                <div className="min-w-0">
                  <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xl font-black text-white">문항 브라우저</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">검토 완료 문항을 바로 세트로 묶습니다.</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-[7px] border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-200">필터</span>
                        <span className="rounded-[7px] bg-[var(--landing-accent)] px-3 py-2 text-xs font-black text-white">세트에 담기</span>
                      </div>
                    </div>
                    <div className="mt-4 h-11 rounded-[7px] border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-slate-500">
                      본문, 번호, 정답, 태그, 출처 검색
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((number) => (
                      <ProblemCard key={number} number={number} selected={number <= 3} />
                    ))}
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-sm font-black text-white">내보내기</p>
                    <div className="mt-4 space-y-2">
                      {["템플릿 선택", "클래스 배정", "PDF 생성"].map((label, index) => (
                        <div key={label} className="flex items-center gap-3 rounded-[7px] border border-white/10 bg-black/25 px-3 py-2">
                          <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[11px] font-black", index === 0 ? "bg-violet-400 text-white" : "bg-white/10 text-slate-300")}>{index + 1}</span>
                          <span className="text-xs font-bold text-slate-300">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-sm font-black text-white">학생 기록</p>
                    <div className="mt-4 grid grid-cols-5 gap-2">
                      {Array.from({ length: 15 }).map((_, index) => (
                        <span key={index} className={cn("aspect-square rounded-[5px]", index % 5 === 1 ? "bg-orange-400" : index % 7 === 2 ? "bg-rose-500" : "bg-emerald-400")} />
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSection() {
  return (
    <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[var(--landing-surface-soft)] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-md sm:p-5">
      <h2 className="landing-keep-words text-lg font-black text-white">추출부터 학생 기록까지, 하나의 흐름</h2>
      <div className="mt-5 grid gap-3 lg:grid-cols-5">
        {workflowSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.title}
              href={step.href}
              className="group relative rounded-[10px] border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-violet-200/26 hover:bg-white/[0.065] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25"
            >
              {index < workflowSteps.length - 1 ? (
                <span className="absolute left-[calc(100%+0.75rem)] top-1/2 hidden h-px w-3 -translate-y-1/2 bg-violet-200/24 lg:block" />
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-400/14 text-xs font-black text-violet-100 ring-1 ring-violet-200/18">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon className="h-5 w-5 text-violet-200" />
              </div>
              <h3 className="mt-4 text-base font-black text-white">{step.title}</h3>
              <p className="landing-keep-words mt-2 text-sm leading-6 text-[var(--landing-text-secondary)]">{step.body}</p>
              <ChevronRight className="mt-4 h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-violet-100" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SidebarGroup({
  title,
  accent,
  panel,
  items,
}: {
  title: string;
  accent: string;
  panel: string;
  items: Array<[string, IconComponent, boolean]>;
}) {
  return (
    <section className={cn("mb-3 overflow-hidden rounded-[12px] border shadow-[0_12px_30px_rgba(0,0,0,0.14)]", panel)}>
      <div className="flex items-center justify-center border-b border-white/10 px-1 py-2 sm:justify-start sm:gap-2 sm:px-2.5 sm:py-2.5">
        <span className={cn("rounded-full", accent, "h-1.5 w-8 sm:h-8 sm:w-1")} />
        <h2 className="hidden text-[12px] font-bold tracking-[0.02em] text-slate-100 sm:block">{title}</h2>
      </div>
      <div className="space-y-0.5 p-1">
        {items.map(([label, Icon, active]) => (
          <div
            key={label}
            className={cn(
              "group relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-[7px] border border-transparent px-0 text-sm font-medium transition sm:justify-start sm:px-2.5",
              active ? "border-white/10 bg-white/[0.08] text-white" : "text-slate-400"
            )}
          >
            <span className={cn("absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-transparent sm:block", active && "bg-violet-400")} />
            <Icon className={cn("h-4 w-4 shrink-0 text-slate-500", active && "text-violet-300")} />
            <span className="hidden truncate sm:inline">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProblemCard({ number, selected }: { number: number; selected: boolean }) {
  return (
    <article className={cn("min-h-40 rounded-[8px] border p-4", selected ? "border-violet-300/45 bg-violet-400/[0.08]" : "border-white/10 bg-white/[0.035]")}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-black text-white">#{number}</span>
        <span className="rounded-[6px] border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-black text-slate-300">수학</span>
      </div>
      <div className="mt-5 space-y-2">
        <span className="block h-2 w-11/12 rounded-full bg-slate-500/45" />
        <span className="block h-2 w-8/12 rounded-full bg-slate-500/30" />
        <span className="block h-2 w-10/12 rounded-full bg-slate-500/35" />
      </div>
      <div className="mt-6 flex gap-2">
        <span className="h-7 flex-1 rounded-[6px] bg-black/25" />
        <span className="h-7 flex-1 rounded-[6px] bg-black/25" />
      </div>
    </article>
  );
}

function PlanSection() {
  return (
    <section id="plans" className="relative border-t border-white/[0.08] bg-[var(--landing-bg-base)] px-4 py-16 sm:px-6">
      <div className="mx-auto w-full max-w-[104rem]">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-black uppercase text-violet-200">Plans</p>
            <h2 className="mt-3 text-4xl font-black tracking-normal text-white">플랜</h2>
          </div>
          <Link href="/pricing" className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-white/12 px-4 text-sm font-black text-slate-100 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25">
            가격 보기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {planCards.map((plan) => (
            <article key={plan.name} className={cn("rounded-[8px] border p-5", plan.featured ? "border-violet-300/30 bg-violet-400/[0.09]" : "border-white/[0.08] bg-white/[0.035]")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black text-white">{plan.name}</h3>
                  <p className="mt-2 text-xl font-black text-violet-100">{plan.price}</p>
                </div>
                {plan.featured ? <span className="rounded-[6px] bg-[var(--landing-accent)] px-2.5 py-1 text-xs font-black text-white">추천</span> : null}
              </div>
              <ul className="mt-6 space-y-3 text-sm font-semibold text-slate-300">
                {plan.points.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-violet-200" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className={cn("mt-7 inline-flex h-11 w-full items-center justify-center rounded-[7px] text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25", plan.featured ? "bg-[var(--landing-accent)] text-white hover:bg-[var(--landing-accent-hover)]" : "border border-white/12 text-white hover:bg-white/[0.07]")}>
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
