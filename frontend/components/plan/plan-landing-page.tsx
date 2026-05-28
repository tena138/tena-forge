"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  Bell,
  BarChart3,
  CheckSquare,
  ChevronDown,
  Check,
  ClipboardCheck,
  Eye,
  FileUp,
  FolderKanban,
  FolderPlus,
  GraduationCap,
  Grid3X3,
  LayoutDashboard,
  List,
  PanelLeftClose,
  Search,
  Send,
  SlidersHorizontal,
  UserCircle,
  UserPlus,
  Users,
} from "lucide-react";

import { PLANS, formatKRW } from "@/lib/plan-pricing";
import { HOMEPAGE_BUSINESS_INFO_ROWS } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { SiteLogo } from "@/components/site-logo";
import { MathText } from "@/components/math-text";
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
    points: ["학생 키 5명", "소규모 수업", "표준 처리"],
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
  basic: "landing-plan-card-pro",
  pro: "landing-plan-card-basic",
};

const planCtaToneClass: Record<PlanCardTone, string> = {
  free: "border border-white/12 text-white hover:bg-white/[0.07]",
  basic: "bg-[linear-gradient(135deg,#7c5cff_0%,#8b6bff_48%,#c4b5fd_100%)] text-white shadow-[0_18px_54px_rgba(124,92,255,0.24)] hover:shadow-[0_22px_70px_rgba(124,92,255,0.34)]",
  pro: "bg-[linear-gradient(135deg,#2dd4bf_0%,#7c5cff_58%,#f472b6_100%)] text-white shadow-[0_18px_54px_rgba(20,184,166,0.18)] hover:shadow-[0_22px_64px_rgba(124,92,255,0.26)]",
};

const storyScenes = [
  { title: "오프라인 문항들을 한 곳에 전산화", eyebrow: "Private Studio", pageTitle: "문항 보관함", route: "/problems" },
  { title: "가장 빠르게 컨텐츠 제작", eyebrow: "Private Studio", pageTitle: "세트 제작", route: "/problem-sets/export" },
  { title: "오답 관리까지 꼼꼼하게", eyebrow: "Academy OS", pageTitle: "학생 관리", route: "/student-management" },
];

const mobileHeroStats = [
  ["PDF", "추출"],
  ["DB", "정리"],
  ["시험지", "제작"],
];

