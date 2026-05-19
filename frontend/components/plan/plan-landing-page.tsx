"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Database,
  FileText,
  Layers3,
  Mail,
  School,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

import { PLANS, formatKRW } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ className?: string }>;
type AccentTone = "slate" | "violet" | "brand";

const signalToneStyles: Record<AccentTone, string> = {
  slate: "text-slate-200 bg-white/[0.055]",
  violet: "text-violet-100 bg-violet-200/[0.08]",
  brand: "text-violet-100 bg-[#7c3aed]/16",
};

const planToneStyles: Record<AccentTone, { card: string; icon: string; price: string; check: string; cta: string }> = {
  slate: {
    card: "border-white/[0.09] bg-[#11141a]/86",
    icon: "text-slate-200 bg-white/[0.055]",
    price: "text-slate-100",
    check: "text-slate-300",
    cta: "border border-white/[0.10] bg-white/[0.055] text-slate-50 hover:bg-white/[0.09]",
  },
  violet: {
    card: "border-violet-200/18 bg-[#12141d]/92 shadow-[0_22px_80px_rgba(124,58,237,0.08)]",
    icon: "text-violet-100 bg-violet-200/[0.08]",
    price: "text-violet-100",
    check: "text-violet-200",
    cta: "border border-violet-100/18 bg-violet-100/[0.08] text-slate-50 hover:bg-violet-100/[0.13]",
  },
  brand: {
    card: "border-[#8b5cf6]/34 bg-[#100f1d]/94 shadow-[0_24px_90px_rgba(109,40,217,0.16)]",
    icon: "text-violet-100 bg-[#7c3aed]/16",
    price: "text-[#c4b5fd]",
    check: "text-[#c4b5fd]",
    cta: "bg-[#7c3aed] text-white shadow-[0_14px_36px_rgba(124,58,237,0.28)] hover:bg-[#8b5cf6]",
  },
};

const companySizeOptions = ["개인 / 1인 사업자", "2~10명", "11~50명", "51~200명", "201명 이상", "출판사 / 콘텐츠 팀", "기관 / 프랜차이즈"];
const interestOptions = ["Enterprise 맞춤 플랜", "대량 PDF / AI 문제 추출", "문제 데이터베이스 구축", "학생 키 / 학원 운영", "저작권 자료 전산화 및 판매", "문항 공모 / 콘텐츠 마켓플레이스", "기타"];

const enterpriseBullets: Array<[string, IconComponent]> = [
  ["AI 사용량, 일 한도, 처리 속도 맞춤 구성", Sparkles],
  ["대형 문제 데이터베이스와 원본 파일 저장공간 설계", Database],
  ["학생 키, 학원 운영, 콘텐츠팀 워크플로우 지원", School],
  ["저작권 자료 전산화 및 마켓플레이스 판매 구조 상담", Store],
  ["문항 공모와 콘텐츠 정산 구조 확장 가능", Layers3],
];

type InquiryForm = {
  companySize: string;
  companyName: string;
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  interest: string;
  message: string;
};

const emptyInquiry: InquiryForm = {
  companySize: "",
  companyName: "",
  lastName: "",
  firstName: "",
  email: "",
  phone: "",
  interest: "",
  message: "",
};

export function PlanLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050608] text-white">
      <PlanNav />

      <section className="relative min-h-screen overflow-hidden pt-16">
        <PlanBackdrop />

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-4 py-14 sm:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-100/16 bg-white/[0.055] px-3 py-1 text-xs font-semibold text-violet-100">
                <Sparkles className="h-3.5 w-3.5" />
                AI credits 기반 PDF 추출과 문제 DB 운영
              </div>
              <h1 className="mt-7 max-w-3xl text-[2.45rem] font-extrabold leading-[1.04] tracking-normal text-slate-50 sm:text-5xl sm:leading-[1.04] lg:text-6xl">
                수업 제작 방식에 맞는 Tena Forge 플랜을 선택하세요.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300/92 sm:text-lg">
                PDF 문제 추출부터 문제 데이터베이스, 학생 배포, 마켓플레이스까지.
                필요한 규모에 맞게 시작하고 확장하세요.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SignalCard title="PDF 추출" body="모든 플랜에서 가능" icon={FileText} />
              <SignalCard title="AI credits" body="페이지 제한 없이 credits 차감" icon={Sparkles} />
              <SignalCard title="Pro 확장" body="동시 추출과 마켓플레이스" icon={Store} />
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <PlanCard
              title={PLANS.free.name}
              price="₩0"
              positioning={PLANS.free.positioning}
              specs={PLANS.free.cardSpecs}
              href="/register?plan=free"
              cta={PLANS.free.cta}
              icon={FileText}
            />
            <PlanCard
              title={PLANS.basic.name}
              price={`${formatKRW(PLANS.basic.baseMonthlyPrice)} / 월부터`}
              positioning={PLANS.basic.positioning}
              specs={PLANS.basic.cardSpecs}
              href="/plan/basic"
              cta={PLANS.basic.cta}
              icon={Users}
              emphasized
            />
            <PlanCard
              title={PLANS.pro.name}
              price={`${formatKRW(PLANS.pro.baseMonthlyPrice)} / 월부터`}
              positioning={PLANS.pro.positioning}
              specs={PLANS.pro.cardSpecs}
              href="/plan/pro"
              cta={PLANS.pro.cta}
              icon={Store}
              badge="추천"
            />
          </div>
        </div>
      </section>

      <EnterpriseSection />
    </main>
  );
}

