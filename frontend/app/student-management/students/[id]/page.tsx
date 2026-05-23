"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, RotateCcw, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentCard, WrongAnswer, createReviewSet, getStudentDetail } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type StudentDetail = StudentCard & {
  paper_session_history: Array<{
    id: string;
    status: string;
    score?: number | null;
    correct_count: number;
    wrong_count: number;
    total_count: number;
    session?: { title?: string; session_type?: string; scheduled_at?: string | null } | null;
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

export default function StudentManagementStudentPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<StudentDetail | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getStudentDetail(params.id).then((student) => setData(student as StudentDetail)).catch(() => setData(null));
  }, [params.id]);

  async function makeReviewSet() {
    if (!data) return;
    const review = await createReviewSet({ title: `${data.name} 오답 복습 세트`, student_membership_id: data.id, unresolved_only: true });
    setMessage(`복습 세트를 만들었습니다: ${review.name}`);
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
              {data.paper_session_history.map((result) => (
                <div key={result.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white">{result.session?.title || "Paper Session"}</p>
                    <Badge className={cn("border", tone(result.status))}>{result.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{result.score == null ? "-" : `${Math.round(result.score)}점`} · 정답 {result.correct_count} · 오답 {result.wrong_count}</p>
                </div>
              ))}
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