const mobileWorkflow = [
  {
    eyebrow: "01",
    title: "PDF를 올리면 문항 후보로 정리",
    body: "원본, 해설, 선택지, 이미지까지 검수 가능한 형태로 모읍니다.",
    icon: FileUp,
  },
  {
    eyebrow: "02",
    title: "필터로 필요한 문항만 고르기",
    body: "과목, 단원, 배치, 난이도를 조합해서 수업용 문항을 빠르게 찾습니다.",
    icon: Search,
  },
  {
    eyebrow: "03",
    title: "시험지와 학생 기록까지 연결",
    body: "선택한 문항은 자료로 내보내고, 결과는 오답 기록과 상담 흐름으로 이어집니다.",
    icon: CheckSquare,
  },
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
  title: "Tena Forge 기본 시험지",
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
      background: { color: "#f2f1f8" },
      elements: [
        {
          id: "header-date-box",
          type: "shape",
          name: "날짜 박스",
          shape: "rect",
          x: 58,
          y: 38,
          width: 224,
          height: 58,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          locked: true,
          hidden: false,
          style: { fill: "#f8f7fc", stroke: "#111827", strokeWidth: 2, radius: 0, borderStyle: "solid" },
        },
        {
          id: "header-title-box",
          type: "shape",
          name: "시험명 박스",
          shape: "rect",
          x: 282,
          y: 38,
          width: 250,
          height: 58,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          locked: true,
          hidden: false,
          style: { fill: "#e7e5ef", stroke: "#111827", strokeWidth: 2, radius: 0, borderStyle: "solid" },
        },
        {
          id: "header-logo-box",
          type: "shape",
          name: "브랜드 박스",
          shape: "rect",
          x: 532,
          y: 38,
          width: 204,
          height: 58,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          locked: true,
          hidden: false,
          style: { fill: "#f8f7fc", stroke: "#111827", strokeWidth: 2, radius: 0, borderStyle: "solid" },
        },
        {
          id: "header-date",
          type: "text",
          name: "날짜",
          text: "2026년 05월 25일",
          x: 58,
          y: 55,
          width: 224,
          height: 26,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: true,
          hidden: false,
          style: { color: "#111827", fontSize: 15, fontWeight: "bold", textAlign: "center", lineHeight: 1.35 },
        },
        {
          id: "header-title",
          type: "text",
          name: "시험명",
          text: "수학 실전 테스트",
          x: 322,
          y: 49,
          width: 170,
          height: 22,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: true,
          hidden: false,
          style: { color: "#111827", fontSize: 14, fontWeight: "bold", textAlign: "center", lineHeight: 1.35 },
        },
        {
          id: "header-time",
          type: "text",
          name: "제한 시간",
          text: "제한 시간 50분",
          x: 322,
          y: 72,
          width: 170,
          height: 18,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: true,
          hidden: false,
          style: { color: "#111827", fontSize: 11, fontWeight: "bold", textAlign: "center", lineHeight: 1.35 },
        },
        {
          id: "header-logo",
          type: "text",
          name: "로고",
          text: "Tena Forge",
          x: 548,
          y: 56,
          width: 174,
          height: 24,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: true,
          hidden: false,
          style: { color: "#111827", fontSize: 16, fontWeight: "bold", textAlign: "center", lineHeight: 1.35 },
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
          y: 124,
          width: 676,
          height: 846,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          locked: true,
          hidden: false,
          style: {},
          cardStyle: { fill: "#f8f7fc", stroke: "transparent", strokeWidth: 0, radius: 0 },
          numberStyle: { color: "#111827", fontSize: 13, fontWeight: "bold" },
          bodyStyle: { color: "#111827", fontSize: 12, lineHeight: 1.5 },
          answerSpaceStyle: { fill: "#f2f1f8", stroke: "#c7c3d7", strokeWidth: 1, borderStyle: "dashed", radius: 4 },
          columnDividerStyle: { stroke: "#111827", strokeWidth: 1, borderStyle: "solid" },
        },
        {
          id: "page-number",
          type: "pageNumber",
          name: "페이지 번호",
          format: "1 / 1",
          x: 337,
          y: 1018,
          width: 120,
          height: 28,
          rotation: 0,
          opacity: 1,
          zIndex: 3,
          locked: true,
          hidden: false,
          style: { color: "#64748b", fontSize: 11, textAlign: "center", fill: "transparent", stroke: "transparent" },
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

function interpolateTimeline(progress: number, points: Array<{ at: number; x: number; y: number }>) {
  if (progress <= points[0].at) return points[0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (progress <= next.at) {
      const segment = clampProgress((progress - previous.at) / Math.max(0.01, next.at - previous.at));
      return {
        at: progress,
        x: previous.x + (next.x - previous.x) * segment,
        y: previous.y + (next.y - previous.y) * segment,
      };
    }
  }
  return points[points.length - 1];
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

      <section className="relative min-h-[100svh] overflow-hidden pt-16 lg:min-h-screen">
        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[104rem] flex-col justify-start px-4 pb-10 pt-7 sm:px-6 lg:min-h-[calc(100vh-4rem)] lg:justify-center lg:py-10 xl:px-8">
          <div className="grid gap-7 lg:grid-cols-[minmax(21rem,0.55fr)_minmax(0,1.45fr)] lg:items-center">
            <div className="max-w-[34rem]">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200/90 drop-shadow-[0_0_16px_rgba(124,92,255,0.35)]">TENA FORGE</p>
              <h1 className="landing-hero-title landing-keep-words mt-4 bg-[linear-gradient(180deg,#ffffff_0%,#dcd7ff_50%,#a99cff_100%)] bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(124,92,255,0.20)]">
                <span className="block">혼자서도 빠르고,</span>
                <span className="block">강력하게</span>
              </h1>
              <p className="landing-keep-words mt-4 max-w-[31rem] text-base leading-7 text-[var(--landing-text-secondary)] sm:mt-5 sm:text-lg sm:leading-8">
                PDF 추출부터 문항 보관, 시험지 제작, 학생 오답 기록까지 이어지는 제작 콘솔.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 lg:hidden">
                {mobileHeroStats.map(([value, label]) => (
                  <div key={label} className="rounded-[8px] border border-white/10 bg-white/[0.045] px-3 py-2.5">
                    <p className="text-sm font-black text-white">{value}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
                <Link
                  href="/register?plan=free"
                  className="landing-motion-safe inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[8px] bg-[var(--landing-accent)] px-5 text-sm font-black text-white shadow-[0_18px_42px_rgba(124,92,255,0.36)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--landing-accent-hover)] hover:shadow-[0_22px_54px_rgba(124,92,255,0.44)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/35 active:scale-[0.98] sm:flex-none sm:px-6"
                >
                  무료로 시작하기 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login?redirect=/academy"
                  className="inline-flex h-12 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-slate-300 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25 sm:border-0 sm:bg-transparent sm:px-0"
                >
                  로그인
                </Link>
              </div>
            </div>

            <div className="lg:hidden">
              <MobileProductPreview />
            </div>
            <div className="hidden lg:block">
              <ProductPreview />
            </div>
          </div>
        </div>
      </section>

      <ScrollStorySection />
      <PlanSection />
      <LandingFooter />
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
          <Link href="/register?plan=free" className="landing-motion-safe inline-flex h-9 items-center rounded-[7px] bg-[var(--landing-accent)] px-3 text-white transition hover:-translate-y-0.5 hover:bg-[var(--landing-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/35 active:scale-[0.98] sm:px-4">
            <span className="sm:hidden">시작</span>
            <span className="hidden sm:inline">무료로 시작하기</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#07080d]">
      <div className="mx-auto grid w-full max-w-[104rem] gap-5 px-4 py-8 text-sm text-slate-500 sm:px-6 xl:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/tenaforge-mark-dark.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
            <span className="font-semibold text-slate-300">Tena Forge</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/terms" className="hover:text-slate-300">
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-slate-300">
              개인정보처리방침
            </Link>
            <Link href="/copyright-policy" className="hover:text-slate-300">
              저작권 정책
            </Link>
          </div>
        </div>

        <dl className="grid gap-x-5 gap-y-1 text-[11px] leading-5 sm:grid-cols-2 lg:grid-cols-3">
          {HOMEPAGE_BUSINESS_INFO_ROWS.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-wrap gap-x-1.5">
              <dt className="shrink-0 text-slate-600">{label}</dt>
              <dd className="min-w-0 break-words text-slate-400">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
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

              <div className="p-5">
                <DemoProblemBrowserSurface progress={1} selectedNumbers={[1, 2, 3]} showSelectionBar cardCount={6} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileProductPreview() {
  const previewSteps: Array<[string, string, IconComponent, string]> = [
    ["PDF 업로드", "모의고사_수학.pdf", FileUp, "bg-violet-400/15 text-violet-100 border-violet-300/20"],
    ["문항 검수", "58문항 · 태그 대기", ClipboardCheck, "bg-cyan-400/12 text-cyan-100 border-cyan-300/20"],
    ["시험지 제작", "선택 12문항", Send, "bg-emerald-400/12 text-emerald-100 border-emerald-300/20"],
  ];

  return (
    <section className="relative overflow-hidden rounded-[10px] border border-white/10 bg-[#090b12]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(124,92,255,0.18),transparent_13rem),radial-gradient(circle_at_92%_18%,rgba(45,212,191,0.12),transparent_12rem)]" />
      <div className="relative z-10 border-b border-white/10 px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-200">Private Studio</p>
            <h2 className="mt-1 truncate text-sm font-black text-white">오늘 만들 자료</h2>
          </div>
          <span className="rounded-[7px] border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-100">3단계</span>
        </div>
      </div>

      <div className="relative z-10 space-y-3 p-3.5">
        {previewSteps.map(([title, body, Icon, tone]) => (
          <div key={title} className={cn("flex items-center gap-3 rounded-[8px] border bg-white/[0.035] p-3", tone)}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[7px] border border-white/10 bg-black/20">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{title}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{body}</p>
            </div>
          </div>
        ))}

        <div className="rounded-[8px] border border-white/10 bg-black/24 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-400">문항 브라우저</p>
            <span className="text-[11px] font-semibold text-violet-200">실시간 선택</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, index) => {
              const active = [0, 2, 5].includes(index);
              return (
                <span
                  key={index}
                  className={cn(
                    "grid aspect-square place-items-center rounded-[7px] border text-xs font-black",
                    active ? "border-violet-300/40 bg-violet-500/25 text-white" : "border-white/10 bg-white/[0.04] text-slate-500"
                  )}
                >
                  {index + 1}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
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
        onRefresh: (self) => setProgress(clampProgress(self.progress)),
      });
      const frames: number[] = [];
      const timeouts: number[] = [];
      let resizeObserver: ResizeObserver | undefined;
      const refresh = () => {
        if (cancelled) return;
        ScrollTrigger.refresh();
        setProgress(clampProgress(trigger.progress));
      };
      const scheduleRefresh = () => {
        if (cancelled) return;
        const firstFrame = window.requestAnimationFrame(() => {
          const secondFrame = window.requestAnimationFrame(refresh);
          frames.push(secondFrame);
        });
        frames.push(firstFrame);
      };
      scheduleRefresh();
      timeouts.push(window.setTimeout(scheduleRefresh, 180));
      timeouts.push(window.setTimeout(scheduleRefresh, 720));
      if (document.readyState === "complete") scheduleRefresh();
      else window.addEventListener("load", scheduleRefresh, { once: true });
      void document.fonts?.ready.then(scheduleRefresh).catch(() => undefined);
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(scheduleRefresh);
        resizeObserver.observe(section);
        resizeObserver.observe(pin);
      }
      cleanup = () => {
        window.removeEventListener("load", scheduleRefresh);
        resizeObserver?.disconnect();
        timeouts.forEach((timeout) => window.clearTimeout(timeout));
        frames.forEach((frame) => window.cancelAnimationFrame(frame));
        trigger.kill();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const activeIndex = activeStoryIndex(progress);
  const progressByScene = storyScenes.map((_, index) => sceneProgress(progress, index));

  return (
    <section ref={sectionRef} className="relative z-10 bg-transparent">
      <MobileWorkflowSection />

      <div ref={pinRef} className="relative hidden h-screen min-h-[46rem] overflow-hidden lg:block">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(45,212,191,0.09),transparent_28rem),radial-gradient(circle_at_80%_42%,rgba(124,92,255,0.18),transparent_34rem),linear-gradient(180deg,rgba(6,7,13,0.10),rgba(6,7,13,0.78))]" />
        <div className="absolute inset-0">
            <StoryStageScene active={activeIndex === 0}>
              <DigitizeScene progress={progressByScene[0]} />
            </StoryStageScene>
            <StoryStageScene active={activeIndex === 1}>
              <ContentCreationScene progress={progressByScene[1]} />
            </StoryStageScene>
            <StoryStageScene active={activeIndex === 2}>
              <WrongAnswerScene progress={progressByScene[2]} />
            </StoryStageScene>
        </div>
      </div>
    </section>
  );
}

function MobileWorkflowSection() {
  return (
    <div className="relative z-10 bg-[#07080d]/70 px-4 py-12 sm:px-6 lg:hidden">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Workflow</p>
        <h2 className="landing-keep-words mt-3 text-[2rem] font-black leading-tight tracking-normal text-white">
          수업 준비는 세 단계면 충분합니다.
        </h2>
        <p className="landing-keep-words mt-3 text-sm leading-6 text-slate-400">
          PDF를 올리고, 문항을 고르고, 바로 수업 자료로 이어갑니다.
        </p>

        <div className="mt-6 space-y-3">
          {mobileWorkflow.map(({ eyebrow, title, body, icon: Icon }) => (
            <article key={title} className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
                  <h3 className="landing-keep-words mt-1 text-base font-black leading-6 text-white">{title}</h3>
                  <p className="landing-keep-words mt-2 text-sm leading-6 text-slate-400">{body}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryStageScene({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className="landing-story-visual absolute inset-0 overflow-hidden"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(1.015)",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

function StoryCaption({
  tag,
  children,
  progress,
  className,
}: {
  tag: string;
  children: ReactNode;
  progress: number;
  className: string;
}) {
  const visible = clampProgress((progress - 0.55) / 0.12) * (1 - clampProgress((progress - 0.96) / 0.04));
  return (
    <div
      className={cn("landing-keep-words pointer-events-none absolute z-30", className)}
      style={{
        opacity: visible,
        transform: `translateY(${(1 - visible) * 24}px)`,
      }}
    >
      <span className="block text-xs font-black uppercase tracking-[0.42em] text-cyan-200">{tag}</span>
      <div className="mt-3 max-w-[42rem] text-[clamp(2rem,4.5vw,4rem)] font-black leading-[1.08] tracking-normal text-white drop-shadow-[0_0_42px_rgba(124,92,255,0.45)]">
        {children}
      </div>
    </div>
  );
}

function DigitizeVisualScene({ active, scene, progress }: { active: boolean; scene: (typeof storyScenes)[number]; progress: number }) {
  const expandProgress = clampProgress((progress - 0.31) / 0.2);
  const consoleScale = 0.32 + expandProgress * 0.68;
  const consoleDriftX = (1 - expandProgress) * 7;
  const consoleDriftY = (1 - expandProgress) * 1.2;

  return (
    <div
      className="landing-story-visual absolute inset-3 overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#05070d]/80 sm:inset-5"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(0.985)",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_48%,rgba(45,212,191,0.10),transparent_20rem),radial-gradient(circle_at_64%_42%,rgba(124,92,255,0.18),transparent_28rem),#05070d]" />
      <DigitizePaperStack progress={progress} />
      <div
        className="absolute inset-0 overflow-hidden rounded-[8px] border border-white/10 bg-[#090b10]/95 shadow-[0_34px_120px_rgba(0,0,0,0.44)]"
        style={{
          transform: `translate3d(${consoleDriftX}%, ${consoleDriftY}rem, 0) scale(${consoleScale})`,
          transformOrigin: "50% 48%",
        }}
      >
        <StoryConsoleFrame scene={scene}>
          <DigitizeScene progress={progress} />
        </StoryConsoleFrame>
      </div>
    </div>
  );
}

function StoryVisualScene({ active, scene, children }: { active: boolean; scene: (typeof storyScenes)[number]; children: ReactNode }) {
  return (
    <div
      className="landing-story-visual absolute inset-3 overflow-hidden rounded-[8px] border border-white/10 bg-[#090b10]/90 sm:inset-5"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(0.985)",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      <StoryConsoleFrame scene={scene}>{children}</StoryConsoleFrame>
    </div>
  );
}

function StoryConsoleFrame({ scene, children }: { scene: (typeof storyScenes)[number]; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#090b10]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/55 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <SiteLogo className="h-9" />
          <span className="hidden min-w-0 border-l border-white/10 pl-3 text-xs font-semibold tracking-normal text-slate-400 sm:inline">제작 콘솔</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-[7px] border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-bold text-slate-300 sm:inline-flex">{scene.route}</span>
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.75)]" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-black/45 px-1.5 py-3 shadow-[8px_0_32px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-2">
          <SidebarGroup
            title="Private Studio"
            accent="bg-violet-400"
            panel="border-violet-400/20 bg-violet-400/[0.055]"
            items={[
              ["제작 콘솔", LayoutDashboard, scene.eyebrow === "Private Studio" && scene.route === "/problems"],
              ["추출", FileUp, false],
              ["검토", ClipboardCheck, false],
              ["보관", Archive, scene.route === "/problems"],
              ["세트", FolderKanban, scene.route.includes("problem-sets")],
            ]}
          />
          <SidebarGroup
            title="Academy OS"
            accent="bg-sky-300"
            panel="border-sky-300/20 bg-sky-300/[0.045]"
            items={[
              ["학생 관리", GraduationCap, scene.route === "/student-management"],
              ["클래스", Users, scene.route === "/student-management"],
            ]}
          />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col bg-[#090b10]/[0.92]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-200">{scene.eyebrow}</p>
              <p className="mt-0.5 text-sm font-black text-slate-100">{scene.pageTitle}</p>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.7)]" />
              <span className="text-xs font-bold text-slate-400">Live preview</span>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
        </section>
      </div>
    </div>
  );
}

function DigitizePaperStack({ progress }: { progress: number }) {
  const intakeProgress = clampProgress(progress / 0.34);
  const scanProgress = clampProgress((progress - 0.06) / 0.22);
  const paperOpacity = 1 - clampProgress((intakeProgress - 0.72) / 0.2);

  return (
    <div className="pointer-events-none absolute left-[10%] top-[34%] z-20 h-[18rem] w-[12.5rem]">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="landing-story-paper absolute inset-0 rounded-[8px] border border-white/12 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.34)]"
          style={{
            transform: `translate3d(${intakeProgress * (375 + index * 8)}%, ${index * 0.9 - intakeProgress * 0.9}rem, 0) rotate(${index * -4 + intakeProgress * 8}deg) scale(${1 - intakeProgress * 0.58})`,
            opacity: paperOpacity,
          }}
        >
          <div className="m-4 h-5 w-20 rounded bg-slate-900/80" />
          <div className="mx-4 mt-6 space-y-3">
            <span className="block h-2 w-10/12 rounded bg-slate-300" />
            <span className="block h-2 w-8/12 rounded bg-slate-300" />
            <span className="block h-16 rounded border border-slate-200 bg-slate-50" />
            <span className="block h-2 w-9/12 rounded bg-slate-300" />
          </div>
          <span
            className="absolute left-0 right-0 h-10 bg-[linear-gradient(180deg,transparent,rgba(45,212,191,0.34),transparent)]"
            style={{
              top: `${scanProgress * 78 + 4}%`,
              opacity: scanProgress > 0 && scanProgress < 1 ? 0.75 : 0,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function DigitizeScene({ progress }: { progress: number }) {
  const paperIn = clampProgress(progress / 0.08);
  const scanProgress = clampProgress((progress - 0.08) / 0.22);
  const absorbProgress = clampProgress((progress - 0.22) / 0.22);
  const loadingProgress = clampProgress((progress - 0.42) / 0.24);
  const burstProgress = Math.sin(clampProgress((progress - 0.73) / 0.12) * Math.PI);
  const gridProgress = clampProgress((progress - 0.82) / 0.18);
  const consoleProgress = clampProgress((progress - 0.76) / 0.14);
  const pointOpacity = clampProgress((progress - 0.32) / 0.08) * (1 - clampProgress((progress - 0.66) / 0.08));
  const documents = [
    { x: -30, y: -17, rotate: -13, width: 9.4, height: 12.8, accent: "#6b6f8c" },
    { x: -14, y: -22, rotate: 7, width: 8.8, height: 12, accent: "#7c5cff" },
    { x: 5, y: -15, rotate: -5, width: 9.6, height: 13.2, accent: "#2dd4bf" },
    { x: -24, y: 5, rotate: 11, width: 8.7, height: 11.8, accent: "#3b6ff5" },
    { x: -2, y: 6, rotate: -9, width: 9.2, height: 12.4, accent: "#a24bff" },
    { x: 18, y: 8, rotate: 12, width: 8.4, height: 11.5, accent: "#6b6f8c" },
    { x: -12, y: 23, rotate: -6, width: 9, height: 12.2, accent: "#2dd4bf" },
  ];

  return (
    <div className="relative h-full overflow-hidden bg-transparent">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.42),rgba(45,212,191,0.12)_38%,transparent_70%)] blur-3xl"
        style={{
          opacity: 0.2 + burstProgress * 0.58,
          transform: `translate(-50%, -50%) scale(${1 + burstProgress * 0.34})`,
        }}
      />

      {documents.map((document, index) => {
        const startX = document.x;
        const startY = document.y;
        const endX = -2;
        const endY = -6;
        const radiusBase = 10.5 - index * 0.55;
        const positionAt = (value: number) => {
          const radius = Math.sin(value * Math.PI) * radiusBase;
          const angle = value * Math.PI * 2.7 + index * 0.86;
          return {
            x: startX + (endX - startX) * value + Math.cos(angle) * radius,
            y: startY + (endY - startY) * value + Math.sin(angle) * radius * 0.56,
          };
        };
        const currentPosition = positionAt(absorbProgress);
        const nextPosition = positionAt(Math.min(1, absorbProgress + 0.015));
        const flowRotation = Math.atan2(nextPosition.y - currentPosition.y, nextPosition.x - currentPosition.x) * (180 / Math.PI) - 90;
        const flowInfluence = clampProgress((absorbProgress - 0.08) / 0.72);
        const rotation = document.rotate * (1 - flowInfluence) + flowRotation * flowInfluence + Math.sin(absorbProgress * Math.PI * 2 + index) * 4 * flowInfluence;
        const drift = Math.sin(progress * 5.2 + index * 1.7) * 5 * (1 - absorbProgress);
        const x = currentPosition.x;
        const y = currentPosition.y;
        const scale = paperIn * (1 - absorbProgress * 0.86);
        const opacity = paperIn * (1 - clampProgress((progress - 0.41) / 0.08));
        return (
          <div
            key={index}
            className="landing-story-paper absolute left-1/2 top-1/2 h-[13rem] w-[9.5rem] overflow-hidden rounded-[11px] border border-white/20 bg-[linear-gradient(160deg,#f3f3f9,#d4d4e2)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            style={{
              width: `${document.width}rem`,
              height: `${document.height}rem`,
              transform: `translate(calc(-50% + ${x}vw + ${drift}px), calc(-50% + ${y}vh + ${drift * 0.4}px)) rotate(${rotation}deg) scale(${scale})`,
              opacity,
              zIndex: 12 - index,
            }}
          >
            <div className="absolute left-4 top-4 h-3 w-20 rounded" style={{ backgroundColor: document.accent }} />
            <div className="absolute left-4 right-4 top-12 h-1.5 rounded bg-[#aeb0c4]" />
            <div className="absolute left-4 top-16 h-1.5 w-24 rounded bg-[#aeb0c4]" />
            <div className="absolute left-4 right-4 top-24 h-16 rounded border border-slate-300/60 bg-slate-50/70" />
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-1.5">
              <span className="h-7 rounded border border-slate-300/60 bg-slate-50/70" />
              <span className="h-7 rounded border border-slate-300/60 bg-slate-50/70" />
              <span className="h-7 rounded border border-slate-300/60 bg-slate-50/70" />
            </div>
            <div
              className="absolute left-0 right-0 h-5 bg-[linear-gradient(90deg,transparent,#2dd4bf,transparent)] shadow-[0_0_20px_#2dd4bf]"
              style={{
                top: `${scanProgress * 88}%`,
                opacity: scanProgress > 0 && scanProgress < 1 ? 1 : 0,
              }}
            />
          </div>
        );
      })}

      <div
        className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{
          opacity: pointOpacity,
          transform: `translate(-50%, -50%) scale(${0.82 + loadingProgress * 0.18 + burstProgress * 0.18})`,
        }}
      >
        <div
          className="relative grid h-24 w-24 place-items-center rounded-full border border-violet-200/18 bg-[#121326]/82 shadow-[0_0_45px_rgba(124,92,255,0.38)] backdrop-blur-xl"
          style={{ transform: `rotate(${loadingProgress * 540}deg)` }}
        >
          <span className="absolute inset-2 rounded-full border border-transparent border-t-cyan-300 border-r-violet-300 shadow-[0_0_22px_rgba(45,212,191,0.25)]" />
        </div>
        <div className="mt-4 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-black tracking-[0.12em] text-violet-100 shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur">
          문항 추출 중
        </div>
      </div>

      <DemoProblemBrowserSurface
        progress={clampProgress((progress - 0.84) / 0.16)}
        cardCount={6}
        className="absolute w-[66rem]"
        style={{
          left: "47%",
          top: "18%",
          opacity: consoleProgress,
          transform: `perspective(1400px) rotateY(${20 + (-27 * gridProgress)}deg) rotateX(3deg) scale(${0.56 + consoleProgress * 0.44})`,
          transformOrigin: "30% 50%",
        }}
      />

      <StoryCaption tag="Digitize" progress={progress} className="bottom-[14vh] left-[7vw]">
        오프라인 문항들을<br />한 곳에{" "}
        <span className="bg-[linear-gradient(100deg,#2dd4bf,#7c5cff)] bg-clip-text text-transparent">전산화</span>
      </StoryCaption>
    </div>
  );
}

function ContentCreationScene({ progress }: { progress: number }) {
  const selectedThresholds = new Map([
    [0, 0.11],
    [2, 0.22],
    [3, 0.34],
    [5, 0.46],
  ]);
  const selectedNumbers = Array.from(selectedThresholds.entries()).filter(([, threshold]) => progress >= threshold).map(([index]) => index + 1);
  const selectedCount = selectedNumbers.length;
  const sourceFade = 1 - clampProgress((progress - 0.55) / 0.18) * 0.72;
  const templateProgress = clampProgress((progress - 0.7) / 0.3);
  const sheetIntro = clampProgress((progress - 0.5) / 0.16);
  const cursorPoint = interpolateTimeline(progress, [
    { at: 0, x: 16, y: 48 },
    { at: 0.11, x: 16, y: 48 },
    { at: 0.22, x: 32, y: 48 },
    { at: 0.34, x: 32, y: 63 },
    { at: 0.46, x: 16, y: 78 },
    { at: 0.58, x: 43, y: 72 },
    { at: 0.7, x: 76, y: 28 },
    { at: 1, x: 84, y: 28 },
  ]);
  const cursorStyle: CSSProperties = {
    left: `${cursorPoint.x}%`,
    top: `${cursorPoint.y}%`,
    transform: `rotate(-13deg) scale(${1 + clampProgress(progress) * 0.06})`,
  };

  return (
    <div className="relative h-full overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute left-[55%] top-[28%] h-[35rem] w-[35rem] rounded-full bg-[radial-gradient(circle,rgba(59,111,245,0.26),rgba(124,92,255,0.12)_42%,transparent_70%)] blur-3xl" />

      <DemoProblemBrowserSurface
        progress={1}
        selectedNumbers={selectedNumbers}
        showSelectionBar={selectedCount > 0}
        cardCount={6}
        className="absolute w-[44rem]"
        style={{
          left: "7vw",
          top: "35%",
          opacity: sourceFade,
          transform: "perspective(1400px) rotateY(9deg) rotateX(2deg) scale(0.9)",
          transformOrigin: "0% 50%",
        }}
      />

      <div
        className="absolute left-[calc(50%_-_8rem)] top-[calc(50%_+_9rem)] rounded-[14px] border border-white/10 bg-white/[0.055] px-5 py-4 shadow-[0_18px_54px_rgba(124,92,255,0.20)] backdrop-blur-xl"
        style={{ opacity: 1 - clampProgress((progress - 0.6) / 0.12) }}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">Set</p>
        <p className="mt-1 text-4xl font-black text-white">
          {selectedCount}
          <span className="ml-1 text-sm font-bold text-slate-400">문항</span>
        </p>
      </div>

      <div className="landing-story-cursor" style={cursorStyle} />

      <div
        className="absolute right-[4vw] top-[13%] h-[78vh] w-[23rem]"
        style={{
          opacity: sheetIntro,
          transform: `perspective(1500px) rotateY(${-12 + sheetIntro * 8}deg) scale(${0.9 + sheetIntro * 0.1})`,
          transformOrigin: "60% 50%",
        }}
      >
        <div className="absolute -inset-8 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.18),transparent_70%)] blur-2xl" />
        <div className="relative h-full overflow-hidden rounded-[18px] bg-[#d9d8e7]/95 shadow-[0_40px_90px_rgba(0,0,0,0.55),0_0_60px_rgba(124,92,255,0.20)] ring-1 ring-white/20">
          <DemoExamPreview reveal={templateProgress} scale={0.47} />
          <span
            className="pointer-events-none absolute inset-y-0 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.68),transparent)]"
            style={{
              opacity: progress > 0.93 && progress < 1 ? 0.85 : 0,
              transform: `translateX(${-130 + clampProgress((progress - 0.93) / 0.07) * 300}%)`,
            }}
          />
        </div>
      </div>

      <StoryCaption tag="Create" progress={clampProgress((progress - 0.11) / 0.89)} className="left-[7vw] top-[16vh]">
        선택한 문항이<br />템플릿에{" "}
        <span className="bg-[linear-gradient(100deg,#2dd4bf,#7c5cff)] bg-clip-text text-transparent">그대로 출력</span>
      </StoryCaption>
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
        opacity: 1,
        transform: `translateY(${(1 - clampProgress(reveal)) * 5}px)`,
      }}
    >
      <TemplatePageView templateSet={demoTemplateSet} page={page} scale={scale} scaleOrigin="top-left" selectedIds={[]} />
    </div>
  );
}

function WrongAnswerScene({ progress }: { progress: number }) {
  const gridProgress = clampProgress((progress - 0.18) / 0.42);
  const branchProgress = clampProgress((progress - 0.62) / 0.32);
  const cursorPoint = interpolateTimeline(progress, [
    { at: 0, x: 12, y: 43 },
    { at: 0.15, x: 12, y: 43 },
    { at: 0.3, x: 39, y: 42 },
    { at: 0.5, x: 70, y: 42 },
    { at: 0.66, x: 51, y: 68 },
  ]);
  const statuses = Array.from({ length: 18 }).map((_, index) => {
    if (gridProgress > 0.88 && [4, 11, 16].includes(index)) return "missed";
    if (gridProgress > 0.52 && [2, 7, 13].includes(index)) return "wrong";
    return "correct";
  });

  return (
    <div className="relative h-full overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute left-[50%] top-[35%] h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.25),rgba(91,214,176,0.09)_42%,transparent_72%)] blur-3xl" />
      <DemoStudentManagementSurface
        progress={progress}
        gridProgress={gridProgress}
        branchProgress={branchProgress}
        statuses={statuses}
        className="absolute w-[76rem]"
        style={{
          left: "4vw",
          top: "15vh",
          opacity: clampProgress((progress - 0.02) / 0.1),
          transform: `perspective(1400px) rotateY(${9 - clampProgress(progress / 0.55) * 14}deg) rotateX(2deg) scale(${0.9 + clampProgress(progress / 0.44) * 0.1})`,
          transformOrigin: "20% 50%",
        }}
      />

      <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ opacity: branchProgress }}>
        <path d="M 50 63 C 38 73, 34 73, 27 78" fill="none" stroke="#3b6ff5" strokeWidth="0.35" strokeDasharray="1.4 1.4" opacity="0.6" />
        <path d="M 50 63 C 61 73, 66 73, 73 78" fill="none" stroke="#2dd4bf" strokeWidth="0.35" strokeDasharray="1.4 1.4" opacity="0.6" />
      </svg>

      <div className="absolute bottom-[12%] left-[26%] right-[15%] z-10 grid grid-cols-2 gap-6" style={{ opacity: branchProgress, transform: `translateY(${(1 - branchProgress) * 30}px) scale(${0.9 + branchProgress * 0.1})` }}>
        {["오답 시험지", "퀴즈 뷰"].map((label, index) => (
          <div key={label} className="rounded-[16px] border border-violet-200/20 bg-white/[0.055] p-5 shadow-[0_18px_54px_rgba(124,92,255,0.18)] backdrop-blur-xl">
            <span className="text-sm font-black text-white">{label}</span>
            {index === 0 ? (
              <DemoReviewPaperPreview />
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

      <div
        className="landing-story-cursor"
        style={{
          left: `${cursorPoint.x}%`,
          top: `${cursorPoint.y}%`,
          opacity: progress > 0.04 && progress < 0.66 ? 1 : 0,
          transform: "rotate(-13deg)",
        }}
      />

      <StoryCaption tag="Master" progress={progress} className="bottom-[13vh] left-[7vw]">
        오답 관리까지{" "}
        <span className="bg-[linear-gradient(100deg,#2dd4bf,#7c5cff)] bg-clip-text text-transparent">꼼꼼하게</span>
      </StoryCaption>
    </div>
  );
}

function DemoReviewPaperPreview() {
  return (
    <div className="mt-3 h-36 overflow-hidden rounded-[12px] border border-white/10 bg-[#0b0d15] p-3 shadow-inner shadow-black/30">
      <div className="relative mx-auto h-[7.25rem] w-[15rem] rounded-[10px] border border-slate-300/25 bg-[#f1eff8] p-3 text-[#20222d] shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
        <div className="grid grid-cols-[1fr_1.2fr_0.85fr] overflow-hidden rounded-[3px] border border-[#22242f] text-[8px] font-black">
          <div className="border-r border-[#22242f] px-2 py-1">REVIEW 01</div>
          <div className="border-r border-[#22242f] px-2 py-1 text-center">오답 시험지</div>
          <div className="px-2 py-1 text-center">Tena Forge</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[3, 8, 12, 17].map((number) => (
            <div key={number} className="min-h-8 rounded-[5px] border border-[#c8c5d5] bg-white/72 p-1.5">
              <div className="flex items-center gap-2">
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#7c5cff] text-[6px] font-black text-white">{number}</span>
                <span className="h-1 flex-1 rounded-full bg-[#323546]/35" />
              </div>
              <span className="mt-1.5 block h-1 w-10/12 rounded-full bg-[#323546]/20" />
              <span className="mt-1 block h-1 w-7/12 rounded-full bg-[#323546]/16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoStudentManagementSurface({
  progress,
  gridProgress,
  branchProgress,
  statuses,
  className,
  style,
}: {
  progress: number;
  gridProgress: number;
  branchProgress: number;
  statuses: string[];
  className?: string;
  style?: CSSProperties;
}) {
  const students = [
    { name: "학생 01", score: "50점", wrong: "4" },
    { name: "학생 02", score: "82점", wrong: "2" },
    { name: "학생 03", score: "76점", wrong: "3" },
    { name: "학생 04", score: "91점", wrong: "1" },
  ];
  const studentOpen = clampProgress((progress - 0.14) / 0.16);
  const gradingOpen = clampProgress((progress - 0.28) / 0.12);

  return (
    <section className={cn("space-y-4", className)} style={style}>
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-300">Student Management</span>
          <span className="text-sm text-slate-500">Class Dashboard</span>
        </div>
        <div className="flex gap-2">
          {[["클래스", "1"], ["학생", "4"]].map(([label, value]) => (
            <span key={label} className="flex min-w-[86px] items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <span className="text-xs text-slate-500">{label}</span>
              <span className="text-base font-black text-white">{value}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] shadow-[0_26px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="grid min-h-[180px] grid-cols-[28px_185px_minmax(0,1fr)]">
          <div className="flex items-center justify-center border-r border-white/10 text-slate-500">
            <span className="h-14 w-1 rounded-full bg-white/10" />
          </div>
          <aside className="flex flex-col justify-between border-r border-white/10 p-4">
            <div>
              <p className="text-4xl font-black tracking-normal text-white">CLASS</p>
              <p className="mt-5 text-3xl font-black text-slate-200">4</p>
              <p className="text-xs text-slate-500">학생</p>
              <p className="mt-3 truncate text-xs text-slate-500">수학 · N</p>
            </div>
            <div className="flex gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-md border border-violet-300/50 bg-violet-500/20 text-violet-100">
                <BarChart3 className="h-5 w-5" />
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-md border border-emerald-300/40 bg-emerald-500/15 text-emerald-100">
                <UserPlus className="h-5 w-5" />
              </span>
            </div>
          </aside>

          <div className="min-w-0 p-4">
            <div className="flex gap-3 overflow-hidden pb-1">
              {students.map((student, index) => (
                <div
                  key={student.name}
                  className={cn(
                    "w-[210px] shrink-0 rounded-md border bg-white/[0.035] p-3 transition",
                    index === 0 && progress > 0.1 ? "border-violet-300/45 bg-violet-500/10" : "border-white/[0.08]"
                  )}
                  style={{
                    opacity: clampProgress((progress - index * 0.035) / 0.22),
                    transform: `translateY(${(1 - clampProgress((progress - index * 0.035) / 0.22)) * 16}px)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{student.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">N</p>
                    </div>
                    <span className="shrink-0 rounded border border-emerald-300/25 bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-100">Active</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-md bg-white/[0.04] p-2">
                      <p className="text-slate-500">최근 점수</p>
                      <p className="mt-1 font-semibold text-white">{student.score}</p>
                    </div>
                    <div className="rounded-md bg-white/[0.04] p-2">
                      <p className="text-slate-500">오답</p>
                      <p className="mt-1 font-semibold text-rose-100">{student.wrong}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"
              style={{ opacity: studentOpen, transform: `translateY(${(1 - studentOpen) * 18}px)` }}
            >
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">채점할 세션</p>
                <div className="mt-3 rounded-md border border-violet-300/30 bg-violet-500/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-white">TEST 01</span>
                    <span className="rounded border border-violet-300/25 bg-violet-400/15 px-2 py-0.5 text-[11px] font-bold text-violet-100">grading</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">학생 01 · 18문항</p>
                </div>
              </div>

              <div
                className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
                style={{ opacity: gradingOpen, transform: `translateY(${(1 - gradingOpen) * 16}px)` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-white">TEST 01</p>
                    <p className="mt-1 text-xs text-slate-500">학생 01 · 18문항</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-bold text-slate-200">
                    <ClipboardCheck className="h-3.5 w-3.5 text-violet-200" />
                    저장됨
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-9 gap-2">
                  {statuses.map((status, index) => (
                    <span
                      key={index}
                      className="grid aspect-square place-items-center rounded-[9px] border text-xs font-black text-white transition"
                      style={{
                        opacity: clampProgress((gridProgress - index * 0.015) / 0.28),
                        background:
                          status === "wrong"
                            ? "rgba(217,154,91,0.22)"
                            : status === "missed"
                              ? "rgba(217,96,128,0.28)"
                              : "rgba(91,214,176,0.22)",
                        borderColor:
                          status === "wrong"
                            ? "rgba(217,154,91,0.50)"
                            : status === "missed"
                              ? "rgba(217,96,128,0.60)"
                              : "rgba(91,214,176,0.50)",
                        boxShadow:
                          status === "wrong"
                            ? "0 0 14px rgba(217,154,91,0.16)"
                            : status === "missed"
                              ? "0 0 16px rgba(217,96,128,0.26)"
                              : "0 0 14px rgba(91,214,176,0.14)",
                        transform:
                          (status === "wrong" || status === "missed") && branchProgress > 0
                            ? `translate(${branchProgress * (-70 + (index % 9) * 10)}px, ${branchProgress * 130}px) scale(${1 + branchProgress * 0.05})`
                            : undefined,
                        zIndex: status === "wrong" || status === "missed" ? 5 : 1,
                      }}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">초록: 정답</span>
                  <span className="rounded bg-orange-500/15 px-2 py-1 text-orange-100">오렌지: 오답</span>
                  <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">빨강: 못 풂</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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

function DemoProblemBrowserSurface({
  progress,
  selectedNumbers = [],
  className,
  style,
  showSelectionBar = false,
  cardCount = 6,
}: {
  progress: number;
  selectedNumbers?: number[];
  className?: string;
  style?: CSSProperties;
  showSelectionBar?: boolean;
  cardCount?: number;
}) {
  return (
    <div className={cn("space-y-4", className)} style={style}>
      <section className="forge-panel rounded-lg p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-white">문항 브라우저</h1>
            <p className="mt-1 text-sm text-muted-foreground">58개 문항</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300">
              정렬
              <span className="text-sm font-semibold text-white">원문 순</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </label>
            <div className="flex h-9 rounded-md border border-white/10 bg-white/[0.04] p-1">
              <span className="inline-flex items-center gap-1.5 rounded bg-[#7F77DD] px-2.5 text-xs font-semibold text-white">
                <Grid3X3 className="h-3.5 w-3.5" />격자
              </span>
              <span className="inline-flex items-center gap-1.5 rounded px-2.5 text-xs font-semibold text-muted-foreground">
                <List className="h-3.5 w-3.5" />목록
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-card/80 px-3">
          <Search className="h-4 w-4 text-[#7F77DD]" />
          <span className="text-sm text-muted-foreground">본문, 번호, 정답, 태그, 출처 검색</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center rounded-md border border-[#7F77DD]/25 bg-[#7F77DD]/10 px-2 text-xs font-semibold text-violet-100">검토 완료</span>
          <span className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            필터 펼치기
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </div>
      </section>

      {showSelectionBar ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#7F77DD]/30 bg-[#111022]/95 px-4 py-3 shadow-[0_18px_45px_rgba(30,22,64,0.32)] backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-100">
            <CheckSquare className="h-4 w-4 text-[#7F77DD]" />
            {selectedNumbers.length}개 선택됨
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#7F77DD] px-3 text-xs font-semibold text-white">
              <FolderPlus className="h-4 w-4" />세트에 담기
            </span>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200">
              <Send className="h-4 w-4" />바로 내보내기
            </span>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200">
              <Eye className="h-4 w-4" />미리보기
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: cardCount }).map((_, index) => {
          const number = index + 1;
          const cardProgress = clampProgress((progress - index * 0.035) / 0.22);
          return (
            <ProblemCard
              key={number}
              number={number}
              selected={selectedNumbers.includes(number)}
              style={{
                opacity: cardProgress,
                transform: `translateY(${(1 - cardProgress) * 16}px) scale(${0.94 + cardProgress * 0.06})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProblemCard({ number, selected, style }: { number: number; selected: boolean; style?: CSSProperties }) {
  const problem = demoProblems[(number - 1) % demoProblems.length];
  const toneColor = ["#7F77DD", "#5bd6b0", "#d99a5b", "#d96080"][number % 4];
  return (
    <article
      className={cn(
        "group relative min-h-[215px] overflow-hidden rounded-lg border bg-card/80 transition-all",
        selected ? "border-[#7F77DD] bg-[#7F77DD]/10 shadow-[0_0_0_1px_rgba(127,119,221,0.24)]" : "border-white/10"
      )}
      style={style}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: toneColor }} />
      <span className="absolute left-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded border border-white/15 bg-black/30 backdrop-blur">
        <span className={cn("h-4 w-4 rounded-[3px] border border-white/25", selected && "border-[#7F77DD] bg-[#7F77DD] shadow-[0_0_14px_rgba(127,119,221,0.55)]")} />
      </span>
      <div className="flex h-full flex-col px-4 pb-4 pl-6 pt-3">
        <div className="flex items-start justify-between gap-3 pl-8">
          <div className="min-w-0">
            <div className="line-clamp-1 text-[11px] font-medium leading-4 text-muted-foreground">2026 수학 워크북 / p.{number + 1}</div>
            <div className="mt-1 text-[13px] font-medium leading-5 text-slate-200">#{number}</div>
          </div>
          <span className="shrink-0 rounded border border-violet-300/25 bg-violet-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-100">수학</span>
        </div>
        <MathText className="mt-3 line-clamp-4 text-[14px] font-medium leading-[1.55] text-foreground" value={problem.text} />
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-[11px] font-medium text-muted-foreground">
          <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-slate-300">수학II</span>
          <span>{number + 1}p</span>
          <span className="text-slate-600">·</span>
          <span>{problem.choices?.length ? "객관식" : "주관식·단답형"}</span>
          <span className="text-slate-600">·</span>
          <span>검토 완료</span>
        </div>
      </div>
    </article>
  );
}

function PlanSection() {
  return (
    <section id="plans" className="landing-plan-section relative overflow-hidden px-4 py-20 sm:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(8,8,15,0),rgba(8,8,15,0.86)_72%,rgba(8,8,15,0))]" />
      <div className="pointer-events-none absolute left-[-12rem] top-16 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.14),transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute right-[-9rem] top-8 h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.26),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-28 h-px bg-[linear-gradient(90deg,transparent,rgba(45,212,191,0.24),rgba(124,92,255,0.42),transparent)]" />

      <div className="relative z-10 mx-auto w-full max-w-[104rem]">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-200/90">Plans</p>
            <h2 className="landing-keep-words mt-3 text-4xl font-black tracking-normal text-white sm:text-5xl">필요한 만큼만 확장</h2>
            <p className="landing-keep-words mt-3 text-sm font-semibold leading-6 text-slate-400 sm:text-base">
              무료로 시작하고, 수업 규모와 처리량에 맞춰 Basic 또는 Pro로 이어갑니다.
            </p>
          </div>
          <Link href="/pricing" className="landing-motion-safe inline-flex h-10 items-center gap-2 rounded-[7px] border border-white/12 bg-white/[0.035] px-4 text-sm font-black text-slate-100 shadow-[0_18px_42px_rgba(0,0,0,0.20)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/25">
            가격 보기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="landing-plan-rail mt-10 grid gap-4 lg:grid-cols-3">
          {planCards.map((plan) => (
            <article key={plan.name} className={cn("landing-plan-card", planCardToneClass[plan.tone])}>
              <div className="relative z-10 flex w-full flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black text-white">{plan.name}</h3>
                    <p className="mt-2 text-xl font-black text-violet-50">{plan.price}</p>
                  </div>
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
