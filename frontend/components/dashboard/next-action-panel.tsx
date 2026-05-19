import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Tags } from "lucide-react";

export function NextActionPanel({
  reviewCount,
  untaggedCount,
}: {
  reviewCount: number;
  untaggedCount: number;
}) {
  const hasReview = reviewCount > 0;

  return (
    <section className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[10px] border border-white/10 bg-black/45 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.34)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-200">
              <Clock3 className="h-3.5 w-3.5" />
              Next Action
            </div>
            <h2 className="mt-2 text-lg font-bold">
              {hasReview ? `검토가 필요한 문항 ${reviewCount.toLocaleString("ko-KR")}개가 있습니다.` : "검토 대기 문항이 없습니다."}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              {hasReview ? "검토를 끝내면 태깅과 문제 세트 조립 단계가 더 정확해집니다." : "최근 배치를 확인하거나 새 PDF를 업로드해 콘텐츠 생산을 이어가세요."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/problems/review"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition-all duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              문항 검토 시작
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/batches"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              최근 배치 보기
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <Tags className="h-3.5 w-3.5 text-violet-300" />
          Refinement Queue
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-white">{untaggedCount.toLocaleString("ko-KR")}</div>
            <div className="mt-1 text-sm text-slate-400">태깅 대기 문항</div>
          </div>
          <CheckCircle2 className="h-7 w-7 text-slate-600" />
        </div>
      </div>
    </section>
  );
}
