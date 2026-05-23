"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ProblemSetListItem, api } from "@/lib/api";
import {
  ClassCard,
  PaperSessionDetail,
  PaperSessionSummary,
  StudentCard,
  WrongAnswer,
  createClass,
  createPaperSession,
  createReviewSet,
  createStudent,
  getPaperSessionDetail,
  getStudentManagementDashboard,
  listPaperSessions,
  listWrongAnswers,
  savePaperSessionGrade,
} from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type TabKey = "classes" | "students" | "sessions" | "grading" | "wrong" | "calendar" | "analytics";
type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
const emptyStudentForm = { name: "", school: "", grade_level: "", memo: "", class_id: "" };

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(status?: string) {
  if (!status) return "bg-slate-500/15 text-slate-200 border-slate-400/20";
  if (["graded", "completed", "Active", "active"].includes(status)) return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  if (["wrong", "Needs Review", "missing", "late", "unresolved"].includes(status)) return "bg-rose-500/15 text-rose-200 border-rose-400/20";
  if (["scheduled", "grading", "pending_grading", "reviewing"].includes(status)) return "bg-violet-500/15 text-violet-100 border-violet-300/20";
  return "bg-slate-500/15 text-slate-200 border-slate-400/20";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function average(values: Array<number | null | undefined>) {
  const scores = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!scores.length) return null;
  return scores.reduce((total, value) => total + value, 0) / scores.length;
}

