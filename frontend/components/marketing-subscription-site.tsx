"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Gauge,
  HardDrive,
  Layers3,
  LockKeyhole,
  PackagePlus,
  Rocket,
  School,
  Sparkles,
  Store,
  Users,
  Zap
} from "lucide-react";

import { HOMEPAGE_BUSINESS_INFO_ROWS } from "@/lib/legal";
import { cn } from "@/lib/utils";

type PlanCode = "basic" | "pro";
type PackKey = "ai" | "storage" | "student" | "processing";

type PackOption = {
  id: string;
  name: string;
  label: string;
  description: string;
  detail: string;
};

type IconComponent = ComponentType<{ className?: string }>;

type PlanModel = {
  code: PlanCode;
  name: string;
  audience: string;
  headline: string;
  speed: "Standard" | "Fast";
  badge?: string;
  options: PackKey[];
  highlights: string[];
};

const models: PlanModel[] = [
  {
    code: "basic",
    name: "Basic",
    audience: "개인 과외 교습자용",
    headline: "혼자 운영하는 수업 자료 제작실",
    speed: "Standard",
    options: ["ai", "storage", "student"],
    highlights: ["AI Pack", "Storage Pack", "Student Pack", "PDF 추출 가능", "워터마크 없음"]
  },
  {
    code: "pro",
    name: "Pro",
    audience: "전문 교습자, 학원, 콘텐츠팀용",
    headline: "대량 추출과 판매까지 열리는 제작 환경",
    speed: "Fast",
    badge: "추천",
    options: ["ai", "storage", "student", "processing"],
    highlights: ["Fast 처리 속도", "여러 PDF 동시 추출", "배치 처리", "마켓플레이스", "워터마크 없음"]
  }
];

const packOptions: Record<PackKey, PackOption[]> = {
  ai: [
    {
      id: "ai-s",
      name: "AI Pack S",
      label: "가벼운 주간 제작",
      description: "소량 PDF 추출과 문제 정리에 맞춘 시작 패키지",
      detail: "월 AI credits 중심의 시작 패키지"
    },
    {
      id: "ai-m",
      name: "AI Pack M",
      label: "정기 수업 제작",
      description: "매주 여러 수업 자료를 만들고 검수하는 표준 패키지",
      detail: "정기 제작에 맞춘 월 AI credits"
    },
    {
      id: "ai-l",
      name: "AI Pack L",
      label: "집중 제작 기간",
      description: "문제 DB 구축, 대량 PDF 추출, 재가공이 잦은 운영용",
      detail: "집중 제작 기간을 위한 높은 월 AI credits"
    }
  ],
  storage: [
    {
      id: "storage-s",
      name: "Storage Pack S",
      label: "개인 자료 보관",
      description: "과외 자료와 생성물을 가볍게 정리",
      detail: "낮은 저장공간"
    },
    {
      id: "storage-m",
      name: "Storage Pack M",
      label: "과목별 아카이브",
      description: "학생별, 단원별, 시험지별 자료를 안정적으로 보관",
      detail: "중간 저장공간"
    },
    {
      id: "storage-l",
      name: "Storage Pack L",
      label: "학원형 라이브러리",
      description: "팀 단위 자료실과 장기 보관에 맞춘 저장공간",
      detail: "높은 저장공간"
    }
  ],
  student: [
    {
      id: "student-10",
      name: "Student Pack 10",
      label: "소수 정예",
      description: "개인 과외와 소규모 그룹 수업에 맞춘 학생 키",
      detail: "학생 키 10개 단위"
    },
    {
      id: "student-30",
      name: "Student Pack 30",
      label: "정규 반 운영",
      description: "여러 반과 과목을 함께 운영하는 교습자용",
      detail: "학생 키 30개 단위"
    },
    {
      id: "student-100",
      name: "Student Pack 100",
      label: "학원 운영",
      description: "학원, 콘텐츠팀, 대형 클래스 운영에 맞춘 패키지",
      detail: "학생 키 100개 단위"
    }
  ],
  processing: [
    {
      id: "processing-standard",
      name: "Processing Standard+",
      label: "기본 동시 작업",
      description: "Fast 처리 속도에서 안정적으로 여러 작업을 운용",
      detail: "동시 작업 수 기본 확장"
    },
    {
      id: "processing-batch",
      name: "Processing Batch",
      label: "여러 PDF 동시 추출",
      description: "여러 PDF를 병렬로 올리고 배치로 검수하는 운영용",
      detail: "배치 처리와 동시 추출"
    },
    {
      id: "processing-priority",
      name: "Processing Priority",
      label: "집중 처리",
      description: "시험 기간, 교재 제작 시즌처럼 처리량이 몰리는 팀용",
      detail: "더 높은 동시 작업 수"
    }
  ]
};

