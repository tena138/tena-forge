"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  Database,
  FileText,
  GraduationCap,
  Layers3,
  Sparkles,
  Users,
} from "lucide-react";

import { PLANS, formatKRW } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

const workspaceLinks: Array<{ label: string; href: string; icon: IconComponent }> = [
  { label: "추출", href: "/upload", icon: Sparkles },
  { label: "검토", href: "/problems/review", icon: Check },
  { label: "보관", href: "/problems", icon: Archive },
  { label: "세트", href: "/problem-sets", icon: Layers3 },
  { label: "학생", href: "/student-management", icon: Users },
];

const planCards = [
  {
    name: "Free",
    price: "무료",
    href: "/register?plan=free",
    cta: "시작",
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
    <main className="min-h-screen overflow-hidden bg-[#07080c] text-white">
      <LandingNav />

      <section className="relative min-h-screen overflow-hidden pt-16">
        <AuroraBackdrop />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-100">Tena Forge</p>
              <h1 className="mt-5 text-5xl font-black leading-[1.02] tracking-normal text-white sm:text-7xl">
                교육 콘텐츠 제작 인프라
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                PDF 추출, 문항 보관, 시험지 제작, 학생 오답 기록까지 한 흐름으로 연결합니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register?plan=free" className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[#7c3aed] px-5 text-sm font-black text-white shadow-[0_14px_34px_rgba(124,58,237,0.30)] transition hover:bg-[#8b5cf6]">
                  시작하기 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/login?redirect=/academy" className="inline-flex h-11 items-center rounded-[7px] border border-white/12 bg-white/[0.055] px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.09]">
                  로그인
                </Link>
              </div>
            </div>

            <ProductPreview />
          </div>

          <div className="mt-12 grid gap-2 sm:grid-cols-5">
            {workspaceLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className="group flex h-14 items-center justify-between rounded-[8px] border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-black text-slate-100 transition hover:border-violet-200/28 hover:bg-white/[0.07]">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-violet-200" />
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <PlanSection />
    </main>
  );
}

function LandingNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.08] bg-[#07080c]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex min-w-0 items-center" aria-label="Tena Forge">
          <img src="/tenaforgelogo-dark.png" alt="Tena Forge" className="h-9 w-auto max-w-[8.75rem] object-contain sm:max-w-none" />
        </Link>
        <div className="flex items-center gap-2 text-sm font-black">
          <a href="#plans" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">플랜</a>
          <Link href="/login?redirect=/academy" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">로그인</Link>
          <Link href="/register?plan=free" className="inline-flex h-9 items-center rounded-[7px] bg-[#7c3aed] px-4 text-white transition hover:bg-[#8b5cf6]">시작</Link>
        </div>
      </div>
    </nav>
  );
}

function AuroraBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#06070b]" />
      <div className="aurora-layer aurora-layer-a" />
      <div className="aurora-layer aurora-layer-b" />
      <div className="aurora-layer aurora-layer-c" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,7,11,0.04)_0%,rgba(6,7,11,0.38)_56%,rgba(6,7,11,0.95)_100%)]" />
      <div className="absolute inset-x-0 top-16 h-px bg-white/10" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-[linear-gradient(180deg,transparent,#07080c_82%)]" />
      <style jsx>{`
        .aurora-layer {
          position: absolute;
          inset: -26% -18%;
          filter: blur(44px);
          opacity: 0.72;
          transform-origin: center;
          will-change: transform;
        }
        .aurora-layer-a {
          background:
            linear-gradient(116deg, transparent 0 18%, rgba(37, 99, 235, 0.72) 28%, rgba(20, 184, 166, 0.52) 39%, transparent 56%),
            linear-gradient(148deg, transparent 0 42%, rgba(124, 58, 237, 0.64) 59%, transparent 75%);
          animation: auroraDriftA 18s ease-in-out infinite alternate;
        }
        .aurora-layer-b {
          background:
            linear-gradient(68deg, transparent 0 22%, rgba(6, 182, 212, 0.42) 39%, transparent 58%),
            linear-gradient(124deg, transparent 0 48%, rgba(167, 139, 250, 0.56) 63%, rgba(15, 23, 42, 0) 82%);
          mix-blend-mode: screen;
          opacity: 0.5;
          animation: auroraDriftB 24s ease-in-out infinite alternate;
        }
        .aurora-layer-c {
          background:
            linear-gradient(100deg, rgba(7, 8, 12, 0) 0 36%, rgba(52, 211, 153, 0.28) 47%, rgba(99, 102, 241, 0.4) 58%, rgba(7, 8, 12, 0) 76%);
          mix-blend-mode: screen;
          opacity: 0.45;
          animation: auroraDriftC 30s ease-in-out infinite alternate;
        }
        @keyframes auroraDriftA {
          from { transform: translate3d(-5%, -2%, 0) rotate(-4deg) scale(1.02); }
          to { transform: translate3d(7%, 4%, 0) rotate(3deg) scale(1.08); }
        }
        @keyframes auroraDriftB {
          from { transform: translate3d(6%, 3%, 0) rotate(5deg) scale(1.08); }
          to { transform: translate3d(-6%, -5%, 0) rotate(-3deg) scale(1.02); }
        }
        @keyframes auroraDriftC {
          from { transform: translate3d(-2%, 6%, 0) rotate(2deg) scale(1.02); }
          to { transform: translate3d(4%, -4%, 0) rotate(-4deg) scale(1.1); }
        }
      `}</style>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="relative min-h-[28rem] lg:min-h-[34rem]">
      <div className="absolute right-0 top-1/2 w-full max-w-[44rem] -translate-y-1/2 rounded-[8px] border border-white/24 bg-[#f8fafc] p-2 shadow-[0_34px_120px_rgba(0,0,0,0.42)] lg:w-[44rem]">
        <div className="overflow-hidden rounded-[6px] border border-slate-200 bg-white">
          <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-[#0b1020] px-4 text-[11px] font-black text-slate-300">
            <span className="text-white">Tena Forge Console</span>
            <span>Live workspace</span>
          </div>
          <div className="grid min-h-[26rem] grid-cols-[8rem_1fr] bg-white text-slate-950">
            <aside className="border-r border-slate-200 bg-slate-50 p-3">
              {[
                ["추출", Sparkles],
                ["검토", Check],
                ["보관", Database],
                ["세트", Layers3],
                ["학생", GraduationCap],
              ].map(([label, ItemIcon], index) => {
                const SmallIcon = ItemIcon as IconComponent;
                return (
                  <div key={label as string} className={cn("mb-1 flex h-8 items-center gap-2 rounded-[6px] px-2 text-xs font-black", index === 1 ? "bg-violet-100 text-violet-700" : "text-slate-500")}>
                    <SmallIcon className="h-3.5 w-3.5" />
                    {label as string}
                  </div>
                );
              })}
            </aside>
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-violet-700">문항 브라우저</p>
                  <h2 className="mt-2 text-xl font-black">검토한 문항을 바로 제작으로</h2>
                </div>
                <button className="rounded-[6px] bg-slate-950 px-3 py-2 text-xs font-black text-white">내보내기</button>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-[7px] border border-slate-200 bg-white p-4">
                  <div className="space-y-3">
                    {[1, 2, 3].map((number) => (
                      <div key={number} className="rounded-[7px] border border-violet-100 bg-violet-50/50 p-3">
                        <div className="flex items-center justify-between text-xs font-black">
                          <span>#{number}</span>
                          <span className="text-violet-600">검토 완료</span>
                        </div>
                        <div className="mt-3 h-2 w-10/12 rounded-full bg-slate-300" />
                        <div className="mt-2 h-2 w-7/12 rounded-full bg-slate-200" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[7px] border border-slate-200 bg-slate-950 p-4 text-white">
                  <div className="text-xs font-black text-slate-400">학생 기록</div>
                  <div className="mt-5 grid grid-cols-5 gap-2">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <span key={index} className={cn("aspect-square rounded-[5px]", index % 5 === 1 ? "bg-orange-400" : index % 7 === 2 ? "bg-rose-500" : "bg-emerald-400")} />
                    ))}
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-white/10">
                    <div className="h-full w-3/4 rounded-full bg-violet-400" />
                  </div>
                  <div className="mt-5 grid gap-2 text-xs">
                    <span className="rounded-[6px] bg-white/10 p-2">오답 기록</span>
                    <span className="rounded-[6px] bg-white/10 p-2">리뷰 세트</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="h-10 flex-1 rounded-[7px] border border-slate-200 bg-slate-50" />
                <span className="h-10 flex-1 rounded-[7px] border border-slate-200 bg-slate-50" />
                <span className="h-10 flex-1 rounded-[7px] border border-slate-200 bg-slate-50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanSection() {
  return (
    <section id="plans" className="relative border-t border-white/[0.08] bg-[#08090d] px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-black uppercase text-violet-200">Plans</p>
            <h2 className="mt-3 text-4xl font-black tracking-normal text-white">플랜</h2>
          </div>
          <Link href="/pricing" className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-white/12 px-4 text-sm font-black text-slate-100 transition hover:bg-white/[0.07]">
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
                {plan.featured ? <span className="rounded-[6px] bg-[#7c3aed] px-2.5 py-1 text-xs font-black text-white">추천</span> : null}
              </div>
              <ul className="mt-6 space-y-3 text-sm font-semibold text-slate-300">
                {plan.points.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-violet-200" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className={cn("mt-7 inline-flex h-11 w-full items-center justify-center rounded-[7px] text-sm font-black transition", plan.featured ? "bg-[#7c3aed] text-white hover:bg-[#8b5cf6]" : "border border-white/12 text-white hover:bg-white/[0.07]")}>
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