function PlanBackdrop() {
  const signalBars = [72, 46, 96, 58, 112, 68, 84, 52, 104, 62, 90, 48];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#07080d_0%,#090b12_44%,#050608_100%)]" />
      <div
        className="absolute inset-0 opacity-24"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      <div
        className="absolute inset-0 opacity-55"
        style={{
          background:
            "linear-gradient(116deg, transparent 0 44%, rgba(139,92,246,0.15) 44.12% 44.34%, transparent 44.6% 100%), linear-gradient(64deg, transparent 0 70%, rgba(167,139,250,0.12) 70.12% 70.36%, transparent 70.62% 100%), linear-gradient(180deg, transparent 0 58%, rgba(88,80,236,0.07) 76%, transparent 100%)",
        }}
      />
      <div className="absolute left-1/2 top-16 h-px w-[min(86rem,86vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-100/34 to-transparent" />
      <div className="absolute right-[-8rem] top-28 hidden h-[34rem] w-[48rem] -skew-y-6 rounded-[8px] border border-white/[0.055] bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015)_48%,rgba(139,92,246,0.07))] shadow-[0_0_120px_rgba(124,58,237,0.10)] lg:block" />
      <div className="absolute right-[8%] top-40 hidden w-[22rem] grid-cols-6 gap-2 opacity-55 lg:grid">
        {signalBars.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={cn(
              "block rounded-full border border-white/[0.06] bg-white/[0.04]",
              index % 3 === 1 && "bg-violet-200/[0.12]",
              index % 5 === 2 && "bg-[#7c3aed]/14"
            )}
            style={{ height }}
          />
        ))}
      </div>
      <div className="absolute bottom-[-8rem] left-0 h-56 w-full bg-[linear-gradient(90deg,rgba(139,92,246,0.12),transparent_32%,rgba(124,58,237,0.12)_62%,transparent)] blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-[linear-gradient(180deg,transparent,#050608_78%)]" />
    </div>
  );
}

function EnterpriseBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#090b10_0%,#0d0e13_58%,#08090d_100%)]" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="absolute left-[-10rem] top-16 h-[32rem] w-[42rem] rotate-[-10deg] rounded-[8px] border border-violet-100/[0.06] bg-[linear-gradient(135deg,rgba(139,92,246,0.10),rgba(255,255,255,0.018)_58%,transparent)]" />
      <div className="absolute right-[-12rem] bottom-[-10rem] h-[26rem] w-[52rem] rotate-[8deg] rounded-[8px] border border-violet-100/[0.08] bg-[linear-gradient(135deg,transparent,rgba(124,58,237,0.10)_46%,rgba(255,255,255,0.018))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-100/24 to-transparent" />
    </div>
  );
}

function PlanNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.08] bg-[#050608]/82 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex h-11 min-w-0 items-center" aria-label="Tena Forge">
          <img src="/tenaforgelogo-dark.png" alt="Tena Forge" className="h-9 w-auto max-w-[8.75rem] object-contain sm:max-w-none" />
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <a href="#enterprise" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">
            Enterprise
          </a>
          <Link href="/login?redirect=/academy" className="hidden rounded-[7px] px-3 py-2 text-slate-300 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex">
            로그인
          </Link>
          <Link href="/register?plan=free" className="inline-flex h-9 items-center rounded-[7px] bg-[#7c3aed] px-3 text-sm font-extrabold text-white shadow-[0_10px_26px_rgba(124,58,237,0.25)] transition hover:bg-[#8b5cf6]">
            무료로 시작
          </Link>
        </div>
      </div>
    </nav>
  );
}

