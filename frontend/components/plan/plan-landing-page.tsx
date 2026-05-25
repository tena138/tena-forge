"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComponentType } from "react";
import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronRight,
  Database,
  FileText,
  GraduationCap,
  Layers3,
  LibraryBig,
  LineChart,
  LockKeyhole,
  School,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

import { PLANS, formatKRW } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

const heroStories = [
  {
    label: "Extract",
    eyebrow: "제작 콘솔",
    title: "PDF를 문항 아카이브로 전환",
    body: "문제와 해설을 분리하고, 검토한 문항을 바로 세트 제작과 시험지 내보내기로 이어갑니다.",
    icon: Archive,
    metric: "58 문항",
    accent: "from-cyan-300 to-violet-300",
  },
  {
    label: "Class",
    eyebrow: "학생 관리",
    title: "종이 시험 결과를 학생 기록으로",
    body: "클래스별 시험, 빠른 오답 체크, 학생별 오답 아카이브를 한 흐름으로 연결합니다.",
    icon: GraduationCap,
    metric: "4 학생",
    accent: "from-violet-300 to-fuchsia-300",
  },
  {
    label: "Export",
    eyebrow: "시험지 제작",
    title: "선택한 문항을 바로 배정",
    body: "템플릿 선택, 해설 포함 여부, 클래스와 학생 배정을 내보내기 과정 안에서 처리합니다.",
    icon: FileText,
    metric: "2 템플릿",
    accent: "from-emerald-200 to-cyan-300",
  },
] as const;

const recommendations: Array<{ title: string; tag: string; body: string; href: string; icon: IconComponent }> = [
  {
    title: "문항 추출",
    tag: "AI 도구",
    body: "PDF 문제와 해설을 검토 가능한 문항 데이터로 정리합니다.",
    href: "/upload",
    icon: Sparkles,
  },
  {
    title: "문항 보관함",
    tag: "아카이브",
    body: "검토 완료 문항을 검색하고 세트로 재구성합니다.",
    href: "/problems",
    icon: LibraryBig,
  },
  {
    title: "학생 관리",
    tag: "Academy OS",
    body: "클래스, 시험 기록, 오답 흐름을 운영 화면에 모읍니다.",
    href: "/student-management",
    icon: Users,
  },
  {
    title: "템플릿",
    tag: "내보내기",
    body: "학원 양식에 맞는 시험지 레이아웃을 관리합니다.",
    href: "/templates/mine",
    icon: BookOpenCheck,
  },
];

const planCards = [
  {
    name: "Free",
    price: "무료",
    href: "/register?plan=free",
    cta: "시작",
    points: ["체험용 AI credits", "문항 보관함 맛보기", "기본 시험지 제작"],
  },
  {
    name: "Basic",
    price: `${formatKRW(PLANS.basic.baseMonthlyPrice)} / 월`,
    href: "/plan/basic",
    cta: "Basic 구성",
    points: ["학생 키 3명", "월간 AI 처리량", "개인 과외와 소규모 수업"],
    featured: true,
  },
  {
    name: "Pro",
    price: `${formatKRW(PLANS.pro.baseMonthlyPrice)} / 월`,
    href: "/plan/pro",
    cta: "Pro 구성",
    points: ["학생 키 10명", "동시 추출과 빠른 처리", "학원 운영과 마켓 확장"],
  },
];

export function PlanLandingPage() {
  const [activeStory, setActiveStory] = useState(0);
  const story = heroStories[activeStory];

  return (
    <main className="min-h-screen overflow-hidden bg-[#07080c] text-white">
      <LandingNav />

      <section className="relative min-h-screen overflow-hidden pt-16">
        <HeroBackdrop />
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 lg:py-16">
          <div className="grid min-h-[35rem] gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-[6px] border border-violet-200/20 bg-white/[0.06] px-3 py-1 text-sm font-black text-violet-100">
                {story.eyebrow}
              </span>
              <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-normal text-white sm:text-7xl">Tena Forge</h1>
              <p className="mt-5 max-w-xl text-2xl font-black leading-tight text-slate-100 sm:text-4xl">{story.title}</p>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">{story.body}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register?plan=free" className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[#7c3aed] px-5 text-sm font-black text-white shadow-[0_14px_34px_rgba(124,58,237,0.30)] transition hover:bg-[#8b5cf6]">
                  무료로 시작 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/login?redirect=/academy" className="inline-flex h-11 items-center rounded-[7px] border border-white/12 bg-white/[0.055] px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.09]">
                  로그인
                </Link>
              </div>

              <div className="mt-12 max-w-xl">
                <div className="h-0.5 overflow-hidden rounded-full bg-white/12">
                  <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-300", story.accent)} style={{ width: `${((activeStory + 1) / heroStories.length) * 100}%` }} />
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {heroStories.map((item, index) => {
                    const Icon = item.icon;
                    const selected = index === activeStory;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setActiveStory(index)}
                        className={cn(
                          "group rounded-[8px] border border-transparent p-0 text-left transition",
                          selected ? "text-white" : "text-slate-500 hover:text-slate-200"
                        )}
                      >
                        <Icon className={cn("h-5 w-5", selected ? "text-violet-100" : "text-slate-600 group-hover:text-slate-300")} />
                        <span className="mt-3 block text-sm font-black">{item.label}</span>
                        <span className="mt-1 block text-sm leading-5">{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <ProductPreview story={story} />
          </div>

          <div className="mt-8 grid border-y border-white/[0.08] lg:grid-cols-[12rem_1fr_1fr_1fr_1fr]">
            <div className="flex items-center py-5 text-2xl font-black text-white lg:border-r lg:border-white/[0.08]">추천 콘텐츠</div>
            {recommendations.map((item) => (
              <RecommendationLink key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <PlanSection />
      <EnterpriseStrip />
    </main>
  );
}

function LandingNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.08] bg-[#07080c]/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex min-w-0 items-center" aria-label="Tena Forge">
          <img src="/tenaforgelogo-dark.png" alt="Tena Forge" className="h-9 w-auto max-w-[8.75rem] object-contain sm:max-w-none" />
        </Link>
        <div className="flex items-center gap-2 text-sm font-black">
          <a href="#plans" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">플랜</a>
          <a href="#enterprise" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">Enterprise</a>
          <Link href="/login?redirect=/academy" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">로그인</Link>
          <Link href="/register?plan=free" className="inline-flex h-9 items-center rounded-[7px] bg-[#2563eb] px-4 text-white transition hover:bg-[#3b82f6]">시작</Link>
        </div>
      </div>
    </nav>
  );
}

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#08090d]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(37,99,235,0.36)_0%,rgba(20,184,166,0.22)_21%,rgba(29,31,41,0.08)_43%,rgba(124,58,237,0.28)_69%,rgba(8,9,13,0.92)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(7,8,12,0.36)_52%,rgba(7,8,12,0.92)_100%)]" />
      <div className="absolute inset-x-0 top-16 h-px bg-white/10" />
      <div className="absolute inset-x-0 bottom-0 h-72 bg-[linear-gradient(180deg,transparent,#07080c_78%)]" />
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
        }}
      />
    </div>
  );
}

