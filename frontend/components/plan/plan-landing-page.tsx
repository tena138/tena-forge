"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  Archive,
  ArrowRight,
  Bell,
  Check,
  ClipboardCheck,
  Database,
  FileUp,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  PanelLeftClose,
  Sparkles,
  UserCircle,
  Users,
} from "lucide-react";

import { PLANS, formatKRW } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";
import { SiteLogo } from "@/components/site-logo";

type IconComponent = ComponentType<{ className?: string }>;

const workspaceLinks: Array<{ label: string; href: string; icon: IconComponent }> = [
  { label: "추출", href: "/upload", icon: FileUp },
  { label: "검토", href: "/problems/review", icon: ClipboardCheck },
  { label: "보관", href: "/problems", icon: Archive },
  { label: "세트", href: "/problem-sets", icon: FolderKanban },
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
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[96rem] flex-col justify-center px-4 py-10 sm:px-6 xl:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.52fr_1.48fr] lg:items-center">
            <div className="max-w-[34rem] lg:pt-8">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-100">Tena Forge</p>
              <h1 className="mt-4 text-4xl font-black leading-none tracking-normal text-white sm:text-5xl xl:text-6xl">
                문제를 꺼내고,
                <br />
                수업으로 보낸다.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
                PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
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

          <div className="mt-8 grid gap-2 sm:grid-cols-5">
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
      <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center justify-between px-4 sm:px-6 xl:px-8">
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
    <div className="relative min-h-[32rem] lg:min-h-[42rem]">
      <div className="absolute right-0 top-1/2 w-full max-w-[72rem] -translate-y-1/2 rounded-[10px] border border-white/10 bg-[#07080d] shadow-[0_34px_130px_rgba(0,0,0,0.48)] backdrop-blur-md">
        <div className="absolute inset-0 rounded-[10px] bg-[radial-gradient(circle_at_18%_4%,rgba(124,58,237,0.17),transparent_20rem),radial-gradient(circle_at_94%_18%,rgba(34,211,238,0.12),transparent_22rem),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(7,8,13,0.94)_44%,rgba(8,10,16,0.98))]" />
        <div className="relative z-10 overflow-hidden rounded-[10px]">
          <div className="flex h-14 items-center justify-between border-b border-white/10 bg-black/55 px-4 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <SiteLogo className="h-9 sm:h-9" />
              <button type="button" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-slate-400 lg:inline-flex">
                <PanelLeftClose className="h-4 w-4" />
              </button>
              <span className="hidden min-w-0 border-l border-white/10 pl-3 text-xs font-semibold tracking-normal text-slate-400 sm:inline">
                제작 콘솔
              </span>
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
                accent="bg-emerald-300"
                panel="border-emerald-300/20 bg-emerald-300/[0.045]"
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
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.7)]" />
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
                        <span className="rounded-[7px] bg-[#7c3aed] px-3 py-2 text-xs font-black text-white">세트에 담기</span>
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
    <section id="plans" className="relative border-t border-white/[0.08] bg-[#08090d] px-4 py-16 sm:px-6">
      <div className="mx-auto w-full max-w-[96rem]">
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
