"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ExternalLink, FileUp, Info } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import type { Batch } from "@/lib/api";
import { sourceTypeLabel } from "@/lib/api";
import { formatKstMonthDayTime } from "@/lib/datetime";

function formatDate(value: string) {
  return formatKstMonthDayTime(value, value);
}

function fileName(value: string | null) {
  if (!value) return "없음";
  return value.split(/[\\/]/).pop() || value;
}

function errorReason(batch: Batch) {
  return batch.failure_reason || (batch.status === "error" ? batch.progress_message : null) || "오류 원인을 확인하지 못했습니다.";
}

function BatchDetail({ batch }: { batch: Batch }) {
  const isError = batch.status === "error";

  return (
    <div className="grid gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm md:grid-cols-[1.1fr_1fr]">
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-semibold text-slate-100">
          <Info className="h-4 w-4 text-zinc-200" />
          배치 상세 정보
        </div>
        <dl className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">입력 PDF</dt>
            <dd className="mt-0.5 break-all text-slate-200">{fileName(batch.problem_pdf_filename)}</dd>
          </div>
          {batch.solution_pdf_filename ? (
            <div>
              <dt className="text-slate-500">레거시 답안 PDF</dt>
              <dd className="mt-0.5 break-all text-slate-200">{fileName(batch.solution_pdf_filename)}</dd>
            </div>
          ) : (
            <div>
              <dt className="text-slate-500">정답 감지</dt>
              <dd className="mt-0.5 text-slate-200">입력 PDF 안에서 자동 감지</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">자료 출처</dt>
            <dd className="mt-0.5 text-slate-200">{sourceTypeLabel(batch.source_type)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">현재 단계</dt>
            <dd className="mt-0.5 text-slate-200">{batch.progress_message || "기록 없음"}</dd>
          </div>
        </dl>
      </div>

      {isError ? (
        <div className="rounded-[8px] border border-zinc-400/20 bg-zinc-400/10 p-3 text-sm text-zinc-100">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            처리 실패 원인
          </div>
          <div className="mt-3 space-y-2 text-xs leading-5">
            <p><span className="text-zinc-200/70">실패 단계:</span> {batch.failure_stage || "확인되지 않음"}</p>
            <p><span className="text-zinc-200/70">원인:</span> {errorReason(batch)}</p>
            <p><span className="text-zinc-200/70">대응:</span> {batch.failure_hint || "재처리하거나 원본 파일과 서버 설정을 확인하세요."}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-400">
          <div className="font-semibold text-slate-200">처리 요약</div>
          <p className="mt-2">검토 필요 {batch.review_count.toLocaleString("ko-KR")}개, 태깅 완료 {batch.tagged_count.toLocaleString("ko-KR")}개, 태그 미완료 {batch.untagged_count.toLocaleString("ko-KR")}개</p>
        </div>
      )}
    </div>
  );
}

export function RecentBatchTable({ batches }: { batches: Batch[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">최근 배치</h2>
          <p className="mt-0.5 text-sm text-slate-400">PDF 처리 상태와 실패 원인을 추적합니다.</p>
        </div>
        <Link className="text-sm font-semibold text-zinc-300 hover:text-zinc-200" href="/batches">전체 보기</Link>
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-white/10 bg-white/[0.045] shadow-[0_18px_52px_rgba(0,0,0,0.28)]">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-white/10 bg-white/[0.04] text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">문항 수</th>
              <th className="px-4 py-3">최근 단계</th>
              <th className="px-4 py-3">생성일</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {batches.slice(0, 6).map((batch) => {
              const expanded = expandedId === batch.id;
              return (
                <Fragment key={batch.id}>
                  <tr className="border-t border-white/8 transition-colors hover:bg-white/[0.04]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{batch.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{fileName(batch.problem_pdf_filename)}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={batch.status} /></td>
                    <td className="px-4 py-3 font-medium text-slate-300">{batch.problem_count.toLocaleString("ko-KR")}</td>
                    <td className="max-w-[240px] px-4 py-3 text-slate-400">
                      <span className="line-clamp-1">{batch.status === "error" ? errorReason(batch) : batch.progress_message || "기록 없음"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(batch.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/[0.05] px-2.5 text-xs font-semibold text-slate-200 shadow-sm transition-colors hover:border-white/18 hover:bg-white/[0.08]"
                          onClick={() => setExpandedId(expanded ? null : batch.id)}
                        >
                          상세
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        <Link href={`/problems?batch_id=${batch.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/[0.05] px-2.5 text-xs font-semibold text-slate-200 shadow-sm transition-colors hover:border-white/18 hover:bg-white/[0.08]">
                          문항 보기
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-t border-white/8">
                      <td colSpan={6} className="px-4 pb-4 pt-0">
                        <BatchDetail batch={batch} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!batches.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-slate-400">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.05]">
                      <FileUp className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">아직 배치가 없습니다.</div>
                    </div>
                    <Link
                      href="/archive/new"
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[7px] border border-zinc-400/40 bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_rgba(124,58,237,0.28)] transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      PDF 업로드
                    </Link>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
