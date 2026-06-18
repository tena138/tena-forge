import Link from "next/link";
import { ArrowRight, CheckCircle2, FileUp, ShieldCheck, Sparkles } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { HOMEPAGE_BUSINESS_INFO_ROWS } from "@/lib/legal";

const features = [
  ["권리 확인 기반 아카이빙", "업로드 전 권리 확인, 출처 유형, 감사 로그를 통해 안전한 작업 흐름을 만듭니다."],
  ["AI 문항 구조화", "PDF와 이미지에서 문항, 지문, 해설을 추출하고 검토 가능한 아카이브로 정리합니다."],
  ["템플릿 출력 엔진", "A4 시험지, 워크북, 교재 레이아웃을 HTML/PDF로 생성하고 재출력합니다."]
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <nav className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/dashboard" className="inline-flex items-center gap-3" aria-label="Tena Forge">
            <span className="forge-brand-mark grid h-9 w-9 place-items-center rounded-[8px] text-xs font-black text-white">T</span>
            <span className="text-sm font-black text-white">TENA FORGE</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button href="/login" variant="ghost">로그인</Button>
            <Button href="/dashboard">콘솔로 이동</Button>
          </div>
        </div>
      </nav>

      <section className="relative isolate flex min-h-[86svh] items-end overflow-hidden px-5 pb-12 pt-28 sm:min-h-[82svh] lg:pb-16">
        <img
          src="/tena-forge-metal-lockup.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center brightness-125 contrast-125"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(0,0,0,0.76),rgba(0,0,0,0.18)_48%,rgba(0,0,0,0.66)),linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.74))]" />
        <div className="mx-auto w-full max-w-7xl">
          <Badge tone="violet">AI document automation SaaS</Badge>
          <h1 className="mt-5 text-6xl font-black leading-none tracking-normal text-white sm:text-7xl lg:text-8xl">
            Tena Forge
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-200 sm:text-lg sm:leading-8">
            권리 있는 교육 자료를 문항 아카이브로 정리하고, 시험지·워크북·교재로 재구성하는 제작 콘솔입니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/dashboard">앱 콘솔 열기 <ArrowRight className="h-4 w-4" /></Button>
            <Button href="/copyright-policy" variant="secondary">저작권 정책 보기</Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-3">
        {features.map(([title, body], index) => (
          <Card key={title}>
            <div className="mb-5 grid h-10 w-10 place-items-center rounded-[8px] border border-white/15 bg-white/[0.065] text-white">
              {index === 0 ? <ShieldCheck /> : index === 1 ? <Sparkles /> : <FileUp />}
            </div>
            <h2 className="font-bold text-white">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p>
          </Card>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-12 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <Badge>Workflow</Badge>
          <h2 className="mt-4 text-2xl font-bold text-white">자료에서 출력물까지 한 흐름으로</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            업로드, 추출, 검토, 태깅, 템플릿 적용, 출력까지 한 콘솔 안에서 이어집니다.
          </p>
        </Card>
        <Card className="p-0">
          <div className="grid gap-0">
            {["Upload", "Extract", "Review", "Tag", "Template", "Export"].map((step, index) => (
              <div key={step} className="flex items-center justify-between border-b border-white/10 p-4 text-sm last:border-b-0">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-[8px] border border-white/15 bg-white/[0.065] text-xs font-bold text-white">{index + 1}</span>
                  <span className="font-semibold text-white">{step}</span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-neutral-300" />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-8 text-sm text-neutral-500">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold text-neutral-300">Tena Forge</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/terms" className="hover:text-neutral-300">이용약관</Link>
              <Link href="/privacy" className="hover:text-neutral-300">개인정보처리방침</Link>
              <Link href="/copyright-policy" className="hover:text-neutral-300">저작권 정책</Link>
            </div>
          </div>
          <dl className="grid gap-x-5 gap-y-1 text-[11px] leading-5 sm:grid-cols-2 lg:grid-cols-3">
            {HOMEPAGE_BUSINESS_INFO_ROWS.map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-wrap gap-x-1.5">
                <dt className="shrink-0 text-neutral-600">{label}</dt>
                <dd className="min-w-0 break-words text-neutral-400">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </footer>
    </main>
  );
}
