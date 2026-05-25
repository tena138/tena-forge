"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  Bell,
  Check,
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
import { TemplatePageView } from "@/components/templates/visual-template-renderer";
import { PAGE_SIZES, SampleProblem, TemplateSet } from "@/lib/visualTemplateTypes";

type IconComponent = ComponentType<{ className?: string }>;
type PlanCardTone = "free" | "basic" | "pro";

const AuroraWebGLBackground = dynamic(
  () => import("@/components/landing/aurora-webgl-background").then((mod) => mod.AuroraWebGLBackground),
  { ssr: false }
);

const planCards = [
  {
    name: "Free",
    tone: "free" as PlanCardTone,
    price: "무료",
    href: "/register?plan=free",
    cta: "무료로 시작하기",
    points: ["기본 체험", "문항 추출 테스트", "시험지 제작"],
  },
  {
    name: "Basic",
    tone: "basic" as PlanCardTone,
    price: `${formatKRW(PLANS.basic.baseMonthlyPrice)} / 월`,
    href: "/plan/basic",
    cta: "Basic",
    points: ["학생 키 3명", "소규모 수업", "표준 처리"],
    featured: true,
  },
  {
    name: "Pro",
    tone: "pro" as PlanCardTone,
    price: `${formatKRW(PLANS.pro.baseMonthlyPrice)} / 월`,
    href: "/plan/pro",
    cta: "Pro",
    points: ["학생 키 10명", "동시 추출", "빠른 처리"],
  },
];

const planCardToneClass: Record<PlanCardTone, string> = {
  free: "landing-plan-card-free",
  basic: "landing-plan-card-basic",
  pro: "landing-plan-card-pro",
};

const planCtaToneClass: Record<PlanCardTone, string> = {
  free: "border border-white/12 text-white hover:bg-white/[0.07]",
  basic: "bg-[linear-gradient(135deg,#2dd4bf_0%,#7c5cff_58%,#f472b6_100%)] text-white shadow-[0_18px_54px_rgba(20,184,166,0.18)] hover:shadow-[0_22px_64px_rgba(124,92,255,0.26)]",
  pro: "bg-[linear-gradient(135deg,#7c5cff_0%,#8b6bff_48%,#c4b5fd_100%)] text-white shadow-[0_18px_54px_rgba(124,92,255,0.24)] hover:shadow-[0_22px_70px_rgba(124,92,255,0.34)]",
};

const storyScenes = [
  { step: "01", title: "오프라인 문항들을 한 곳에 전산화" },
  { step: "02", title: "가장 빠르게 컨텐츠 제작" },
  { step: "03", title: "오답까지 완벽하게" },
];

const demoProblems: SampleProblem[] = [
  {
    id: "landing-problem-1",
    number: 1,
    text: "다항함수 $f(x)$가 $\\lim_{x\\to\\infty}\\frac{f(x)-x^3}{x^2}=-6$ 을 만족시킬 때, $f(1)$의 값을 구하시오.",
    choices: ["1", "2", "3", "4", "5"],
    answer: "3",
    difficulty: "중",
    tags: ["수학II", "극한"],
  },
  {
    id: "landing-problem-2",
    number: 2,
    text: "상수항과 모든 항의 계수가 정수인 다항함수 $f(x), g(x)$가 조건을 만족시킬 때 가능한 모든 $f(3)$의 합을 구하시오.",
    answer: "12",
    difficulty: "상",
    tags: ["수학II", "함수"],
  },
  {
    id: "landing-problem-3",
    number: 3,
    text: "다음 조건을 만족시키는 모든 자연수 $n$의 개수를 구하시오.",
    choices: ["2", "4", "6", "8", "10"],
    answer: "4",
    difficulty: "중",
    tags: ["수학II", "수열"],
  },
  {
    id: "landing-problem-4",
    number: 4,
    text: "최고차항의 계수가 1인 삼차함수 $f(x)$와 이차함수 $g(x)$가 조건을 만족시킬 때 $g(5)$의 값을 구하시오.",
    answer: "7",
    difficulty: "상",
    tags: ["수학II", "다항함수"],
  },
];

