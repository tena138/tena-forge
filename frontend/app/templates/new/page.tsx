"use client";

import Link from "next/link";
import { ArrowRight, Code2, FileText, Layers3, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { visualTemplateCategories } from "@/lib/visualTemplatePresets";

const categoryVisuals: Record<string, string> = {
  exam: "시험지",
  textbook: "교재",
  solution: "해설",
  worksheet: "워크북",
  answerSheet: "답안",
  report: "리포트",
  custom: "빈 페이지",
};

export default function NewTemplatePage() {
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.28),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[7px] border border-violet-300/25 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-100">
              <Sparkles className="h-3.5 w-3.5" />
              Visual Template Studio
            </div>
            <h1 className="mt-5 text-3xl font-bold text-white">코드 없이 템플릿 세트를 디자인하세요</h1>
          </div>
          <Link href="/templates/studio?type=exam">
            <Button className="h-11">
              바로 시작 <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visualTemplateCategories.map((category) => (
          <Link
            key={category.value}
            href={`/templates/studio?type=${category.value}`}
            className="group overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.045] shadow-[0_18px_50px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-violet-400/45 hover:bg-white/[0.065]"
          >
            <div className="relative h-44 border-b border-white/10 bg-[#111318] p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(124,58,237,0.24),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)]" />
              <div className="relative h-full rounded-[8px] border border-white/12 bg-white shadow-[0_20px_42px_rgba(0,0,0,0.26)]">
                <div className="flex h-9 items-center justify-between border-b border-slate-200 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  <span>{categoryVisuals[category.value]}</span>
                  <span>A4</span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="h-3 w-2/3 rounded bg-slate-900" />
                  <div className="h-2 w-full rounded bg-violet-200" />
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <div className="h-14 rounded border border-slate-200 bg-slate-50" />
                    <div className="h-14 rounded border border-slate-200 bg-slate-50" />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-violet-300" />
                <h2 className="text-lg font-bold text-white">{category.label}</h2>
              </div>
              <div className="mt-4 flex items-center text-sm font-semibold text-violet-200">
                이 프리셋으로 시작 <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-[12px] border border-white/10 bg-white/[0.035] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <h3 className="text-sm font-bold text-white">레거시 코드 템플릿</h3>
          </div>
        </div>
        <Link href="/templates/legacy/new">
          <Button variant="outline">
            <Code2 className="h-4 w-4" /> 고급 모드 열기
          </Button>
        </Link>
      </section>
    </div>
  );
}
