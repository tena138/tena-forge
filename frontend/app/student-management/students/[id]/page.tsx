"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileText, Loader2, RotateCcw, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentCard, WrongAnswer, createReviewSet, getStudentDetail, savePaperSessionGrade } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
type AutosaveState = "pending" | "saving" | "saved" | "error";

type StudentDetail = StudentCard & {
  paper_session_history: Array<{
    id: string;
    paper_session_id: string;
    status: string;
    score?: number | null;
    correct_count: number;
    wrong_count: number;
    total_count: number;
    session?: { title?: string; session_type?: string; scheduled_at?: string | null; problem_count?: number } | null;
    problem_results: Array<{
      id: string;
      problem_id: string;
      problem_number: number;
      result_status: ProblemStatus;
    }>;
  }>;
  wrong_answers: WrongAnswer[];
  analytics: {
    graded_count?: number;
    average_score?: number | null;
    unresolved_wrong_count?: number;
  };
};

function tone(status?: string) {
  if (["graded", "completed", "resolved", "mastered", "Active"].includes(status || "")) return "bg-emerald-500/15 text-emerald-100 border-emerald-400/20";
  if (["unresolved", "Needs Review", "wrong"].includes(status || "")) return "bg-rose-500/15 text-rose-100 border-rose-400/20";
  return "bg-violet-500/15 text-violet-100 border-violet-300/20";
}

function problemCount(result: StudentDetail["paper_session_history"][number]) {
  return (
    result.total_count ||
    result.session?.problem_count ||
    Math.max(0, ...result.problem_results.map((item) => item.problem_number))
  );
}

function buildStatuses(result: StudentDetail["paper_session_history"][number]) {
  const count = problemCount(result);
  const next: Record<number, ProblemStatus> = {};
  for (let number = 1; number <= count; number += 1) next[number] = "correct";
  for (const item of result.problem_results) next[item.problem_number] = item.result_status;
  return next;
}

function nextProblemStatus(status?: ProblemStatus): ProblemStatus {
  if (!status || status === "correct") return "wrong";
  if (status === "wrong") return "unanswered";
  return "correct";
}

function statusCounts(statuses: Record<number, ProblemStatus>, totalCount: number) {
  let correct = 0;
  let wrong = 0;
  let unmarked = 0;
  for (let number = 1; number <= totalCount; number += 1) {
    const status = statuses[number] || "correct";
    if (status === "correct") correct += 1;
    else if (status === "wrong" || status === "unanswered") wrong += 1;
    else unmarked += 1;
  }
  return { correct, wrong, unmarked };
}

function ResultCell({ number, status, onClick }: { number: number; status: ProblemStatus; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-square min-h-9 items-center justify-center rounded-md border text-xs font-black transition sm:text-sm",
        status === "correct" && "border-emerald-300/50 bg-emerald-500/25 text-emerald-50 hover:bg-emerald-500/35",
        status === "wrong" && "border-orange-300/60 bg-orange-500/25 text-orange-50 hover:bg-orange-500/35",
        status === "unanswered" && "border-rose-300/60 bg-rose-500/25 text-rose-50 hover:bg-rose-500/35",
        status === "unmarked" && "border-white/10 bg-white/[0.04] text-slate-300 hover:border-violet-300/40"
      )}
      title={`${number}번 ${status}`}
    >
      {number}
    </button>
  );
}