const demoTemplateSet: TemplateSet = {
  id: "landing-template-set",
  schemaVersion: 1,
  title: "세움 스파르타 시험지 양식",
  category: "exam",
  visibility: "private",
  defaultPageSize: PAGE_SIZES.A4_PORTRAIT,
  theme: {
    primary: "#111827",
    graphite: "#111827",
    muted: "#64748b",
    fontFamily: "Pretendard, sans-serif",
  },
  assets: [],
  pages: [
    {
      id: "landing-template-page",
      name: "시험지",
      role: "exam",
      background: { color: "#ffffff" },
      elements: [
        {
          id: "header",
          type: "headerBlock",
          name: "헤더",
          title: "2026년 05월 25일",
          subtitle: "시험명",
          x: 58,
          y: 38,
          width: 676,
          height: 54,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          locked: true,
          hidden: false,
          style: { color: "#111827", fontSize: 13, fontWeight: "bold", stroke: "#111827", strokeWidth: 1, borderStyle: "solid" },
        },
        {
          id: "region-problems",
          type: "problemRegion",
          name: "문항 영역",
          binding: "problems",
          columns: 2,
          rows: 3,
          columnGap: 20,
          rowGap: 18,
          padding: 8,
          fillDirection: "row-first",
          keepTogether: true,
          allowSplit: false,
          overflowStrategy: "create-next-page",
          minItemHeight: 120,
          numberFormat: "{n}.",
          x: 58,
          y: 120,
          width: 676,
          height: 880,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: true,
          hidden: false,
          style: {},
          cardStyle: { fill: "#ffffff", stroke: "transparent", strokeWidth: 0, radius: 0 },
          numberStyle: { color: "#111827", fontSize: 13, fontWeight: "bold" },
          bodyStyle: { color: "#111827", fontSize: 12, lineHeight: 1.5 },
          answerSpaceStyle: { fill: "#ffffff", stroke: "#cbd5e1", strokeWidth: 1, borderStyle: "dashed", radius: 4 },
        },
      ],
    },
  ],
};

const storyTiming = [
  { start: 0, end: 0.24 },
  { start: 0.25, end: 0.58 },
  { start: 0.59, end: 0.94 },
];

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sceneProgress(progress: number, index: number) {
  const timing = storyTiming[index];
  return clampProgress((progress - timing.start) / Math.max(0.01, timing.end - timing.start));
}

function activeStoryIndex(progress: number) {
  if (progress < storyTiming[1].start) return 0;
  if (progress < storyTiming[2].start) return 1;
  return 2;
}

export function PlanLandingPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-transparent text-[var(--landing-text-primary)]">
      <AuroraWebGLBackground />
      <LandingNav />

      <section className="relative min-h-screen overflow-hidden pt-16">
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[104rem] flex-col justify-center px-4 py-8 sm:px-6 lg:py-10 xl:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(21rem,0.55fr)_minmax(0,1.45fr)] lg:items-center">
            <div className="max-w-[34rem]">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200/90 drop-shadow-[0_0_16px_rgba(124,92,255,0.35)]">TENA FORGE</p>
              <h1 className="landing-hero-title landing-keep-words mt-4 bg-[linear-gradient(180deg,#ffffff_0%,#dcd7ff_50%,#a99cff_100%)] bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(124,92,255,0.20)]">
                <span className="block">혼자서도 빠르고,</span>
                <span className="block">강력하게</span>
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
        </div>
      </section>

      <ScrollStorySection />
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

