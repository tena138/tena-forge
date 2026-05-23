"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Download, FileText, Loader2, MessageSquareText, RotateCcw, UserRound } from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CounselingLog,
  ScheduleEvent,
  StudentCard,
  WrongAnswer,
  createCounselingLog,
  createReviewSet,
  getStudentDetail,
  savePaperSessionGrade,
} from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
type AutosaveState = "pending" | "saving" | "saved" | "error";
type StudentTab = "calendar" | "wrong" | "counseling";
type StudentCalendarItem = {
  id: string;
  date: string;
  title: string;
  meta: string;
  description: string;
  kind: "수업" | "시험";
};

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
  schedule_events: ScheduleEvent[];
  counseling_logs: CounselingLog[];
  analytics: {
    graded_count?: number;
    average_score?: number | null;
    unresolved_wrong_count?: number;
  };
};

function tone(status?: string) {
  if (["graded", "completed", "resolved", "mastered", "Active", "class"].includes(status || "")) return "bg-emerald-500/15 text-emerald-100 border-emerald-400/20";
  if (["unresolved", "Needs Review", "wrong"].includes(status || "")) return "bg-rose-500/15 text-rose-100 border-rose-400/20";
  return "bg-violet-500/15 text-violet-100 border-violet-300/20";
}

function dateLabel(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthTitle(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(value);
}

function moveMonth(value: Date, offset: number) {
  return new Date(value.getFullYear(), value.getMonth() + offset, 1);
}

function buildMonthDays(value: Date) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function problemCount(result: StudentDetail["paper_session_history"][number]) {
  return (
    result.total_count ||
    result.session?.problem_count ||
    Math.max(0, ...result.problem_results.map((item) => item.problem_number))
  );
}

function studentCalendarItems(student: StudentDetail): StudentCalendarItem[] {
  const eventItems = (student.schedule_events || []).map((event) => ({
    id: `event-${event.id}`,
    date: event.starts_at,
    title: event.title,
    meta: event.event_type,
    description: event.description || "",
    kind: "수업" as const,
  }));
  const sessionItems = student.paper_session_history
    .filter((result) => result.session?.scheduled_at)
    .map((result) => ({
      id: `session-${result.id}`,
      date: result.session?.scheduled_at || "",
      title: result.session?.title || "Paper Session",
      meta: result.status,
      description: `${result.score == null ? "-" : `${Math.round(result.score)}점`} · ${problemCount(result)}문항`,
      kind: "시험" as const,
    }));
  return [...eventItems, ...sessionItems]
    .filter((item) => dateKey(item.date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function closestCalendarItem(items: StudentCalendarItem[]) {
  if (!items.length) return null;
  const now = new Date();
  const upcoming = items.filter((item) => new Date(item.date).getTime() >= now.getTime()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  return upcoming || [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

function calendarBlockClass(item: StudentCalendarItem) {
  if (item.kind === "시험") return "border-orange-300/30 bg-orange-500/20 text-orange-50 hover:bg-orange-500/30";
  if (item.meta === "homework") return "border-sky-300/30 bg-sky-500/20 text-sky-50 hover:bg-sky-500/30";
  if (item.meta === "review") return "border-emerald-300/30 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30";
  return "border-violet-300/30 bg-violet-500/20 text-violet-50 hover:bg-violet-500/30";
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
  const [activeTab, setActiveTab] = useState<StudentTab>("calendar");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => dateKey(new Date()));
  const [resultStatuses, setResultStatuses] = useState<Record<string, Record<number, ProblemStatus>>>({});
  const [savingResultId, setSavingResultId] = useState("");
  const [autosaveStates, setAutosaveStates] = useState<Record<string, AutosaveState>>({});
  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const calendarInitializedRef = useRef(false);
  const [message, setMessage] = useState("");
  const [counselingSaving, setCounselingSaving] = useState(false);
  const [counselingForm, setCounselingForm] = useState({
    counseling_date: new Date().toISOString().slice(0, 10),
    title: "학습 상담",
    notes: "",
    weekly_report: "",
    next_plan: "",
  });

  const calendarItems = useMemo(() => (data ? studentCalendarItems(data) : []), [data]);
  const calendarDays = useMemo(() => buildMonthDays(calendarMonth), [calendarMonth]);
  const calendarItemsByDate = useMemo(() => {
    const grouped: Record<string, StudentCalendarItem[]> = {};
    for (const item of calendarItems) {
      const key = dateKey(item.date);
      if (!key) continue;
      grouped[key] = [...(grouped[key] || []), item].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    }
    return grouped;
  }, [calendarItems]);
  const selectedCalendarItems = calendarItemsByDate[selectedCalendarDate] || [];

  function applyStudentData(student: StudentDetail) {
    setData(student);
    const next: Record<string, Record<number, ProblemStatus>> = {};
    for (const result of student.paper_session_history) next[result.id] = buildStatuses(result);
    setResultStatuses(next);
    if (!calendarInitializedRef.current) {
      const target = closestCalendarItem(studentCalendarItems(student));
      if (target) {
        const targetDate = new Date(target.date);
        setCalendarMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
        setSelectedCalendarDate(dateKey(target.date));
      }
      calendarInitializedRef.current = true;
    }
  }

  useEffect(() => {
    calendarInitializedRef.current = false;
    getStudentDetail(params.id).then((student) => applyStudentData(student as StudentDetail)).catch(() => setData(null));
  }, [params.id]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(autosaveTimers.current)) clearTimeout(timer);
    };
  }, []);

  async function refreshStudent() {
    const refreshed = await getStudentDetail(params.id);
    applyStudentData(refreshed as StudentDetail);
  }

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
        await refreshStudent();
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

  async function saveCounselingLog() {
    if (!data || !counselingForm.title.trim()) return;
    setCounselingSaving(true);
    try {
      await createCounselingLog(data.id, {
        counseling_date: counselingForm.counseling_date ? `${counselingForm.counseling_date}T00:00:00` : null,
        title: counselingForm.title.trim(),
        notes: counselingForm.notes,
        weekly_report: counselingForm.weekly_report,
        next_plan: counselingForm.next_plan,
      });
      await refreshStudent();
      setCounselingForm((current) => ({ ...current, notes: "", weekly_report: "", next_plan: "" }));
      setMessage("상담일지를 저장했습니다.");
    } catch {
      setMessage("상담일지 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setCounselingSaving(false);
    }
  }

  function exportCounselingLogs() {
    if (!data) return;
    const content = [
      `${data.name} 학습 상담 기록`,
      `소속: ${data.class_names.join(", ") || "-"}`,
      "",
      ...(data.counseling_logs || []).flatMap((log) => [
        `## ${shortDate(log.counseling_date)} ${log.title}`,
        "",
        `[상담 내용]`,
        log.notes || "-",
        "",
        `[주간 리포트]`,
        log.weekly_report || "-",
        "",
        `[다음 지도 계획]`,
        log.next_plan || "-",
        "",
      ]),
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.name}_학습상담기록.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
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

        <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {[
            { id: "calendar", label: "캘린더", icon: CalendarDays },
            { id: "wrong", label: "오답", icon: RotateCcw },
            { id: "counseling", label: "학습 상담", icon: MessageSquareText },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as StudentTab)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
                  activeTab === tab.id ? "bg-violet-500 text-white shadow-lg shadow-violet-950/30" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "calendar" ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-white"><CalendarDays className="h-5 w-5" />캘린더</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="outline" onClick={() => setCalendarMonth((current) => moveMonth(current, -1))} aria-label="이전 달">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-32 text-center text-sm font-black text-white">{monthTitle(calendarMonth)}</div>
                    <Button type="button" size="icon" variant="outline" onClick={() => setCalendarMonth((current) => moveMonth(current, 1))} aria-label="다음 달">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[840px]">
                    <div className="grid grid-cols-7 border-y border-white/10 bg-white/[0.025] text-center text-xs font-semibold text-slate-500">
                      {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                        <div key={day} className="px-2 py-2">{day}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 border-l border-white/10">
                      {calendarDays.map((day) => {
                        const key = dateKey(day);
                        const items = calendarItemsByDate[key] || [];
                        const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                        const isToday = key === dateKey(new Date());
                        const isSelected = key === selectedCalendarDate;
                        return (
                          <div
                            key={key}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedCalendarDate(key)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") setSelectedCalendarDate(key);
                            }}
                            className={cn(
                              "min-h-[138px] border-b border-r border-white/10 p-2 text-left outline-none transition",
                              isCurrentMonth ? "bg-black/15" : "bg-black/35 text-slate-600",
                              isSelected && "bg-violet-500/10 ring-1 ring-inset ring-violet-300/50",
                              "hover:bg-white/[0.04]"
                            )}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-black",
                                  isCurrentMonth ? "text-slate-200" : "text-slate-600",
                                  isToday && "bg-violet-500 text-white"
                                )}
                              >
                                {day.getDate()}
                              </span>
                              {items.length ? <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">{items.length}</span> : null}
                            </div>
                            <div className="space-y-1">
                              {items.slice(0, 4).map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedCalendarDate(key);
                                  }}
                                  className={cn(
                                    "block w-full truncate rounded border px-2 py-1 text-left text-[11px] font-semibold leading-4 transition",
                                    calendarBlockClass(item)
                                  )}
                                  title={`${item.title} · ${dateLabel(item.date)}`}
                                >
                                  {item.title}
                                </button>
                              ))}
                              {items.length > 4 ? <div className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-400">+{items.length - 4}개 더</div> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {!calendarItems.length ? <p className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">아직 이 학생에게 표시할 수업 일정이나 시험 일정이 없습니다.</p> : null}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <CardTitle className="text-white">{shortDate(`${selectedCalendarDate}T00:00:00`)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedCalendarItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-violet-200">{dateLabel(item.date)}</p>
                        <p className="mt-1 font-black text-white">{item.title}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Badge className="border border-white/10 bg-white/[0.06] text-slate-200">{item.kind}</Badge>
                        <Badge className={cn("border", tone(item.meta))}>{item.meta}</Badge>
                      </div>
                    </div>
                    {item.description ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-300">{item.description}</p> : null}
                  </div>
                ))}
                {!selectedCalendarItems.length ? <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">선택한 날짜에 등록된 일정이 없습니다.</p> : null}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {activeTab === "wrong" ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-white"><FileText className="h-5 w-5" />오답 체크</CardTitle></CardHeader>
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
                            return <ResultCell key={number} number={number} status={statuses[number] || "correct"} onClick={() => toggleResultProblem(result, number)} />;
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">이 시험의 문항 수 정보가 없습니다.</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">초록: 정답</span>
                        <span className="rounded bg-orange-500/15 px-2 py-1 text-orange-100">오렌지: 오답 {orangeCount}</span>
                        <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">빨강: 못 풂 {redCount}</span>
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
                    <MathText className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300" value={wrong.problem_text} />
                    <p className="mt-2 text-xs text-slate-500">오답 {wrong.wrong_count}회 · {wrong.unit || "단원 정보 없음"}</p>
                  </div>
                ))}
                {!data.wrong_answers.length ? <p className="text-sm text-slate-500">아직 오답 기록이 없습니다.</p> : null}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {activeTab === "counseling" ? (
          <section className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader><CardTitle className="flex items-center gap-2 text-white"><MessageSquareText className="h-5 w-5" />상담일지 작성</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input type="date" value={counselingForm.counseling_date} onChange={(event) => setCounselingForm((current) => ({ ...current, counseling_date: event.target.value }))} />
                <Input placeholder="상담 제목" value={counselingForm.title} onChange={(event) => setCounselingForm((current) => ({ ...current, title: event.target.value }))} />
                <textarea
                  className="min-h-32 w-full rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-300/50"
                  placeholder="상담하면서 기록할 내용"
                  value={counselingForm.notes}
                  onChange={(event) => setCounselingForm((current) => ({ ...current, notes: event.target.value }))}
                />
                <textarea
                  className="min-h-28 w-full rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-300/50"
                  placeholder="주간 리포트 초안"
                  value={counselingForm.weekly_report}
                  onChange={(event) => setCounselingForm((current) => ({ ...current, weekly_report: event.target.value }))}
                />
                <textarea
                  className="min-h-24 w-full rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-300/50"
                  placeholder="다음 지도 계획 / 과제 제안"
                  value={counselingForm.next_plan}
                  onChange={(event) => setCounselingForm((current) => ({ ...current, next_plan: event.target.value }))}
                />
                <Button className="w-full" onClick={saveCounselingLog} disabled={counselingSaving || !counselingForm.title.trim()}>
                  {counselingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  상담일지 저장
                </Button>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-white">상담 기록</CardTitle>
                  <Button size="sm" variant="outline" onClick={exportCounselingLogs} disabled={!data.counseling_logs.length}>
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.counseling_logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm text-violet-200">{shortDate(log.counseling_date)}</p>
                        <p className="mt-1 text-lg font-black text-white">{log.title}</p>
                      </div>
                      <Badge className="border border-violet-300/20 bg-violet-500/15 text-violet-100">상담</Badge>
                    </div>
                    <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                      <p className="whitespace-pre-line">{log.notes || "상담 내용 없음"}</p>
                      {log.weekly_report ? <p className="whitespace-pre-line rounded-lg border border-white/10 bg-white/[0.03] p-3"><span className="font-semibold text-white">주간 리포트</span><br />{log.weekly_report}</p> : null}
                      {log.next_plan ? <p className="whitespace-pre-line rounded-lg border border-white/10 bg-white/[0.03] p-3"><span className="font-semibold text-white">다음 지도 계획</span><br />{log.next_plan}</p> : null}
                    </div>
                  </div>
                ))}
                {!data.counseling_logs.length ? <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">아직 상담 기록이 없습니다.</p> : null}
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </main>
  );
}