export default function StudentManagementStudentPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<StudentDetail | null>(null);
  const [resultStatuses, setResultStatuses] = useState<Record<string, Record<number, ProblemStatus>>>({});
  const [savingResultId, setSavingResultId] = useState("");
  const [autosaveStates, setAutosaveStates] = useState<Record<string, AutosaveState>>({});
  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [message, setMessage] = useState("");

  function applyStudentData(student: StudentDetail) {
    setData(student);
    const next: Record<string, Record<number, ProblemStatus>> = {};
    for (const result of student.paper_session_history) next[result.id] = buildStatuses(result);
    setResultStatuses(next);
  }

  useEffect(() => {
    getStudentDetail(params.id).then((student) => applyStudentData(student as StudentDetail)).catch(() => setData(null));
  }, [params.id]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(autosaveTimers.current)) clearTimeout(timer);
    };
  }, []);

  async function makeReviewSet() {
    if (!data) return;
    const review = await createReviewSet({ title: `${data.name} 오답 복습 세트`, student_membership_id: data.id, unresolved_only: true });
    setMessage(`복습 세트를 만들었습니다: ${review.name}`);
  }

  function clearAutosaveTimer(resultId: string) {
    const timer = autosaveTimers.current[resultId];
    if (timer) clearTimeout(timer);
    delete autosaveTimers.current[resultId];
  }

  function updateSavedSummary(result: StudentDetail["paper_session_history"][number], statuses: Record<number, ProblemStatus>) {
    const count = problemCount(result);
    const counts = statusCounts(statuses, count);
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        paper_session_history: current.paper_session_history.map((item) =>
          item.id === result.id
            ? {
                ...item,
                correct_count: counts.correct,
                wrong_count: counts.wrong,
                total_count: count,
                score: count ? Math.round((counts.correct / count) * 10000) / 100 : null,
                status: counts.unmarked === 0 ? "graded" : "pending_grading",
              }
            : item
        ),
      };
    });
  }

  async function persistResult(result: StudentDetail["paper_session_history"][number], statusesByNumber: Record<number, ProblemStatus>, manual = false) {
    if (!data) return;
    const count = problemCount(result);
    if (!count) return;
    const statuses = Array.from({ length: count }, (_, index) => {
      const problemNumber = index + 1;
      return {
        problem_number: problemNumber,
        result_status: statusesByNumber[problemNumber] || "correct",
      };
    });
    if (manual) setSavingResultId(result.id);
    else setAutosaveStates((current) => ({ ...current, [result.id]: "saving" }));
    try {
      await savePaperSessionGrade(result.paper_session_id, {
        student_membership_id: data.id,
        statuses,
        mark_unlisted_correct: false,
      });
      updateSavedSummary(result, statusesByNumber);
      if (manual) {
        const refreshed = await getStudentDetail(params.id);
        applyStudentData(refreshed as StudentDetail);
        setMessage(`${result.session?.title || "시험"} 채점 결과를 저장했습니다.`);
      } else {
        setAutosaveStates((current) => ({ ...current, [result.id]: "saved" }));
      }
    } catch {
      if (!manual) setAutosaveStates((current) => ({ ...current, [result.id]: "error" }));
      else setMessage("채점 결과 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      if (manual) setSavingResultId("");
    }
  }

  function scheduleAutosave(result: StudentDetail["paper_session_history"][number], statusesByNumber: Record<number, ProblemStatus>) {
    clearAutosaveTimer(result.id);
    setAutosaveStates((current) => ({ ...current, [result.id]: "pending" }));
    autosaveTimers.current[result.id] = setTimeout(() => {
      delete autosaveTimers.current[result.id];
      persistResult(result, statusesByNumber, false).catch(() => undefined);
    }, 500);
  }

  function toggleResultProblem(result: StudentDetail["paper_session_history"][number], number: number) {
    const currentResult = resultStatuses[result.id] || buildStatuses(result);
    const nextForResult = {
      ...currentResult,
      [number]: nextProblemStatus(currentResult[number] || "correct"),
    };
    setResultStatuses((current) => ({ ...current, [result.id]: nextForResult }));
    scheduleAutosave(result, nextForResult);
  }

  async function saveResult(result: StudentDetail["paper_session_history"][number]) {
    clearAutosaveTimer(result.id);
    await persistResult(result, resultStatuses[result.id] || buildStatuses(result), true);
  }

  if (!data) return <main className="min-h-screen bg-[#07080d] p-8 text-slate-400">학생 정보를 불러오는 중입니다.</main>;

  return (
    <main className="min-h-screen bg-[#07080d] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Link href="/student-management" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Student Management
        </Link>
        <header className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl border border-violet-300/20 bg-violet-500/15 p-3 text-violet-100">
                <UserRound className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Student Profile</p>
                <h1 className="mt-2 text-3xl font-black text-white">{data.name}</h1>
                <p className="mt-2 text-sm text-slate-400">{[data.school, data.grade_level, ...data.class_names].filter(Boolean).join(" · ") || "학생 정보 없음"}</p>
              </div>
            </div>
            <Button onClick={makeReviewSet}>
              <RotateCcw className="h-4 w-4" />
              오답 복습 세트
            </Button>
          </div>
          {message ? <div className="mt-4 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">{message}</div> : null}
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">최근 점수</p><p className="mt-1 text-2xl font-black text-white">{data.recent_score == null ? "-" : `${Math.round(data.recent_score)}점`}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">평균 점수</p><p className="mt-1 text-2xl font-black text-emerald-100">{data.analytics.average_score == null ? "-" : `${Math.round(data.analytics.average_score)}점`}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">채점 기록</p><p className="mt-1 text-2xl font-black text-violet-100">{data.analytics.graded_count || 0}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">미해결 오답</p><p className="mt-1 text-2xl font-black text-rose-100">{data.analytics.unresolved_wrong_count || 0}</p></CardContent></Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-white"><FileText className="h-5 w-5" />Paper Session History</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.paper_session_history.map((result) => {
                const count = problemCount(result);
                const statuses = resultStatuses[result.id] || buildStatuses(result);
                const orangeCount = Object.values(statuses).filter((status) => status === "wrong").length;
                const redCount = Object.values(statuses).filter((status) => status === "unanswered").length;
                const autosaveState = autosaveStates[result.id];
                return (
                  <div key={result.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-white">{result.session?.title || "Paper Session"}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {result.score == null ? "-" : `${Math.round(result.score)}점`} · 정답 {result.correct_count} · 오답/못 풂 {result.wrong_count} · {count}문항
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {autosaveState ? (
                          <span
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs",
                              autosaveState === "saved" && "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
                              autosaveState === "error" && "border-rose-400/20 bg-rose-500/10 text-rose-100",
                              autosaveState !== "saved" && autosaveState !== "error" && "border-violet-300/20 bg-violet-500/10 text-violet-100"
                            )}
                          >
                            {autosaveState === "pending" ? "자동 저장 대기" : autosaveState === "saving" ? "자동 저장 중" : autosaveState === "saved" ? "저장됨" : "저장 실패"}
                          </span>
                        ) : null}
                        <Badge className={cn("border", tone(result.status))}>{result.status}</Badge>
                        <Button size="sm" onClick={() => saveResult(result)} disabled={!count || savingResultId === result.id}>
                          {savingResultId === result.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          저장
                        </Button>
                      </div>
                    </div>
                    {count ? (
                      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                        {Array.from({ length: count }, (_, index) => {
                          const number = index + 1;
                          return (
                            <ResultCell
                              key={number}
                              number={number}
                              status={statuses[number] || "correct"}
                              onClick={() => toggleResultProblem(result, number)}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">이 시험의 문항 수 정보가 없습니다.</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">초록: 정답</span>
                      <span className="rounded bg-orange-500/15 px-2 py-1 text-orange-100">오렌지: 오답 {orangeCount}</span>
                      <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">빨강: 못 풂 {redCount}</span>
                      <span className="text-slate-500">클릭할 때마다 초록 → 오렌지 → 빨강 순서로 바뀝니다.</span>
                    </div>
                  </div>
                );
              })}
              {!data.paper_session_history.length ? <p className="text-sm text-slate-500">아직 기록된 세션이 없습니다.</p> : null}
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-white"><RotateCcw className="h-5 w-5" />Wrong Answer Archive</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.wrong_answers.map((wrong) => (
                <div key={wrong.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white">{wrong.problem_number}번</p>
                    <Badge className={cn("border", tone(wrong.resolved_status))}>{wrong.resolved_status}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">{wrong.problem_text}</p>
                  <p className="mt-2 text-xs text-slate-500">오답 {wrong.wrong_count}회 · {wrong.unit || "단원 정보 없음"}</p>
                </div>
              ))}
              {!data.wrong_answers.length ? <p className="text-sm text-slate-500">아직 오답 기록이 없습니다.</p> : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
