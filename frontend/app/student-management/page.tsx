"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

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
  deleteClass,
  getPaperSessionDetail,
  getStudentManagementDashboard,
  listPaperSessions,
  listWrongAnswers,
  savePaperSessionGrade,
  updateClass,
} from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type TabKey = "classes" | "students" | "sessions" | "grading" | "wrong" | "calendar" | "analytics";
type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
const emptyStudentForm = { name: "", school: "", grade_level: "", memo: "", class_id: "" };

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "classes", label: "Class Dashboard", icon: Users },
  { key: "students", label: "Students", icon: Search },
  { key: "sessions", label: "Paper Sessions", icon: FileText },
  { key: "grading", label: "Fast Grading", icon: ClipboardCheck },
  { key: "wrong", label: "Wrong Answers", icon: RotateCcw },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [problemSets, setProblemSets] = useState<ProblemSetListItem[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [sessionDetail, setSessionDetail] = useState<PaperSessionDetail | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [gridStatuses, setGridStatuses] = useState<Record<number, ProblemStatus>>({});
  const [wrongInput, setWrongInput] = useState("");
  const [classSaving, setClassSaving] = useState(false);
  const [showClassCreator, setShowClassCreator] = useState(false);
  const [editingClassId, setEditingClassId] = useState("");
  const [classEditSavingId, setClassEditSavingId] = useState("");
  const [classDeletingId, setClassDeletingId] = useState("");
  const [addingStudentClassId, setAddingStudentClassId] = useState("");
  const [classStudentSavingId, setClassStudentSavingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [classForm, setClassForm] = useState({ name: "", description: "", subject: "", grade_level: "" });
  const [classEditForm, setClassEditForm] = useState({ name: "", description: "", subject: "", grade_level: "" });
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
      setExpanded((current) => ({ ...current, [created.id]: true }));
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

  function startEditClass(classRow: ClassCard) {
    setEditingClassId(classRow.id);
    setClassEditForm({
      name: classRow.name || "",
      description: classRow.description || "",
      subject: classRow.subject || "",
      grade_level: classRow.grade_level || "",
    });
  }

  async function submitClassEdit(classId: string) {
    if (!classEditForm.name.trim()) return;
    setClassEditSavingId(classId);
    try {
      const updated = await updateClass(classId, {
        name: classEditForm.name.trim(),
        description: classEditForm.description.trim() || null,
        subject: classEditForm.subject.trim() || null,
        grade_level: classEditForm.grade_level.trim() || null,
      });
      setClasses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingClassId("");
      setMessage("클래스 정보를 수정했습니다.");
      await refresh().catch(() => undefined);
    } catch (error) {
      setMessage(errorMessage(error, "클래스 수정에 실패했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setClassEditSavingId("");
    }
  }

  async function removeClass(classRow: ClassCard) {
    const ok = window.confirm(
      `'${classRow.name}' 클래스를 삭제할까요?\n학생 계정과 기존 채점 기록은 삭제되지 않지만, 이 클래스의 학생 연결과 일정은 제거됩니다.`
    );
    if (!ok) return;
    setClassDeletingId(classRow.id);
    try {
      await deleteClass(classRow.id);
      setClasses((current) => current.filter((item) => item.id !== classRow.id));
      setExpanded((current) => {
        const next = { ...current };
        delete next[classRow.id];
        return next;
      });
      setMessage(`'${classRow.name}' 클래스를 삭제했습니다.`);
      await refresh().catch(() => undefined);
    } catch (error) {
      setMessage(errorMessage(error, "클래스 삭제에 실패했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setClassDeletingId("");
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
    setExpanded((current) => ({ ...current, [classRow.id]: true }));
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
                      <div className="flex flex-wrap gap-1.5">
                        <Link href={`/student-management/classes/${classRow.id}`}>
                          <Button size="sm" variant="outline" className="h-8 px-2 text-xs">상세</Button>
                        </Link>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => startEditClass(classRow)}>
                          수정
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => startClassStudentAdd(classRow)}>
                          학생
                        </Button>
                      </div>
                    </aside>
                    <div className="min-w-0 space-y-3 p-4">
                      {editingClassId === classRow.id ? (
                        <div className="grid gap-2 rounded-lg border border-violet-300/20 bg-violet-500/10 p-3 md:grid-cols-2 xl:grid-cols-4">
                          <Input placeholder="클래스 이름" value={classEditForm.name} onChange={(event) => setClassEditForm((current) => ({ ...current, name: event.target.value }))} />
                          <Input placeholder="레벨/설명" value={classEditForm.description} onChange={(event) => setClassEditForm((current) => ({ ...current, description: event.target.value }))} />
                          <Input placeholder="과목" value={classEditForm.subject} onChange={(event) => setClassEditForm((current) => ({ ...current, subject: event.target.value }))} />
                          <Input placeholder="학년" value={classEditForm.grade_level} onChange={(event) => setClassEditForm((current) => ({ ...current, grade_level: event.target.value }))} />
                          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
                            <Button type="button" size="sm" onClick={() => submitClassEdit(classRow.id)} disabled={classEditSavingId === classRow.id || !classEditForm.name.trim()}>
                              {classEditSavingId === classRow.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              저장
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingClassId("")}>취소</Button>
                          </div>
                        </div>
                      ) : null}
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
                    <p className="line-clamp-3 text-sm leading-6 text-slate-300">{wrong.problem_text}</p>
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