function ProductPreview({ story }: { story: (typeof heroStories)[number] }) {
  const Icon = story.icon;
  return (
    <div className="relative min-h-[28rem] lg:min-h-[34rem]">
      <div className="absolute right-0 top-1/2 w-full max-w-[44rem] -translate-y-1/2 rounded-[8px] border border-white/24 bg-[#f8fafc] p-2 shadow-[0_34px_120px_rgba(0,0,0,0.42)] lg:w-[44rem]">
        <div className="rounded-[6px] border border-slate-200 bg-white">
          <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-[#0b1020] px-4 text-[11px] font-black text-slate-300">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="ml-2 text-white">Tena Forge Console</span>
            </div>
            <span>{story.metric}</span>
          </div>
          <div className="grid min-h-[26rem] grid-cols-[8rem_1fr] bg-white text-slate-950">
            <aside className="border-r border-slate-200 bg-slate-50 p-3">
              {[
                ["추출", Sparkles],
                ["검토", Check],
                ["보관", Database],
                ["세트", Layers3],
                ["학생", Users],
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
                  <div className="inline-flex items-center gap-2 rounded-[6px] bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700">
                    <Icon className="h-3.5 w-3.5" />
                    {story.eyebrow}
                  </div>
                  <h2 className="mt-3 text-xl font-black">{story.title}</h2>
                </div>
                <button className="rounded-[6px] bg-slate-950 px-3 py-2 text-xs font-black text-white">내보내기</button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["문항", "58"],
                  ["해설", "52"],
                  ["검토", "91%"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[7px] border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-black text-slate-500">{label}</div>
                    <div className="mt-2 text-lg font-black">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                <div className="rounded-[7px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between text-xs font-black text-slate-500">
                    <span>문항 브라우저</span>
                    <span>원문 순</span>
                  </div>
                  <div className="mt-4 space-y-3">
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
                  <div className="text-xs font-black text-slate-400">클래스 기록</div>
                  <div className="mt-5 flex h-32 items-end gap-2">
                    {[36, 72, 54, 96, 68, 82].map((height, index) => (
                      <span key={`${height}-${index}`} className="flex-1 rounded-t-[5px] bg-gradient-to-t from-violet-700 to-cyan-300" style={{ height }} />
                    ))}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                    <span className="rounded-[6px] bg-white/10 p-2">평균 82</span>
                    <span className="rounded-[6px] bg-white/10 p-2">오답 14</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecommendationLink({ item }: { item: (typeof recommendations)[number] }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="group border-t border-white/[0.08] py-5 transition hover:bg-white/[0.035] lg:border-l lg:border-t-0 lg:px-6">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-cyan-200" />
        <div>
          <p className="text-xs font-black text-cyan-200">{item.tag}</p>
          <h2 className="mt-2 flex items-center gap-1 text-lg font-black text-white">
            {item.title}
            <ChevronRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
        </div>
      </div>
    </Link>
  );
}

function PlanSection() {
  return (
    <section id="plans" className="relative border-t border-white/[0.08] bg-[#08090d] px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-black uppercase text-violet-200">Plans</p>
            <h2 className="mt-3 text-4xl font-black tracking-normal text-white">작게 시작하고, 필요한 만큼 확장</h2>
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

function EnterpriseStrip() {
  return (
    <section id="enterprise" className="border-t border-white/[0.08] bg-[#0a0b10] px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_0.7fr] lg:items-center">
        <div>
          <p className="text-sm font-black uppercase text-cyan-200">Enterprise</p>
          <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-5xl">학원, 연구실, 출판팀용 운영 인프라</h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-400">대량 PDF 처리, 학생 키, 콘텐츠 권한, 마켓 확장까지 한 계정 구조 안에서 운영합니다.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["권한 관리", LockKeyhole],
            ["학원 운영", School],
            ["콘텐츠 DB", Database],
            ["성과 분석", LineChart],
          ].map(([label, Icon]) => {
            const ItemIcon = Icon as IconComponent;
            return (
              <div key={label as string} className="flex items-center gap-3 rounded-[8px] border border-white/[0.08] bg-white/[0.04] p-4">
                <ItemIcon className="h-5 w-5 text-violet-200" />
                <span className="font-black text-slate-100">{label as string}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