const packLabels: Record<PackKey, string> = {
  ai: "AI Pack",
  storage: "Storage Pack",
  student: "Student Pack",
  processing: "Processing Pack"
};

const defaultSelections: Record<PlanCode, Record<PackKey, string>> = {
  basic: {
    ai: "ai-m",
    storage: "storage-m",
    student: "student-10",
    processing: "processing-standard"
  },
  pro: {
    ai: "ai-m",
    storage: "storage-m",
    student: "student-30",
    processing: "processing-batch"
  }
};

const workflow = [
  ["01", "PDF 업로드", "교재, 답안, 모의고사 PDF를 수업 자료 후보로 모읍니다."],
  ["02", "AI 추출", "문항, 답안, 지문, 이미지를 문제 DB 형태로 정리합니다."],
  ["03", "검수와 편집", "오류를 고치고 단원, 난이도, 학생별 태그를 붙입니다."],
  ["04", "출력과 운영", "워크시트, 시험지, 학생 앱, 마켓플레이스로 확장합니다."]
];

const productSignals: Array<[string, string, IconComponent]> = [
  ["PDF 추출", "모든 플랜에서 가능", FileText],
  ["AI credits", "추출량은 페이지가 아니라 credits로 관리", Sparkles],
  ["처리 속도", "Basic은 Standard, Pro는 Fast", Gauge],
  ["마켓플레이스", "Pro부터 판매와 배포 확장", Store]
];

const enterpriseFeatures: Array<[string, string, IconComponent]> = [
  ["AI 운영량", "월 credits 커스텀", Sparkles],
  ["문제 DB", "기관형 아카이브와 검수 정책", Layers3],
  ["학생 키", "대규모 학생 접근 권한 설계", Users],
  ["처리 인프라", "동시 작업 수와 우선 처리 속도", Rocket],
  ["보안 정책", "기관 계약과 권한 운영", LockKeyhole],
  ["저장공간", "장기 보관과 자료실 구조", HardDrive]
];

function selectedOption(pack: PackKey, selectedId: string) {
  return packOptions[pack].find((option) => option.id === selectedId) ?? packOptions[pack][0];
}