function ProductPreview() {
  return (
    <div className="landing-mock-perspective relative min-h-[32rem] lg:min-h-[42rem]">
      <div className="absolute right-[-1rem] top-1/2 h-[26rem] w-[46rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.36),transparent_68%)] blur-3xl" />
      <div className="landing-mock-frame absolute right-0 top-1/2 w-full max-w-[74rem] -translate-y-1/2 rounded-2xl border border-white/[0.09] bg-[rgba(7,8,13,0.74)] shadow-[0_38px_140px_rgba(0,0,0,0.56),0_0_90px_rgba(124,92,255,0.18)] backdrop-blur-xl">
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

function ScrollStorySection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    if (!section || !pin) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    if (reduceMotion.matches || !desktop.matches) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([gsapModule, scrollTriggerModule]) => {
      if (cancelled) return;
      const gsap = gsapModule.gsap;
      const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      const trigger = ScrollTrigger.create({
        trigger: section,
        pin,
        scrub: 1,
        start: "top top",
        end: "+=360%",
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => setProgress(clampProgress(self.progress)),
      });
      cleanup = () => trigger.kill();
      ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const activeIndex = activeStoryIndex(progress);
  const progressByScene = storyScenes.map((_, index) => sceneProgress(progress, index));

  return (
    <section ref={sectionRef} className="relative z-10 border-y border-white/[0.08] bg-[#06070d]/70">
      <div className="lg:hidden">
        {storyScenes.map((scene, index) => (
          <div key={scene.title} className="px-4 py-12 sm:px-6">
            <div className="mx-auto max-w-5xl">
              <span className="inline-grid h-9 w-9 place-items-center rounded-full border border-violet-200/24 bg-violet-400/12 text-xs font-black text-violet-100">
                {scene.step}
              </span>
              <h2 className="landing-keep-words mt-5 text-3xl font-black leading-tight tracking-normal text-white">{scene.title}</h2>
              <div className="mt-6 h-[28rem] overflow-hidden rounded-[8px] border border-white/10 bg-[#090b10]/90">
                {index === 0 ? <DigitizeScene progress={1} /> : null}
                {index === 1 ? <ContentCreationScene progress={1} /> : null}
                {index === 2 ? <WrongAnswerScene progress={1} /> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div ref={pinRef} className="relative hidden h-screen min-h-[46rem] items-center overflow-hidden lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_28%,rgba(45,212,191,0.10),transparent_28rem),radial-gradient(circle_at_78%_40%,rgba(124,92,255,0.18),transparent_34rem),linear-gradient(180deg,rgba(6,7,13,0.14),rgba(6,7,13,0.88))]" />
        <div className="relative z-10 mx-auto grid w-full max-w-[104rem] gap-8 px-4 sm:px-6 lg:grid-cols-[0.42fr_0.58fr] lg:items-center xl:px-8">
          <div className="landing-keep-words max-w-[35rem]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200/80">Workflow</p>
            <div className="relative mt-5 min-h-[12rem]">
              {storyScenes.map((scene, index) => {
                const active = activeIndex === index;
                return (
                  <div
                    key={scene.title}
                    className="landing-story-copy absolute inset-0"
                    style={{
                      opacity: active ? 1 : 0,
                      transform: active ? "translate3d(0,0,0)" : "translate3d(0,1.5rem,0)",
                    }}
                  >
                    <span className="inline-grid h-9 w-9 place-items-center rounded-full border border-violet-200/24 bg-violet-400/12 text-xs font-black text-violet-100">
                      {scene.step}
                    </span>
                    <h2 className="mt-5 text-4xl font-black leading-tight tracking-normal text-white sm:text-5xl">{scene.title}</h2>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex gap-2">
              {storyScenes.map((scene, index) => (
                <span key={scene.step} className={cn("h-1.5 rounded-full transition-all duration-500", activeIndex === index ? "w-16 bg-violet-200" : "w-6 bg-white/18")} />
              ))}
            </div>
          </div>

          <div className="relative h-[34rem] rounded-[8px] border border-white/[0.08] bg-black/22 p-3 shadow-[0_34px_120px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:h-[40rem] sm:p-5">
            <StoryVisualScene active={activeIndex === 0}>
              <DigitizeScene progress={progressByScene[0]} />
            </StoryVisualScene>
            <StoryVisualScene active={activeIndex === 1}>
              <ContentCreationScene progress={progressByScene[1]} />
            </StoryVisualScene>
            <StoryVisualScene active={activeIndex === 2}>
              <WrongAnswerScene progress={progressByScene[2]} />
            </StoryVisualScene>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryVisualScene({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className="landing-story-visual absolute inset-3 overflow-hidden rounded-[8px] border border-white/10 bg-[#090b10]/90 sm:inset-5"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(0.985)",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

function DigitizeScene({ progress }: { progress: number }) {
  const paperShift = clampProgress(progress * 1.25);
  const consoleFill = clampProgress((progress - 0.34) / 0.5);

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_22%_22%,rgba(45,212,191,0.14),transparent_20rem),radial-gradient(circle_at_78%_38%,rgba(124,92,255,0.20),transparent_26rem),#07080d]">
      <div className="absolute left-[7%] top-[18%] h-[21rem] w-[14rem] sm:h-[27rem] sm:w-[18rem]">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="landing-story-paper absolute inset-0 rounded-[8px] border border-white/12 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.34)]"
            style={{
              transform: `translate3d(${paperShift * (145 + index * 12)}%, ${index * 1.25 - paperShift * 7}rem, 0) rotate(${index * -4 + paperShift * 5}deg) scale(${1 - paperShift * 0.48})`,
              opacity: 1 - paperShift * 0.72,
            }}
          >
            <div className="m-4 h-5 w-20 rounded bg-slate-900/80" />
            <div className="mx-4 mt-6 space-y-3">
              <span className="block h-2 w-10/12 rounded bg-slate-300" />
              <span className="block h-2 w-8/12 rounded bg-slate-300" />
              <span className="block h-16 rounded border border-slate-200 bg-slate-50" />
              <span className="block h-2 w-9/12 rounded bg-slate-300" />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute left-1/2 top-1/2 w-[70%] max-w-[38rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[10px] border border-white/12 bg-[#0a0c13]/95 shadow-[0_30px_90px_rgba(0,0,0,0.42)]">
        <div className="flex h-11 items-center justify-between border-b border-white/10 bg-black/45 px-3">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-200">Tena Console</span>
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" />
        </div>
        <div className="grid min-h-[22rem] gap-3 p-4 sm:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[8px] border border-dashed border-cyan-200/22 bg-cyan-200/[0.04] p-4">
            <FileUp className="h-7 w-7 text-cyan-100" />
            <div className="mt-6 space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className="block h-2 rounded bg-cyan-100/20" style={{ width: `${88 - index * 12}%`, opacity: 0.35 + consoleFill * 0.55 }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[7px] border border-white/10 bg-white/[0.045] p-3"
                style={{
                  opacity: clampProgress((consoleFill - index * 0.06) / 0.35),
                  transform: `translateY(${(1 - clampProgress((consoleFill - index * 0.06) / 0.35)) * 18}px)`,
                }}
              >
                <span className="block h-2 w-8 rounded bg-violet-200/60" />
                <span className="mt-4 block h-2 w-full rounded bg-slate-500/42" />
                <span className="mt-2 block h-2 w-8/12 rounded bg-slate-500/26" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentCreationScene({ progress }: { progress: number }) {
  const selectProgress = clampProgress(progress * 1.55);
  const templateProgress = clampProgress((progress - 0.45) / 0.45);
  const cursorStyle: CSSProperties = {
    left: `${16 + selectProgress * 46}%`,
    top: `${70 - selectProgress * 43}%`,
    transform: `rotate(-13deg) scale(${1 + selectProgress * 0.06})`,
  };

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_30%_35%,rgba(124,92,255,0.22),transparent_24rem),radial-gradient(circle_at_82%_46%,rgba(45,212,191,0.09),transparent_22rem),#07080d]">
      <div className="absolute left-[5%] top-[12%] w-[42%] rounded-[10px] border border-white/10 bg-[#0b0d14]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.30)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-white">문항 보관함</span>
          <Archive className="h-4 w-4 text-violet-200" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, index) => {
            const selected = selectProgress > index * 0.08 + 0.12 && [0, 1, 3, 4].includes(index);
            return (
              <div key={index} className={cn("rounded-[7px] border p-3 transition", selected ? "border-violet-200/60 bg-violet-400/18" : "border-white/10 bg-white/[0.045]")}>
                <span className="block h-2 w-8 rounded bg-white/65" />
                <span className="mt-4 block h-2 w-full rounded bg-slate-500/36" />
                <span className="mt-2 block h-2 w-7/12 rounded bg-slate-500/24" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-[13%] left-[27%] rounded-[10px] border border-violet-200/24 bg-violet-400/12 px-4 py-3 shadow-[0_18px_54px_rgba(124,92,255,0.20)]">
        <span className="text-sm font-black text-white">선택 문항 4개</span>
      </div>
      <div className="landing-story-cursor" style={cursorStyle} />

      <div className="absolute right-[6%] top-[10%] h-[78%] w-[38%] rounded-[10px] border border-white/12 bg-[#0a0c13]/94 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.36)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-white">템플릿 출력</span>
          <FolderKanban className="h-4 w-4 text-violet-200" />
        </div>
        <div className="mx-auto mt-5 flex h-[82%] max-w-[18rem] items-start justify-center overflow-hidden rounded-[6px] bg-white text-slate-900 shadow-[0_18px_48px_rgba(0,0,0,0.30)]">
          <DemoExamPreview reveal={templateProgress} scale={0.34} />
        </div>
      </div>
    </div>
  );
}

function DemoExamPreview({ reveal, scale = 0.34 }: { reveal: number; scale?: number }) {
  const visibleCount = Math.min(demoProblems.length, Math.max(0, Math.ceil(reveal * demoProblems.length)));
  const page = {
    ...demoTemplateSet.pages[0],
    dynamicPlacements: {
      "region-problems": demoProblems.slice(0, visibleCount),
    },
  };

  return (
    <div
      className="transition"
      style={{
        opacity: clampProgress(reveal * 1.35),
        transform: `translateY(${(1 - clampProgress(reveal)) * 18}px)`,
      }}
    >
      <TemplatePageView templateSet={demoTemplateSet} page={page} scale={scale} scaleOrigin="top-left" selectedIds={[]} />
    </div>
  );
}

function WrongAnswerScene({ progress }: { progress: number }) {
  const gridProgress = clampProgress((progress - 0.18) / 0.42);
  const branchProgress = clampProgress((progress - 0.62) / 0.32);
  const statuses = Array.from({ length: 18 }).map((_, index) => {
    if (gridProgress > 0.88 && [4, 11, 16].includes(index)) return "missed";
    if (gridProgress > 0.52 && [2, 7, 13].includes(index)) return "wrong";
    return "correct";
  });

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_28%_26%,rgba(74,222,128,0.12),transparent_20rem),radial-gradient(circle_at_78%_36%,rgba(124,92,255,0.22),transparent_26rem),#07080d]">
      <div className="absolute left-[6%] top-[13%] w-[28%] rounded-[10px] border border-white/10 bg-[#0b0d14]/92 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xl font-black text-white">P1</span>
          <Users className="h-4 w-4 text-violet-200" />
        </div>
        <p className="mt-2 text-sm font-bold text-slate-400">4명</p>
        <div className="mt-5 space-y-2">
          {["이나은", "이수현", "이우노", "황지윤"].map((name, index) => (
            <div key={name} className={cn("rounded-[7px] border px-3 py-2 text-sm font-black", index === 0 ? "border-violet-200/44 bg-violet-400/16 text-white" : "border-white/10 bg-white/[0.045] text-slate-300")}>
              {name}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute left-[37%] top-[12%] w-[24%] rounded-[10px] border border-white/10 bg-[#0b0d14]/92 p-4">
        <span className="text-sm font-black text-white">시험 일정</span>
        <div className="mt-4 rounded-[8px] border border-violet-200/30 bg-violet-400/14 p-3">
          <span className="block text-sm font-black text-white">0527</span>
          <span className="mt-2 block h-2 w-10/12 rounded bg-slate-400/40" />
          <span className="mt-2 block h-2 w-7/12 rounded bg-slate-400/28" />
        </div>
      </div>

      <div className="absolute right-[7%] top-[13%] w-[33%] rounded-[10px] border border-white/12 bg-[#0a0c13]/95 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-white">오답 체크</span>
          <ClipboardCheck className="h-4 w-4 text-violet-200" />
        </div>
        <div className="mt-5 grid grid-cols-6 gap-2">
          {statuses.map((status, index) => (
            <span
              key={index}
              className={cn(
                "grid aspect-square place-items-center rounded-[6px] text-xs font-black text-white transition",
                status === "wrong" && "bg-orange-400",
                status === "missed" && "bg-rose-500",
                status === "correct" && "bg-emerald-400"
              )}
              style={{ opacity: clampProgress((gridProgress - index * 0.015) / 0.28) }}
            >
              {index + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute bottom-[12%] left-[36%] right-[7%] grid grid-cols-2 gap-3" style={{ opacity: branchProgress, transform: `translateY(${(1 - branchProgress) * 18}px)` }}>
        {["오답 시험지", "퀴즈 뷰"].map((label, index) => (
          <div key={label} className="rounded-[10px] border border-violet-200/24 bg-violet-400/12 p-4 shadow-[0_18px_54px_rgba(124,92,255,0.18)]">
            <span className="text-sm font-black text-white">{label}</span>
            {index === 0 ? (
              <div className="mt-3 h-28 overflow-hidden rounded-[6px] bg-white">
                <DemoExamPreview reveal={1} scale={0.13} />
              </div>
            ) : (
              <div className="mt-3 rounded-[10px] border border-white/10 bg-black/35 p-3">
                <span className="block text-xs font-bold text-violet-100">#2</span>
                <span className="mt-3 block h-2 w-full rounded bg-white/25" />
                <span className="mt-2 block h-2 w-7/12 rounded bg-white/16" />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <span className="h-8 rounded-[6px] bg-white/10" />
                  <span className="h-8 rounded-[6px] bg-violet-400/45" />
                </div>
              </div>
            )}
          </div>
        ))}
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
            <article key={plan.name} className={cn("landing-plan-card", planCardToneClass[plan.tone])}>
              <div className="relative z-10 flex w-full flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black text-white">{plan.name}</h3>
                    <p className="mt-2 text-xl font-black text-violet-50">{plan.price}</p>
                  </div>
                  {plan.featured ? <span className="rounded-[6px] bg-white/10 px-2.5 py-1 text-xs font-black text-white ring-1 ring-white/15">추천</span> : null}
                </div>
                <ul className="mt-6 space-y-3 text-sm font-semibold text-slate-200/90">
                  {plan.points.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-violet-100" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={cn(
                    "mt-auto inline-flex h-11 w-full items-center justify-center rounded-[7px] text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25",
                    planCtaToneClass[plan.tone]
                  )}
                >
                  {plan.cta}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
