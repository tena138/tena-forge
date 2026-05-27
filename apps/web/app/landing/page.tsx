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
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/dashboard" className="font-bold text-white">Tena Forge</Link>
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost">로그인</Button>
          <Button href="/dashboard">콘솔로 이동</Button>
        </div>
      </nav>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <Badge tone="violet">AI document automation SaaS</Badge>
          <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.08] tracking-[-0.03em] text-white md:text-7xl">
            권리 있는 교육 자료를 문항 아카이브로, 완성된 교재로.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Tena Forge는 학원과 교육 콘텐츠 팀이 직접 제작했거나 이용 권한을 보유한 자료를 정리하고, 시험지·워크북·교재로 재구성하는 제작 콘솔입니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/dashboard">앱 콘솔 열기 <ArrowRight className="h-4 w-4" /></Button>
            <Button href="/copyright-policy" variant="secondary">저작권 정책 보기</Button>
          </div>
        </div>
        <Card className="relative overflow-hidden p-0">
          <div className="border-b border-white/10 p-4 text-sm text-slate-400">Workflow</div>
          <div className="grid gap-3 p-5">
            {["Upload", "Extract", "Review", "Tag", "Template", "Export"].map((step, index) => (
              <div key={step} className="flex items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-violet-400/10 text-xs font-bold text-violet-100">{index + 1}</span>
                  <span className="font-semibold text-white">{step}</span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              </div>
            ))}
          </div>
        </Card>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-3">
        {features.map(([title, body], index) => (
          <Card key={title}>
            <div className="mb-5 grid h-10 w-10 place-items-center rounded-[10px] border border-white/10 bg-white/[0.05] text-violet-200">
              {index === 0 ? <ShieldCheck /> : index === 1 ? <Sparkles /> : <FileUp />}
            </div>
            <h2 className="font-bold text-white">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
          </Card>
        ))}
      </section>
      <footer className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-8 text-sm text-slate-500">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold text-slate-300">Tena Forge</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/terms" className="hover:text-slate-300">이용약관</Link>
              <Link href="/privacy" className="hover:text-slate-300">개인정보처리방침</Link>
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
