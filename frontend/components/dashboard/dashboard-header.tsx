import Link from "next/link";
import { ArrowRight, FileCheck2, FileUp, PackageCheck, ScanText, Tags } from "lucide-react";

const forgeFlow = [
  { label: "PDF 업로드", detail: "원재료", icon: FileUp },
  { label: "문항 추출", detail: "분리", icon: ScanText },
  { label: "검토", detail: "검수", icon: FileCheck2 },
  { label: "태깅", detail: "정제", icon: Tags },
  { label: "세트 생성", detail: "조립", icon: PackageCheck },
];

export function DashboardHeader() {
  return (
    <section className="overflow-hidden rounded-[12px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(15,23,42,0.74)_46%,rgba(88,28,135,0.34)_100%)] shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
      <div className="grid gap-6 p-5 lg:grid-cols-[1.05fr_1fr] lg:p-6">
        <div className="flex min-w-0 flex-col justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[7px] border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300 shadow-sm">
              Tena Forge Console
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-[-0.01em] text-white sm:text-4xl">
              AI 콘텐츠 제작소
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/archive/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-violet-400/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_rgba(124,58,237,0.28)] transition-all duration-150 hover:bg-primary/90 hover:shadow-[0_14px_34px_rgba(124,58,237,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileUp className="h-4 w-4" />
              새 PDF 업로드
            </Link>
            <Link
              href="/problems?needs_review=true"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 shadow-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileCheck2 className="h-4 w-4" />
              검토 대기 문항 보기
            </Link>
          </div>
        </div>

        <div className="rounded-[10px] border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <div className="text-xs font-bold text-white">Production Pipeline</div>
            </div>
            <ArrowRight className="h-4 w-4 text-violet-300" />
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {forgeFlow.map((step, index) => (
              <div key={step.label} className="relative rounded-[8px] border border-white/10 bg-white/[0.045] px-3 py-2">
                <div className="flex items-center justify-between">
                  <step.icon className="h-4 w-4 text-slate-200" />
                  <span className="text-[10px] font-semibold text-slate-500">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="mt-2 text-xs font-bold text-white">{step.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