function SignalCard({ title, body, icon: Icon }: { title: string; body: string; icon: IconComponent }) {
  const tone: AccentTone = title.includes("AI") ? "violet" : title.includes("Pro") ? "brand" : "slate";

  return (
    <div className="min-h-28 rounded-[8px] border border-white/[0.08] bg-[#11141a]/80 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.20)] backdrop-blur-md">
      <div className={cn("mb-4 inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-white/[0.08]", signalToneStyles[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <h2 className="text-sm font-semibold text-slate-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400/90">{body}</p>
    </div>
  );
}

function PlanCard({
  title,
  price,
  positioning,
  specs,
  href,
  cta,
  icon: Icon,
  badge,
  emphasized,
}: {
  title: string;
  price: string;
  positioning: string;
  specs: string[];
  href: string;
  cta: string;
  icon: IconComponent;
  badge?: string;
  emphasized?: boolean;
}) {
  const tone: AccentTone = badge ? "brand" : emphasized ? "violet" : "slate";
  const styles = planToneStyles[tone];

  return (
    <article
      className={cn(
        "flex min-h-[35rem] flex-col rounded-[8px] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.26)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5",
        styles.card,
        emphasized && "ring-1 ring-violet-100/10",
        badge && "ring-1 ring-[#8b5cf6]/18"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-[7px] border border-white/[0.09]", styles.icon)}>
          <Icon className="h-5 w-5" />
        </span>
        {badge && <span className="rounded-[6px] bg-[#7c3aed] px-2.5 py-1 text-xs font-extrabold text-white">{badge}</span>}
      </div>
      <h2 className="mt-7 text-3xl font-extrabold tracking-normal text-slate-50">{title}</h2>
      <p className={cn("mt-3 text-2xl font-extrabold tracking-normal", styles.price)}>{price}</p>
      <p className="mt-4 min-h-14 text-sm leading-6 text-slate-400/90">{positioning}</p>
      <Link
        href={href}
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-[8px] text-sm font-extrabold transition",
          styles.cta
        )}
      >
        {cta} <ArrowRight className="h-4 w-4" />
      </Link>
      <ul className="mt-7 space-y-3 text-sm leading-6 text-slate-300/92">
        {specs.map((spec) => (
          <li key={spec} className="flex gap-2">
            <Check className={cn("mt-1 h-4 w-4 shrink-0", styles.check)} />
            <span>{spec}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function EnterpriseSection() {
  const [values, setValues] = useState<InquiryForm>(emptyInquiry);
  const [errors, setErrors] = useState<Partial<Record<keyof InquiryForm, string>>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function update<K extends keyof InquiryForm>(key: K, value: InquiryForm[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function validate() {
    const next: Partial<Record<keyof InquiryForm, string>> = {};
    for (const key of Object.keys(values) as Array<keyof InquiryForm>) {
      if (!values[key].trim()) next[key] = "필수 항목입니다.";
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) next.email = "업무 이메일 형식을 확인해주세요.";
    if (values.phone && !/^[0-9+\-\s()]{7,20}$/.test(values.phone)) next.phone = "전화번호 형식을 확인해주세요.";
    if (values.message && values.message.trim().length < 10) next.message = "니즈와 과제를 조금 더 자세히 입력해주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/enterprise-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "문의 접수에 실패했습니다.");
      setStatus("success");
      setMessage(data.message || "문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.");
      setValues(emptyInquiry);
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "문의 접수에 실패했습니다.");
    }
  }

  return (
    <section id="enterprise" className="relative overflow-hidden border-t border-white/[0.08] bg-[#090b10] px-4 py-20 sm:px-6">
      <EnterpriseBackdrop />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-normal text-violet-100">Enterprise</p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-normal text-slate-50 sm:text-6xl">엔터프라이즈 도입 문의하기</h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400">
            대형 학원, 출판사, 기관을 위한 맞춤형 AI 사용량, 문제 데이터베이스,
            학생 키, 마켓플레이스 운영 구조를 설계해드립니다.
          </p>
          <a href="#enterprise-form" className="mt-7 inline-flex h-11 items-center gap-2 rounded-[8px] bg-[#7c3aed] px-5 text-sm font-extrabold text-white shadow-[0_14px_36px_rgba(124,58,237,0.28)] transition hover:bg-[#8b5cf6]">
            자세히 알아보기 <ArrowRight className="h-4 w-4" />
          </a>
          <div className="mt-9 grid gap-3">
            {enterpriseBullets.map(([label, Icon]) => (
              <div key={label} className="flex items-center gap-3 rounded-[8px] border border-white/[0.08] bg-white/[0.04] p-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-white/[0.08] bg-violet-100/[0.07] text-violet-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold text-slate-300">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            {["Tena", "Academy", "Publisher"].map((logo) => (
              <span key={logo} className="rounded-[7px] border border-white/[0.08] bg-white/[0.04] px-5 py-2 text-sm font-extrabold text-slate-400">{logo}</span>
            ))}
          </div>
        </div>

        <form id="enterprise-form" onSubmit={submit} className="rounded-[8px] border border-violet-200/30 bg-[#f4f0ff] p-5 text-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] bg-slate-950 text-white">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-xl font-extrabold">도입 상담 요청</h3>
              <p className="text-sm text-slate-500">필수 항목을 입력하면 담당자가 확인 후 연락드립니다.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect label="회사 규모 *" value={values.companySize} error={errors.companySize} onChange={(value) => update("companySize", value)} options={companySizeOptions} />
            <FormInput label="회사 이름 *" value={values.companyName} error={errors.companyName} onChange={(value) => update("companyName", value)} />
            <FormInput label="성 *" value={values.lastName} error={errors.lastName} onChange={(value) => update("lastName", value)} />
            <FormInput label="이름 *" value={values.firstName} error={errors.firstName} onChange={(value) => update("firstName", value)} />
            <FormInput label="업무 이메일 *" type="email" value={values.email} error={errors.email} onChange={(value) => update("email", value)} />
            <FormInput label="전화번호 *" value={values.phone} error={errors.phone} onChange={(value) => update("phone", value)} />
            <div className="sm:col-span-2">
              <FormSelect label="관심 제품 또는 서비스 *" value={values.interest} error={errors.interest} onChange={(value) => update("interest", value)} options={interestOptions} />
            </div>
            <label className="block sm:col-span-2">
              <span className="text-sm font-bold text-slate-700">담당하고 계신 비즈니스의 니즈 및 과제에 대해 자세히 알려주시겠어요? *</span>
              <textarea
                className="mt-2 min-h-36 w-full rounded-[8px] border border-slate-950/12 bg-white px-3 py-3 text-sm outline-none transition focus:border-slate-950/40 focus:ring-4 focus:ring-slate-950/5"
                value={values.message}
                onChange={(event) => update("message", event.target.value)}
              />
              {errors.message && <span className="mt-1 block text-xs font-semibold text-rose-600">{errors.message}</span>}
            </label>
          </div>
          <button type="submit" disabled={status === "submitting"} className="mt-6 h-12 w-full rounded-[8px] bg-slate-950 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50">
            {status === "submitting" ? "제출 중..." : "제출"}
          </button>
          {message && (
            <p className={cn("mt-4 rounded-[8px] px-4 py-3 text-sm font-bold", status === "success" ? "bg-violet-50 text-violet-800" : "bg-rose-50 text-rose-700")}>{message}</p>
          )}
          <p className="mt-5 text-center text-xs text-slate-500">기타 문의는 도움말 센터에서 문의해주세요.</p>
        </form>
      </div>
    </section>
  );
}

function FormInput({ label, value, error, type = "text", onChange }: { label: string; value: string; error?: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-[8px] border border-slate-950/12 bg-white px-3 text-sm outline-none transition focus:border-slate-950/40 focus:ring-4 focus:ring-slate-950/5" />
      {error && <span className="mt-1 block text-xs font-semibold text-rose-600">{error}</span>}
    </label>
  );
}

function FormSelect({ label, value, error, options, onChange }: { label: string; value: string; error?: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-[8px] border border-slate-950/12 bg-white px-3 text-sm outline-none transition focus:border-slate-950/40 focus:ring-4 focus:ring-slate-950/5">
        <option value="">선택</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {error && <span className="mt-1 block text-xs font-semibold text-rose-600">{error}</span>}
    </label>
  );
}