export function MarketingSubscriptionSite() {
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("pro");
  const [selections, setSelections] = useState(defaultSelections);

  const model = useMemo(() => models.find((item) => item.code === selectedPlan) ?? models[1], [selectedPlan]);
  const currentSelections = selections[selectedPlan];
  const selectedPacks = model.options.map((pack) => [pack, selectedOption(pack, currentSelections[pack])] as const);

  function updateSelection(pack: PackKey, id: string) {
    setSelections((current) => ({
      ...current,
      [selectedPlan]: {
        ...current[selectedPlan],
        [pack]: id
      }
    }));
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#07080d] text-white">
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#07080d]/76 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-start gap-3 px-4 sm:px-6 md:justify-between">
          <Link href="/" className="inline-flex h-11 min-w-0 items-center" aria-label="Tena Forge">
            <img src="/tenaforgelogo-dark.png" alt="Tena Forge" className="h-9 w-auto max-w-[8.75rem] object-contain sm:max-w-none" />
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-300 md:flex">
            <a href="#workflow" className="transition hover:text-white">흐름</a>
            <a href="#plans" className="transition hover:text-white">구독 구성</a>
            <a href="#enterprise" className="transition hover:text-white">Enterprise</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login?redirect=/academy" className="hidden h-9 items-center rounded-[7px] px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">
              로그인
            </Link>
            <Link href="/register" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[7px] bg-white px-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100">
              <span className="sm:hidden">시작</span>
              <span className="hidden sm:inline">무료로 시작</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative min-h-[88vh] overflow-hidden pt-16">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,13,0.15),#07080d_88%)]" />
          <div className="absolute left-1/2 top-16 h-[42rem] w-[72rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute right-[-12rem] top-28 h-[30rem] w-[30rem] rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute left-[-10rem] top-48 h-[26rem] w-[26rem] rounded-full bg-violet-500/14 blur-3xl" />
          <HeroWorkbench />
        </div>
        <div className="relative z-10 mx-auto flex min-h-[calc(88vh-4rem)] max-w-7xl flex-col justify-center px-4 py-20 sm:px-6">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              AI credits 기반 PDF 추출과 문제 DB 운영
            </div>
            <h1 className="mt-7 max-w-[22rem] text-[2.6rem] font-black leading-[1.08] tracking-normal text-white sm:max-w-4xl sm:text-5xl sm:leading-[1.06] lg:text-6xl">
              <span className="block">
                <span className="block sm:inline">PDF를</span>
                <span className="block sm:inline"> 문제 DB로,</span>
              </span>
              <span className="block text-cyan-100">
                <span className="block sm:inline">수업 자료를</span>
                <span className="block sm:inline"> 완성본으로.</span>
              </span>
            </h1>
            <p className="mt-6 max-w-[22rem] break-words text-base leading-8 text-slate-300 [overflow-wrap:anywhere] sm:max-w-2xl sm:text-lg">
              Tena Forge는 과외 교습자와 학원이 PDF를 추출하고, 문항을 검수하고,
              학생별 자료와 마켓플레이스 운영까지 이어가도록 설계된 교육 콘텐츠 제작 환경입니다.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/plan" className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-cyan-200 px-5 text-sm font-black text-slate-950 transition hover:bg-white">
                구독 구성하기 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login?redirect=/academy" className="inline-flex h-12 items-center gap-2 rounded-[8px] border border-white/12 bg-white/[0.06] px-5 text-sm font-bold text-white transition hover:bg-white/[0.10]">
                작업실로 이동
              </Link>
            </div>
          </div>
          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {productSignals.map(([title, body, Icon]) => (
              <div key={title} className="min-h-28 rounded-[8px] border border-white/10 bg-black/32 p-4 backdrop-blur-md">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-white/10 bg-white/[0.06] text-cyan-100">
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-white">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-white/10 bg-[#0b1117]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Workflow</p>
            <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-4xl">
              PDF 추출 이후의 운영까지 한 흐름으로 묶습니다.
            </h2>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-4">
            {workflow.map(([number, title, body]) => (
              <div key={number} className="min-h-48 rounded-[8px] border border-white/10 bg-white/[0.045] p-5">
                <div className="text-sm font-black text-cyan-100">{number}</div>
                <h3 className="mt-8 text-lg font-bold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="bg-[#080a0f]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div>
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Build Your Plan</p>
                <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-5xl">
                  모델을 고르고, 큰 패키지만 선택하세요.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-400">
                  Free는 무료 가입 후 기본 체험 상태로 두고, 유료 화면에서는 Basic과 Pro만 구성합니다.
                  세부 항목 직접 커스텀은 Enterprise 전용입니다.
                </p>
              </div>

              <div className="mt-10">
                <SectionLabel icon={PackagePlus} title="1. 모델 선택" />
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {models.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setSelectedPlan(item.code)}
                      className={cn(
                        "min-h-64 rounded-[8px] border p-5 text-left transition",
                        selectedPlan === item.code
                          ? "border-cyan-200 bg-cyan-200/10 shadow-[0_18px_48px_rgba(34,211,238,0.12)]"
                          : "border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.07]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-400">{item.audience}</div>
                          <h3 className="mt-2 text-3xl font-black text-white">{item.name}</h3>
                        </div>
                        {item.badge && (
                          <span className="rounded-[6px] bg-emerald-300 px-2 py-1 text-xs font-black text-slate-950">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-4 text-lg font-bold text-cyan-100">{item.headline}</p>
                      <div className="mt-5 inline-flex items-center gap-2 rounded-[7px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200">
                        <Gauge className="h-4 w-4 text-cyan-100" />
                        {item.speed} 처리 속도
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {item.highlights.map((highlight) => (
                          <span key={highlight} className="rounded-[6px] border border-white/10 bg-white/[0.05] px-2 py-1 text-xs font-semibold text-slate-300">
                            {highlight}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-10 space-y-10">
                {(["ai", "storage", "student", "processing"] as PackKey[]).map((pack, index) => {
                  const available = model.options.includes(pack);
                  if (!available && pack === "processing") {
                    return (
                      <div key={pack}>
                        <SectionLabel icon={Zap} title={`${index + 2}. Processing Pack`} />
                        <div className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.035] p-5">
                          <p className="text-sm font-bold text-slate-200">Basic에서는 Processing Pack을 선택하지 않습니다.</p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            여러 PDF 동시 추출, 배치 처리, 동시 작업 수 확장은 Pro에서 제공합니다.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  if (!available) return null;
                  return (
                    <div key={pack}>
                      <SectionLabel
                        icon={pack === "ai" ? Sparkles : pack === "storage" ? HardDrive : pack === "student" ? School : Zap}
                        title={`${index + 2}. ${packLabels[pack]} 선택`}
                      />
                      {pack === "ai" && (
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          PDF 추출은 별도 페이지 한도가 아니라 AI credits를 사용합니다.
                        </p>
                      )}
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {packOptions[pack].map((option) => {
                          const active = currentSelections[pack] === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => updateSelection(pack, option.id)}
                              className={cn(
                                "min-h-48 rounded-[8px] border p-4 text-left transition",
                                active
                                  ? "border-cyan-200 bg-cyan-200/10"
                                  : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.065]"
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-lg font-black text-white">{option.name}</h3>
                                  <p className="mt-1 text-sm font-bold text-cyan-100">{option.label}</p>
                                </div>
                                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", active ? "border-cyan-100 bg-cyan-100 text-slate-950" : "border-white/15 text-transparent")}>
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              </div>
                              <p className="mt-4 text-sm leading-6 text-slate-400">{option.description}</p>
                              <p className="mt-4 text-xs font-semibold text-slate-500">{option.detail}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="lg:sticky lg:top-24">
              <div className="rounded-[8px] border border-white/10 bg-[#111820]/96 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">선택한 구성</p>
                <h3 className="mt-3 text-3xl font-black text-white">{model.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{model.audience}</p>
                <div className="mt-5 space-y-3">
                  {selectedPacks.map(([pack, option]) => (
                    <div key={pack} className="rounded-[7px] border border-white/10 bg-white/[0.045] p-3">
                      <p className="text-xs font-bold text-slate-500">{packLabels[pack]}</p>
                      <p className="mt-1 text-sm font-bold text-white">{option.name}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <SummaryItem>PDF 추출 가능</SummaryItem>
                  <SummaryItem>AI credits 기반 사용량 관리</SummaryItem>
                  <SummaryItem>{model.speed} 처리 속도</SummaryItem>
                  <SummaryItem>{selectedPlan === "pro" ? "여러 PDF 동시 추출과 배치 처리" : "단일 PDF 중심 처리"}</SummaryItem>
                  <SummaryItem>{selectedPlan === "pro" ? "마켓플레이스 사용 가능" : "마켓플레이스 미포함"}</SummaryItem>
                  <SummaryItem>워터마크 없음</SummaryItem>
                </div>
                <Link href="/register" className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-cyan-200 px-4 text-sm font-black text-slate-950 transition hover:bg-white">
                  이 구성으로 시작하기 <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#enterprise" className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-slate-100 transition hover:bg-white/[0.08]">
                  Enterprise 문의
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="enterprise" className="border-t border-white/10 bg-[#10130f]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Enterprise</p>
            <h2 className="mt-3 text-3xl font-black tracking-normal text-white sm:text-5xl">
              대형 학원, 출판사, 기관은 세부 커스텀으로 설계합니다.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Basic과 Pro는 패키지 단위로 빠르게 시작하고, Enterprise는 월 AI credits,
              문제 DB, 저장공간, 학생 키, 동시 작업 수, 처리 속도까지 맞춤 구성합니다.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {enterpriseFeatures.map(([title, body, Icon]) => (
              <div key={title} className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
                <Icon className="h-5 w-5 text-amber-100" />
                <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#07080d]">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-8 text-sm text-slate-500 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img src="/tenaforge-mark-dark.png" alt="" className="h-8 w-8 object-contain" />
              <span>Tena Forge</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href="/terms" className="hover:text-slate-300">이용약관</Link>
              <Link href="/privacy" className="hover:text-slate-300">개인정보처리방침</Link>
              <Link href="/refund-policy" className="hover:text-slate-300">환불 및 취소 정책</Link>
              <Link href="/copyright-policy" className="hover:text-slate-300">저작권 정책</Link>
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
    </main>
  );
}

function HeroWorkbench() {
  return (
    <div className="absolute inset-x-0 bottom-0 top-20 opacity-70">
      <div className="absolute right-[6%] top-[15%] hidden w-[34rem] rotate-[5deg] rounded-[8px] border border-white/10 bg-[#111820]/80 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.36)] backdrop-blur-md md:block">
        <div className="grid grid-cols-[0.7fr_1.3fr] gap-4">
          <div className="space-y-3">
            {["AI 추출", "검수 대기", "태그 완료", "출력 준비"].map((item) => (
              <div key={item} className="rounded-[7px] border border-white/10 bg-white/[0.045] p-3 text-xs font-bold text-slate-300">{item}</div>
            ))}
          </div>
          <div className="rounded-[7px] border border-white/10 bg-black/24 p-4">
            <div className="mb-4 h-4 w-28 rounded-full bg-cyan-100/70" />
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-white/18" />
              <div className="h-2 w-11/12 rounded-full bg-white/14" />
              <div className="h-2 w-10/12 rounded-full bg-white/14" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="h-24 rounded-[7px] border border-cyan-200/20 bg-cyan-200/10" />
              <div className="h-24 rounded-[7px] border border-emerald-200/20 bg-emerald-200/10" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,transparent,#07080d)]" />
    </div>
  );
}

function SectionLabel({ icon: Icon, title }: { icon: IconComponent; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-white/10 bg-white/[0.055] text-cyan-100">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-lg font-black text-white">{title}</h3>
    </div>
  );
}

function SummaryItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 text-sm text-slate-300">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
      <span>{children}</span>
    </div>
  );
}