function standardDeviation(values: Array<number | null | undefined>) {
  const scores = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (scores.length < 2) return null;
  const mean = average(scores) || 0;
  const variance = scores.reduce((total, value) => total + (value - mean) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

function scoreLabel(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}점` : "-";
}

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return candidate.message || fallback;
}

function ClassStudentCard({ student }: { student: StudentCard }) {
  return (
    <Link href={`/student-management/students/${student.id}`} className="block w-[210px] shrink-0 rounded-md border border-white/[0.08] bg-white/[0.035] p-3 transition hover:border-violet-300/40 hover:bg-violet-500/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{student.name}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{[student.school, student.grade_level].filter(Boolean).join(" · ") || "학생 정보 미입력"}</p>
        </div>
        <Badge className={cn("shrink-0 border", statusTone(student.status_chip))}>{student.status_chip}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-md bg-white/[0.04] p-2">
          <p className="text-slate-500">최근 점수</p>
          <p className="mt-1 font-semibold text-white">{student.recent_score == null ? "-" : `${Math.round(student.recent_score)}점`}</p>
        </div>
        <div className="rounded-md bg-white/[0.04] p-2">
          <p className="text-slate-500">오답</p>
          <p className="mt-1 font-semibold text-rose-100">{student.unresolved_wrong_count}</p>
        </div>
      </div>
    </Link>
  );
}

function ClassStatsPanel({
  classRow,
  details,
  loading,
}: {
  classRow: ClassCard;
  details: PaperSessionDetail[];
  loading: boolean;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(classRow.students[0]?.id || "");

  useEffect(() => {
    if (!classRow.students.length) {
      setSelectedStudentId("");
      return;
    }
    if (!selectedStudentId || !classRow.students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(classRow.students[0].id);
    }
  }, [classRow.id, classRow.students, selectedStudentId]);

  const selectedStudent = classRow.students.find((student) => student.id === selectedStudentId) || classRow.students[0] || null;
  const classStudentIds = useMemo(() => new Set(classRow.students.map((student) => student.id)), [classRow.students]);
  const sessionStats = useMemo(() => {
    return [...details]
      .sort((left, right) => {
        const leftDate = left.scheduled_at || left.created_at || "";
        const rightDate = right.scheduled_at || right.created_at || "";
        return leftDate.localeCompare(rightDate) || left.title.localeCompare(right.title);
      })
      .map((detail) => {
        const classStudents = detail.students.filter((student) => classStudentIds.has(student.id));
        const gradedClassStudents = classStudents.filter((student) => typeof student.result.score === "number" && student.result.status === "graded");
        const gradedOverallStudents = detail.students.filter((student) => typeof student.result.score === "number" && student.result.status === "graded");
        const classScores = gradedClassStudents.map((student) => student.result.score);
        const overallScores = gradedOverallStudents.map((student) => student.result.score);
        const selectedRow = selectedStudent ? classStudents.find((student) => student.id === selectedStudent.id) : null;
        const selectedScore = typeof selectedRow?.result.score === "number" && selectedRow.result.status === "graded" ? selectedRow.result.score : null;
        const classAverage = average(classScores);
        const overallAverage = average(overallScores);
        const classStdDev = standardDeviation(classScores);
        const overallStdDev = standardDeviation(overallScores);
        const rank = selectedScore == null ? null : classScores.filter((score) => typeof score === "number" && score > selectedScore).length + 1;
        const percentile = selectedScore == null || classScores.length < 2 || rank == null ? null : Math.round(((classScores.length - rank) / (classScores.length - 1)) * 100);
        const selectedMissed = (selectedRow?.problem_results || [])
          .filter((result) => result.result_status === "wrong" || result.result_status === "unanswered")
          .map((result) => result.problem_number)
          .sort((left, right) => left - right)
          .slice(0, 12);
        const classMissed = new Map<number, number>();
        for (const student of classStudents) {
          for (const result of student.problem_results || []) {
            if (result.result_status === "wrong" || result.result_status === "unanswered") {
              classMissed.set(result.problem_number, (classMissed.get(result.problem_number) || 0) + 1);
            }
          }
        }
        const commonMissed = Array.from(classMissed.entries()).sort((left, right) => right[1] - left[1] || left[0] - right[0]).slice(0, 5);
        return {
          detail,
          selectedScore,
          selectedStatus: selectedRow?.result.status || "not_started",
          classAverage,
          overallAverage,
          classStdDev,
          overallStdDev,
          rank,
          percentile,
          classGradedCount: classScores.length,
          overallGradedCount: overallScores.length,
          selectedMissed,
          commonMissed,
          showOverallAverage: detail.class_ids.length > 1,
        };
      });
  }, [classStudentIds, details, selectedStudent]);

  const selectedScores = sessionStats.map((item) => item.selectedScore);
  const selectedAverage = average(selectedScores);
  const selectedStdDev = standardDeviation(selectedScores);
  const classAverageAcross = average(sessionStats.map((item) => item.classAverage));
  const overallAverageAcross = average(sessionStats.map((item) => item.showOverallAverage ? item.overallAverage : null));
  const scoredStats = sessionStats.filter((item) => item.selectedScore != null);
  const firstScore = scoredStats[0]?.selectedScore ?? null;
  const latestScore = scoredStats[scoredStats.length - 1]?.selectedScore ?? null;
  const trend = firstScore != null && latestScore != null && scoredStats.length >= 2 ? latestScore - firstScore : null;
  const averageClassDelta = average(sessionStats.map((item) => item.selectedScore != null && item.classAverage != null ? item.selectedScore - item.classAverage : null));
  const bestExam = scoredStats.length ? scoredStats.reduce((best, item) => (item.selectedScore || 0) > (best.selectedScore || 0) ? item : best, scoredStats[0]) : null;

  return (
    <div className="border-t border-white/10 px-4 pb-4">
      <div className="rounded-lg border border-violet-300/15 bg-violet-500/[0.06] p-4">
        {loading ? (
          <div className="flex min-h-36 items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            통계 계산 중
          </div>
        ) : null}
        {!loading && !sessionStats.length ? (
          <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">아직 이 반에 연결된 시험 기록이 없습니다.</div>
        ) : null}
        {!loading && sessionStats.length ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-black text-white">{classRow.name} 성적 통계</p>
                <p className="mt-1 text-xs text-slate-500">학생을 선택하면 시험별 점수 추이와 평균, 표준편차, 석차를 함께 표시합니다.</p>
              </div>
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {classRow.students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedStudentId(student.id)}
                    className={cn(
                      "shrink-0 rounded-md border px-3 py-2 text-xs font-bold transition",
                      selectedStudent?.id === student.id ? "border-violet-300/50 bg-violet-500/25 text-white" : "border-white/10 bg-white/[0.035] text-slate-400 hover:text-white"
                    )}
                  >
                    {student.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-md bg-white/[0.045] p-3">
                <p className="text-xs text-slate-500">학생 평균</p>
                <p className="mt-1 text-lg font-black text-white">{scoreLabel(selectedAverage)}</p>
              </div>
              <div className="rounded-md bg-white/[0.045] p-3">
                <p className="text-xs text-slate-500">반 평균</p>
                <p className="mt-1 text-lg font-black text-cyan-100">{scoreLabel(classAverageAcross)}</p>
              </div>
              <div className="rounded-md bg-white/[0.045] p-3">
                <p className="text-xs text-slate-500">전체 평균</p>
                <p className="mt-1 text-lg font-black text-amber-100">{scoreLabel(overallAverageAcross)}</p>
              </div>
              <div className="rounded-md bg-white/[0.045] p-3">
                <p className="text-xs text-slate-500">점수 표준편차</p>
                <p className="mt-1 text-lg font-black text-slate-100">{selectedStdDev == null ? "-" : selectedStdDev.toFixed(1)}</p>
              </div>
              <div className="rounded-md bg-white/[0.045] p-3">
                <p className="text-xs text-slate-500">반 평균 대비</p>
                <p className={cn("mt-1 text-lg font-black", (averageClassDelta || 0) >= 0 ? "text-emerald-100" : "text-rose-100")}>{averageClassDelta == null ? "-" : `${averageClassDelta >= 0 ? "+" : ""}${averageClassDelta.toFixed(1)}`}</p>
              </div>
              <div className="rounded-md bg-white/[0.045] p-3">
                <p className="text-xs text-slate-500">추세</p>
                <p className={cn("mt-1 text-lg font-black", (trend || 0) >= 0 ? "text-emerald-100" : "text-rose-100")}>{trend == null ? "-" : `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}`}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-4 [scrollbar-width:thin]">
              <div className="min-w-[860px]">
                <div className="mb-2 grid grid-cols-[42px_minmax(0,1fr)] gap-3 text-xs text-slate-500">
                  <span>점수</span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-violet-400" />학생 점수</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-cyan-300" />반 평균</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-300" />전체 평균</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-200/20 ring-1 ring-amber-100/20" />±표준편차</span>
                  </div>
                </div>
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
                  <div className="relative h-72 text-right text-[11px] text-slate-500">
                    {[100, 75, 50, 25, 0].map((tick) => (
                      <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - tick}%` }}>{tick}</span>
                    ))}
                  </div>
                  <div className="relative h-72 border-l border-b border-white/10">
                    {[100, 75, 50, 25].map((tick) => (
                      <span key={tick} className="absolute left-0 right-0 border-t border-white/[0.06]" style={{ top: `${100 - tick}%` }} />
                    ))}
                    <div className="absolute inset-0 flex items-end gap-4 px-4 pb-11">
                      {sessionStats.map((item) => {
                        const bandAverage = item.showOverallAverage ? item.overallAverage : item.classAverage;
                        const bandStdDev = item.showOverallAverage ? item.overallStdDev : item.classStdDev;
                        const low = bandAverage == null || bandStdDev == null ? null : Math.max(0, bandAverage - bandStdDev);
                        const high = bandAverage == null || bandStdDev == null ? null : Math.min(100, bandAverage + bandStdDev);
                        const bars = [
                          { key: "student", value: item.selectedScore, color: "bg-violet-400", label: "학생" },
                          { key: "class", value: item.classAverage, color: "bg-cyan-300", label: "반 평균" },
                          { key: "overall", value: item.showOverallAverage ? item.overallAverage : null, color: "bg-amber-300", label: "전체 평균" },
                        ];
                        return (
                          <div key={item.detail.id} className="relative flex h-full w-28 shrink-0 items-end justify-center gap-1">
                            {low != null && high != null ? (
                              <span
                                className="absolute left-1 right-1 rounded bg-amber-200/10 ring-1 ring-amber-100/15"
                                style={{ bottom: `${low}%`, height: `${Math.max(2, high - low)}%` }}
                                title={`표준편차 범위 ${scoreLabel(low)} - ${scoreLabel(high)}`}
                              />
                            ) : null}
                            {bars.map((bar) => {
                              const height = bar.value == null ? 0 : Math.max(2, Math.min(100, bar.value));
                              return (
                                <span key={bar.key} className="relative flex h-full w-6 items-end justify-center">
                                  <i
                                    className={cn("w-full rounded-t-sm", bar.value == null ? "h-px bg-white/10" : bar.color)}
                                    style={{ height: bar.value == null ? undefined : `${height}%` }}
                                    title={`${item.detail.title} ${bar.label}: ${scoreLabel(bar.value)}`}
                                  />
                                </span>
                              );
                            })}
                            <div className="absolute -bottom-10 left-1/2 w-28 -translate-x-1/2 text-center">
                              <p className="truncate text-[11px] font-bold text-slate-300" title={item.detail.title}>{item.detail.title}</p>
                              <p className="mt-0.5 text-[10px] text-slate-500">{formatDate(item.detail.scheduled_at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {sessionStats.map((item) => (
                <div key={item.detail.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{item.detail.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedStudent?.name || "학생"} {scoreLabel(item.selectedScore)} · 반 평균 {scoreLabel(item.classAverage)}
                        {item.showOverallAverage ? ` · 전체 평균 ${scoreLabel(item.overallAverage)}` : ""}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0 border", statusTone(item.selectedStatus))}>{item.selectedStatus}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <span className="rounded bg-white/[0.04] px-2 py-1 text-slate-300">석차 {item.rank == null ? "-" : `${item.rank}/${item.classGradedCount}`}</span>
                    <span className="rounded bg-white/[0.04] px-2 py-1 text-slate-300">백분위 {item.percentile == null ? "-" : `${item.percentile}`}</span>
                    <span className="rounded bg-white/[0.04] px-2 py-1 text-slate-300">반 σ {item.classStdDev == null ? "-" : item.classStdDev.toFixed(1)}</span>
                    <span className="rounded bg-white/[0.04] px-2 py-1 text-slate-300">전체 n {item.overallGradedCount}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {item.selectedMissed.length ? item.selectedMissed.map((number) => (
                      <span key={number} className="rounded bg-orange-500/15 px-2 py-1 text-orange-100">{number}번</span>
                    )) : <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">학생 오답 없음</span>}
                    {item.commonMissed.slice(0, 3).map(([number, count]) => (
                      <span key={`common-${number}`} className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">반 다빈도 {number}번 {count}명</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {bestExam ? (
              <div className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs text-slate-400">
                {selectedStudent?.name || "선택 학생"} 최고 기록은 <span className="font-black text-white">{bestExam.detail.title}</span>의 <span className="font-black text-violet-100">{scoreLabel(bestExam.selectedScore)}</span>입니다.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProblemCell({
  number,
  status,
  onClick,
}: {
  number: number;
  status: ProblemStatus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-square min-h-10 items-center justify-center rounded-md border text-sm font-bold transition",
        status === "correct" && "border-emerald-300/50 bg-emerald-500/20 text-emerald-100",
        status === "wrong" && "border-orange-300/60 bg-orange-500/25 text-orange-100",
        status === "unanswered" && "border-rose-300/60 bg-rose-500/25 text-rose-100",
        status === "unmarked" && "border-white/10 bg-white/[0.035] text-slate-300 hover:border-violet-300/40"
      )}
      title={`${number}번 ${status}`}
    >
      {number}
    </button>
  );
}

export default function StudentManagementPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("classes");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [sessions, setSessions] = useState<PaperSessionSummary[]>([]);
  const [summary, setSummary] = useState({ class_count: 0, student_count: 0, active_session_count: 0, unresolved_wrong_count: 0 });
  const [statsOpen, setStatsOpen] = useState<Record<string, boolean>>({});
  const [classStatsDetails, setClassStatsDetails] = useState<Record<string, PaperSessionDetail[]>>({});
  const [classStatsLoading, setClassStatsLoading] = useState<Record<string, boolean>>({});
  const [problemSets, setProblemSets] = useState<ProblemSetListItem[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [sessionDetail, setSessionDetail] = useState<PaperSessionDetail | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [gridStatuses, setGridStatuses] = useState<Record<number, ProblemStatus>>({});
  const [wrongInput, setWrongInput] = useState("");
  const [classSaving, setClassSaving] = useState(false);
  const [showClassCreator, setShowClassCreator] = useState(false);
  const [addingStudentClassId, setAddingStudentClassId] = useState("");
  const [classStudentSavingId, setClassStudentSavingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [classForm, setClassForm] = useState({ name: "", description: "", subject: "", grade_level: "" });
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [classStudentForm, setClassStudentForm] = useState(emptyStudentForm);
  const [sessionForm, setSessionForm] = useState({
    title: "",
    source_problem_set_id: "",
    session_type: "test",
    class_id: "",
    scheduled_at: todayInput(),
    due_at: "",
  });
  const [sessionStudentIds, setSessionStudentIds] = useState<string[]>([]);

  const allStudents = useMemo(() => {
    const map = new Map<string, StudentCard>();
    for (const classRow of classes) {
      for (const student of classRow.students || []) map.set(student.id, student);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  async function refresh() {
    setLoading(true);
    try {
      const [dashboard, sets, wrongs, allSessions] = await Promise.all([
        getStudentManagementDashboard(),
        api<ProblemSetListItem[]>("/api/problem-sets").catch(() => []),
        listWrongAnswers().catch(() => []),
        listPaperSessions().catch(() => []),
      ]);
      setClasses(dashboard.classes);
      setSessions(allSessions.length ? allSessions : dashboard.recent_sessions);
      setSummary(dashboard.summary);
      setProblemSets(sets);
      setWrongAnswers(wrongs);
      if (!selectedSessionId && (allSessions[0] || dashboard.recent_sessions[0])) setSelectedSessionId((allSessions[0] || dashboard.recent_sessions[0]).id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetail(null);
      return;
    }
    getPaperSessionDetail(selectedSessionId)
      .then((detail) => {
        setSessionDetail(detail);
        const firstStudent = detail.students[0];
        setSelectedStudentId((current) => current || firstStudent?.id || "");
      })
      .catch(() => setSessionDetail(null));
  }, [selectedSessionId]);

  useEffect(() => {
    if (!sessionDetail || !selectedStudentId) {
      setGridStatuses({});
      return;
    }
    const student = sessionDetail.students.find((item) => item.id === selectedStudentId);
    const next: Record<number, ProblemStatus> = {};
    for (const problem of sessionDetail.problems) next[problem.problem_number] = "correct";
    for (const result of student?.problem_results || []) next[result.problem_number] = result.result_status;
    setGridStatuses(next);
    setWrongInput((student?.problem_results || []).filter((item) => item.result_status === "wrong").map((item) => item.problem_number).join(", "));
  }, [sessionDetail, selectedStudentId]);

  async function submitClass() {
    if (!classForm.name.trim()) return;
    setClassSaving(true);
    try {
      const created = await createClass(classForm);
      setClasses((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setClassForm({ name: "", description: "", subject: "", grade_level: "" });
      setShowClassCreator(false);
      setMessage("클래스를 만들었습니다.");
      await refresh().catch(() => undefined);
    } catch (error) {
      setMessage(errorMessage(error, "클래스 생성에 실패했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setClassSaving(false);
    }
  }

  async function submitStudent() {
    if (!studentForm.name.trim()) return;
    const created = await createStudent({
      name: studentForm.name,
      school: studentForm.school,
      grade_level: studentForm.grade_level,
      memo: studentForm.memo,
      class_ids: studentForm.class_id ? [studentForm.class_id] : [],
    });
    setStudentForm(emptyStudentForm);
    setMessage(created.invite_code ? `학생을 추가했습니다. 연결 키: ${created.invite_code}` : "학생을 추가했습니다.");
    await refresh();
  }

  function startClassStudentAdd(classRow: ClassCard) {
    setAddingStudentClassId(classRow.id);
    setClassStudentForm({
      name: "",
      school: "",
      grade_level: classRow.grade_level || "",
      memo: "",
      class_id: classRow.id,
    });
  }

  async function submitClassStudent(classRow: ClassCard) {
    if (!classStudentForm.name.trim()) return;
    setClassStudentSavingId(classRow.id);
    try {
      const created = await createStudent({
        name: classStudentForm.name.trim(),
        school: classStudentForm.school.trim(),
        grade_level: (classStudentForm.grade_level || classRow.grade_level || "").trim(),
        memo: classStudentForm.memo.trim(),
        class_ids: [classRow.id],
      });
      setAddingStudentClassId("");
      setClassStudentForm(emptyStudentForm);
      setMessage(created.invite_code ? `${classRow.name}에 학생을 추가했습니다. 연결 키: ${created.invite_code}` : `${classRow.name}에 학생을 추가했습니다.`);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "학생 추가에 실패했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setClassStudentSavingId("");
    }
  }

  async function submitSession() {
    if (!sessionForm.title.trim() || !sessionForm.source_problem_set_id || (!sessionForm.class_id && !sessionStudentIds.length)) return;
    const session = await createPaperSession({
      title: sessionForm.title,
      source_problem_set_id: sessionForm.source_problem_set_id,
      session_type: sessionForm.session_type,
      class_ids: sessionForm.class_id ? [sessionForm.class_id] : [],
      student_membership_ids: sessionStudentIds,
      scheduled_at: sessionForm.scheduled_at ? `${sessionForm.scheduled_at}T00:00:00` : null,
      due_at: sessionForm.due_at ? `${sessionForm.due_at}T23:59:00` : null,
      status: "scheduled",
      create_calendar_events: true,
    });
    setSessionForm({ title: "", source_problem_set_id: "", session_type: "test", class_id: "", scheduled_at: todayInput(), due_at: "" });
    setSessionStudentIds([]);
    setSelectedSessionId(session.id);
    setActiveTab("grading");
    setMessage("세션을 만들었습니다. 바로 채점 입력을 시작할 수 있습니다.");
    await refresh();
  }

  function toggleProblem(number: number) {
    setGridStatuses((current) => {
      const currentStatus = current[number] || "correct";
      const nextStatus = currentStatus === "correct" ? "wrong" : currentStatus === "wrong" ? "unanswered" : "correct";
      return { ...current, [number]: nextStatus };
    });
  }

  function applyWrongInput() {
    if (!sessionDetail) return;
    const wrongs = new Set(
      wrongInput
        .split(/[\s,;/]+/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
    );
    const next: Record<number, ProblemStatus> = {};
    for (const problem of sessionDetail.problems) next[problem.problem_number] = wrongs.has(problem.problem_number) ? "wrong" : "correct";
    setGridStatuses(next);
  }

  function markAll(status: ProblemStatus) {
    if (!sessionDetail) return;
    const next: Record<number, ProblemStatus> = {};
    for (const problem of sessionDetail.problems) next[problem.problem_number] = status;
    setGridStatuses(next);
    if (status === "correct") setWrongInput("");
  }

  async function saveGradeAndNext() {
    if (!sessionDetail || !selectedStudentId) return;
    setSaving(true);
    try {
      const statuses = sessionDetail.problems.map((problem) => ({
        problem_id: problem.problem_id,
        problem_number: problem.problem_number,
        result_status: gridStatuses[problem.problem_number] || "unmarked",
      }));
      const detail = await savePaperSessionGrade(sessionDetail.id, {
        student_membership_id: selectedStudentId,
        statuses,
        mark_unlisted_correct: false,
      });
      setSessionDetail(detail);
      const currentIndex = detail.students.findIndex((student) => student.id === selectedStudentId);
      const nextStudent = detail.students[currentIndex + 1];
      if (nextStudent) setSelectedStudentId(nextStudent.id);
      setMessage(nextStudent ? `${nextStudent.name} 학생으로 이동했습니다.` : "현재 세션의 마지막 학생까지 저장했습니다.");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function makeReviewSet(filter?: { class_id?: string; student_membership_id?: string }) {
    const review = await createReviewSet({
      title: "오답 복습 세트",
      class_id: filter?.class_id || null,
      student_membership_id: filter?.student_membership_id || null,
      unresolved_only: true,
    });
    setMessage(`복습 세트를 만들었습니다: ${review.name}`);
  }

  function classSessionCount(classId: string) {
    return sessions.filter((session) => session.class_ids.includes(classId)).length;
  }

  async function loadClassStats(classId: string) {
    const targetSessions = sessions.filter((session) => session.class_ids.includes(classId));
    setClassStatsLoading((current) => ({ ...current, [classId]: true }));
    try {
      const details = await Promise.all(targetSessions.map((session) => getPaperSessionDetail(session.id)));
      setClassStatsDetails((current) => ({ ...current, [classId]: details }));
    } catch (error) {
      setMessage(errorMessage(error, "클래스 통계를 불러오지 못했습니다."));
      setClassStatsDetails((current) => ({ ...current, [classId]: [] }));
    } finally {
      setClassStatsLoading((current) => ({ ...current, [classId]: false }));
    }
  }

  function toggleClassStats(classRow: ClassCard) {
    const nextOpen = !statsOpen[classRow.id];
    setStatsOpen((current) => ({ ...current, [classRow.id]: nextOpen }));
    if (nextOpen && !classStatsDetails[classRow.id] && !classStatsLoading[classRow.id]) {
      void loadClassStats(classRow.id);
    }
  }

  const selectedStudent = sessionDetail?.students.find((student) => student.id === selectedStudentId);

  return (
    <main className="min-h-screen bg-transparent px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-300">Student Management</p>
            <p className="text-sm text-slate-500">Class Dashboard</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["클래스", summary.class_count],
              ["학생", summary.student_count],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-[92px] items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-base font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </header>

        {message ? (
          <div className="flex items-center justify-between rounded-lg border border-violet-300/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage("")} className="rounded p-1 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            학생관리 데이터를 불러오는 중입니다.
          </div>
        ) : null}

        {!loading ? (
          <section className="space-y-3">
            {classes.map((classRow) => (
              <Card key={classRow.id} className="overflow-visible rounded-none border-0 border-t border-white/10 bg-transparent shadow-none">
                <CardContent className="p-0">
                  <div className="grid min-h-[168px] lg:grid-cols-[180px_minmax(0,1fr)]">
                    <aside className="flex flex-col justify-between gap-4 border-b border-white/10 bg-transparent p-4 lg:border-b-0 lg:border-r">
                      <div>
                        <p className="text-3xl font-black tracking-normal text-white">{classRow.name}</p>
                        <p className="mt-2 text-2xl font-black text-slate-200">{classRow.student_count}</p>
                        <p className="text-xs text-slate-500">학생</p>
                        <p className="mt-3 truncate text-xs text-slate-500">{[classRow.subject, classRow.grade_level].filter(Boolean).join(" · ") || classRow.description || "클래스 정보 없음"}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`${classRow.name} 통계`}
                        title={`${classRow.name} 통계`}
                        onClick={() => toggleClassStats(classRow)}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-md border transition",
                          statsOpen[classRow.id] ? "border-violet-300/50 bg-violet-500/20 text-violet-100" : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-violet-300/40 hover:text-white"
                        )}
                      >
                        <BarChart3 className="h-5 w-5" />
                      </button>
                    </aside>
                    <div className="min-w-0 space-y-3 p-4">
                      {addingStudentClassId === classRow.id ? (
                        <form
                          className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            submitClassStudent(classRow);
                          }}
                        >
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                            <Input placeholder="학생 이름" value={classStudentForm.name} onChange={(event) => setClassStudentForm((current) => ({ ...current, name: event.target.value }))} />
                            <Input placeholder="학교" value={classStudentForm.school} onChange={(event) => setClassStudentForm((current) => ({ ...current, school: event.target.value }))} />
                            <Input placeholder="학년" value={classStudentForm.grade_level} onChange={(event) => setClassStudentForm((current) => ({ ...current, grade_level: event.target.value }))} />
                            <Input placeholder="메모" value={classStudentForm.memo} onChange={(event) => setClassStudentForm((current) => ({ ...current, memo: event.target.value }))} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="submit" size="sm" disabled={classStudentSavingId === classRow.id || !classStudentForm.name.trim()}>
                              {classStudentSavingId === classRow.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              저장
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => { setAddingStudentClassId(""); setClassStudentForm(emptyStudentForm); }}>취소</Button>
                          </div>
                        </form>
                      ) : null}
                      {classRow.students.length ? (
                        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-color:#2f3543_transparent] [scrollbar-width:thin]">
                          {classRow.students.map((student) => (
                            <ClassStudentCard key={student.id} student={student} />
                          ))}
                        </div>
                      ) : (
                        <button type="button" onClick={() => startClassStudentAdd(classRow)} className="flex h-full min-h-[116px] w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-500 hover:border-violet-300/30 hover:text-violet-100">
                          학생 추가
                        </button>
                      )}
                    </div>
                  </div>
                  {statsOpen[classRow.id] ? (
                    <ClassStatsPanel
                      classRow={classRow}
                      details={classStatsDetails[classRow.id] || []}
                      loading={Boolean(classStatsLoading[classRow.id])}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {!classes.length ? (
              <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">아직 클래스가 없습니다. 오른쪽 아래 + 버튼으로 클래스를 만들 수 있습니다.</div>
            ) : null}
          </section>
        ) : null}

        {!loading && activeTab === "students" ? (
          <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <CardTitle className="text-white">학생 추가</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitStudent();
                  }}
                >
                  <Input placeholder="학생 이름" value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} />
                  <Input placeholder="학교" value={studentForm.school} onChange={(event) => setStudentForm((current) => ({ ...current, school: event.target.value }))} />
                  <Input placeholder="학년" value={studentForm.grade_level} onChange={(event) => setStudentForm((current) => ({ ...current, grade_level: event.target.value }))} />
                  <Select value={studentForm.class_id} onChange={(event) => setStudentForm((current) => ({ ...current, class_id: event.target.value }))}>
                    <option value="">클래스 선택 안 함</option>
                    {classes.map((classRow) => <option key={classRow.id} value={classRow.id}>{classRow.name}</option>)}
                  </Select>
                  <Input placeholder="메모" value={studentForm.memo} onChange={(event) => setStudentForm((current) => ({ ...current, memo: event.target.value }))} />
                  <Button type="submit" className="w-full" disabled={!studentForm.name.trim()}>학생 추가</Button>
                </form>
              </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {allStudents.map((student) => <ClassStudentCard key={student.id} student={student} />)}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "sessions" ? (
          <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <CardTitle className="text-white">문제 세트 배정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="세션 제목" value={sessionForm.title} onChange={(event) => setSessionForm((current) => ({ ...current, title: event.target.value }))} />
                <Select value={sessionForm.source_problem_set_id} onChange={(event) => setSessionForm((current) => ({ ...current, source_problem_set_id: event.target.value }))}>
                  <option value="">문제 세트 선택</option>
                  {problemSets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.item_count})</option>)}
                </Select>
                <Select value={sessionForm.class_id} onChange={(event) => setSessionForm((current) => ({ ...current, class_id: event.target.value }))}>
                  <option value="">대상 클래스 선택</option>
                  {classes.map((classRow) => <option key={classRow.id} value={classRow.id}>{classRow.name}</option>)}
                </Select>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">개별 학생 추가 선택</p>
                  <div className="mt-2 grid max-h-36 gap-1 overflow-auto pr-1">
                    {allStudents.map((student) => {
                      const checked = sessionStudentIds.includes(student.id);
                      return (
                        <label key={student.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-white/[0.05]">
                          <span className="truncate">{student.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setSessionStudentIds((current) =>
                                event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id)
                              )
                            }
                          />
                        </label>
                      );
                    })}
                    {!allStudents.length ? <p className="text-sm text-slate-500">먼저 학생을 추가하세요.</p> : null}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={sessionForm.session_type} onChange={(event) => setSessionForm((current) => ({ ...current, session_type: event.target.value }))}>
                    <option value="test">시험</option>
                    <option value="homework">숙제</option>
                    <option value="review">복습</option>
                    <option value="mock_exam">모의고사</option>
                    <option value="practice">연습</option>
                  </Select>
                  <Input type="date" value={sessionForm.scheduled_at} onChange={(event) => setSessionForm((current) => ({ ...current, scheduled_at: event.target.value }))} />
                </div>
                <Input type="date" value={sessionForm.due_at} onChange={(event) => setSessionForm((current) => ({ ...current, due_at: event.target.value }))} />
                <Button className="w-full" onClick={submitSession}>PaperSession 만들기</Button>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {sessions.map((session) => (
                <button key={session.id} type="button" onClick={() => { setSelectedSessionId(session.id); setActiveTab("grading"); }} className="w-full rounded-lg border border-white/10 bg-white/[0.035] p-4 text-left hover:border-violet-300/40">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">{session.title}</p>
                      <p className="mt-1 text-sm text-slate-400">{formatDate(session.scheduled_at)} · {session.session_type} · {session.problem_count}문항</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("border", statusTone(session.status))}>{session.status}</Badge>
                      <span className="text-sm text-slate-400">{session.graded_count}/{session.assigned_count} 채점</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "grading" ? (
          <section className="grid min-h-[620px] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <CardTitle className="text-white">채점할 세션</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={selectedSessionId} onChange={(event) => { setSelectedSessionId(event.target.value); setSelectedStudentId(""); }}>
                  <option value="">세션 선택</option>
                  {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
                </Select>
                <div className="space-y-2">
                  {sessionDetail?.students.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition",
                        selectedStudentId === student.id ? "border-violet-300/50 bg-violet-500/15" : "border-white/10 bg-black/20 hover:border-violet-300/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-white">{student.name}</span>
                        <Badge className={cn("border", statusTone(student.result.status))}>{student.result.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{student.result.correct_count}/{student.result.total_count || sessionDetail.problem_count} 정답</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader className="border-b border-white/10">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-white">{sessionDetail?.title || "세션을 선택하세요"}</CardTitle>
                    <p className="mt-1 text-sm text-slate-400">{selectedStudent ? `${selectedStudent.name} · ${sessionDetail?.problem_count || 0}문항` : "학생을 선택하면 문제 번호 그리드가 표시됩니다."}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => markAll("correct")}>전체 정답</Button>
                    <Button size="sm" variant="outline" onClick={() => markAll("unmarked")}>초기화</Button>
                    <Button size="sm" onClick={saveGradeAndNext} disabled={!selectedStudent || saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      저장 후 다음
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                  <Input placeholder="틀린 번호만 입력: 3, 7, 12" value={wrongInput} onChange={(event) => setWrongInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyWrongInput(); }} />
                  <Button variant="outline" onClick={applyWrongInput}>틀린 번호 적용</Button>
                </div>
                {sessionDetail && selectedStudent ? (
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-[repeat(15,minmax(0,1fr))]">
                    {sessionDetail.problems.map((problem) => (
                      <ProblemCell
                        key={problem.problem_id}
                        number={problem.problem_number}
                        status={gridStatuses[problem.problem_number] || "correct"}
                        onClick={() => toggleProblem(problem.problem_number)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">세션과 학생을 선택하세요.</div>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">초록: 정답</span>
                  <span className="rounded bg-orange-500/15 px-2 py-1 text-orange-100">오렌지: 오답</span>
                  <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">빨강: 못 풂</span>
                  <span className="rounded bg-white/[0.06] px-2 py-1">회색: 미채점</span>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {!loading && activeTab === "wrong" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">오답 아카이브</h2>
              <Button onClick={() => makeReviewSet()}>
                <RotateCcw className="h-4 w-4" />
                전체 미해결 오답으로 복습 세트
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {wrongAnswers.map((wrong) => (
                <Card key={wrong.id} className="border-white/10 bg-white/[0.035]">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base text-white">{wrong.student_name} · {wrong.problem_number}번</CardTitle>
                        <p className="mt-1 text-xs text-slate-500">{[wrong.subject, wrong.unit].filter(Boolean).join(" · ") || "단원 정보 없음"}</p>
                      </div>
                      <Badge className={cn("border", statusTone(wrong.resolved_status))}>{wrong.resolved_status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MathText className="line-clamp-3 text-sm leading-6 text-slate-300" value={wrong.problem_text} />
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span>오답 {wrong.wrong_count}회</span>
                      <span>{formatDate(wrong.latest_wrong_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "calendar" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classes.map((classRow) => (
              <Card key={classRow.id} className="border-white/10 bg-white/[0.035]">
                <CardHeader>
                  <CardTitle className="text-white">{classRow.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(classRow.paper_sessions || sessions.filter((session) => session.class_ids.includes(classRow.id))).slice(0, 6).map((session) => (
                    <div key={session.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-sm font-semibold text-white">{session.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(session.scheduled_at)} · {session.session_type}</p>
                    </div>
                  ))}
                  {!sessions.some((session) => session.class_ids.includes(classRow.id)) ? <p className="text-sm text-slate-500">등록된 일정이 없습니다.</p> : null}
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        {!loading && activeTab === "analytics" ? (
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <CardTitle className="text-white">채점 진행</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.map((session) => {
                  const ratio = session.assigned_count ? Math.round((session.graded_count / session.assigned_count) * 100) : 0;
                  return (
                    <div key={session.id}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">{session.title}</span>
                        <span className="text-slate-500">{ratio}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/10">
                        <div className="h-2 rounded-full bg-violet-400" style={{ width: `${ratio}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.035] lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-white">클래스별 오답 현황</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {classes.map((classRow) => (
                  <div key={classRow.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">{classRow.name}</p>
                      <span className="text-rose-100">{classRow.unresolved_wrong_count}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{classRow.student_count}명 · 세션 {classSessionCount(classRow.id)}개</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}
        {showClassCreator ? (
          <div className="fixed bottom-24 right-6 z-40 w-[min(360px,calc(100vw-48px))] rounded-lg border border-white/10 bg-[#11121a] p-4 shadow-2xl shadow-black/50">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-white">클래스 만들기</p>
              <button type="button" onClick={() => setShowClassCreator(false)} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <Input placeholder="클래스 이름" value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))} />
              <Input placeholder="레벨/설명" value={classForm.description} onChange={(event) => setClassForm((current) => ({ ...current, description: event.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="과목" value={classForm.subject} onChange={(event) => setClassForm((current) => ({ ...current, subject: event.target.value }))} />
                <Input placeholder="학년" value={classForm.grade_level} onChange={(event) => setClassForm((current) => ({ ...current, grade_level: event.target.value }))} />
              </div>
              <Button type="button" className="w-full" onClick={submitClass} disabled={classSaving || !classForm.name.trim()}>
                {classSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                클래스 추가
              </Button>
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          onClick={() => setShowClassCreator((current) => !current)}
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-2xl shadow-violet-950/40"
          aria-label="클래스 만들기"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </main>
  );
}
