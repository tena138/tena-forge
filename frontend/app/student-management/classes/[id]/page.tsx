"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ClipboardCheck, Clock, Copy, Loader2, Plus, RotateCcw, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatLocalDateTime } from "@/lib/datetime";
import {
  ScheduleRecurrenceUnit,
  buildRecurringDateTimes,
  dayIntervalOptions,
  defaultMonthDayFromDateTime,
  defaultWeekdayFromDateTime,
  localDateTimeInputValue,
  monthDayOptions,
  monthIntervalOptions,
  scheduleWeekdays,
  weekIntervalOptions,
} from "@/lib/scheduleRecurrence";
import { ClassCard, ScheduleEvent, createReviewSet, createScheduleEvent, deleteClass, getClassDetail, updateClass } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type ClassTab = "students" | "calendar";

function tone(status?: string) {
  if (status === "completed" || status === "graded" || status === "Active") return "bg-black text-white";
  if (status === "grading" || status === "scheduled" || status === "class") return "bg-zinc-200 text-zinc-950";
  return "bg-zinc-100 text-zinc-700";
}

function dateLabel(value?: string | null) {
  return formatLocalDateTime(value, {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }, value || "-");
}

function isPendingKeyCard(student: ClassCard["students"][number]) {
  return student.card_type === "pending_key" || student.status === "pending_key";
}

function studentKeyLabel(student: ClassCard["students"][number]) {
  const key = student.invite_codes?.[0];
  if (key?.invite_code) return key.invite_code;
  if (key?.invite_code_preview) return `****${key.invite_code_preview}`;
  return student.invite_code || (student.invite_code_preview ? `****${student.invite_code_preview}` : "-");
}

function studentRawInviteCode(student: ClassCard["students"][number]) {
  const metadata = (student.invite_metadata || {}) as Record<string, unknown>;
  const key = student.invite_codes?.[0];
  const directCode = key?.invite_code || student.invite_code || metadata.key_code || metadata.invite_code;
  return typeof directCode === "string" ? directCode.trim() : "";
}

function studentKeyPreviewLabel(student: ClassCard["students"][number]) {
  const key = student.invite_codes?.[0];
  const preview = key?.invite_code_preview || student.invite_code_preview;
  if (preview) return `****${preview}`;
  const directCode = studentRawInviteCode(student);
  return directCode ? `****${directCode.slice(-4)}` : studentKeyLabel(student);
}

function composeScheduleDescription(lessonPlan: string, assignmentNote: string) {
  return [
    lessonPlan.trim() ? `수업 지도\n${lessonPlan.trim()}` : "",
    assignmentNote.trim() ? `과제\n${assignmentNote.trim()}` : "",
  ].filter(Boolean).join("\n\n") || null;
}

export default function StudentManagementClassPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [data, setData] = useState<ClassCard | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ClassTab>("students");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [recurrence, setRecurrence] = useState<ScheduleRecurrenceUnit>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
  const [recurrenceMonthDay, setRecurrenceMonthDay] = useState("");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [editForm, setEditForm] = useState({ name: "", description: "", subject: "", grade_level: "" });
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    event_type: "class",
    starts_at: "",
    ends_at: "",
    lesson_plan: "",
    assignment_note: "",
  });

  useEffect(() => {
    getClassDetail(resolvedParams.id).then(setData).catch(() => setData(null));
  }, [resolvedParams.id]);

  const events = useMemo(() => data?.schedule_events || [], [data]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) || events[0] || null;
  const selectedWeekdays = recurrenceWeekdays.length ? recurrenceWeekdays : [defaultWeekdayFromDateTime(scheduleForm.starts_at)];
  const selectedMonthDay = Number(recurrenceMonthDay) || defaultMonthDayFromDateTime(scheduleForm.starts_at);
  const classStudentCards = data?.students || [];
  const classStudents = classStudentCards.filter((student) => !isPendingKeyCard(student));
  const pendingKeyCount = classStudentCards.length - classStudents.length;
  const paperSessions = data?.paper_sessions || [];
  const scoredStudentCount = classStudents.filter((student) => typeof student.recent_score === "number").length;
  const studentWrongTotal = classStudents.reduce((total, student) => total + student.unresolved_wrong_count, 0);

  async function refresh() {
    const next = await getClassDetail(resolvedParams.id);
    setData(next);
    return next;
  }

  async function makeReviewSet() {
    if (!data) return;
    const review = await createReviewSet({ title: `${data.name} 오답 복습 세트`, class_id: data.id, unresolved_only: true });
    setMessage(`복습 세트를 만들었습니다: ${review.name}`);
  }

  async function copyPendingKey(student: ClassCard["students"][number]) {
    const code = studentRawInviteCode(student);
    if (!code) {
      setMessage("전체 키가 저장되지 않은 기존 대기 좌석입니다. 학생 관리 화면에서 키를 갱신한 뒤 복사해 주세요.");
      return;
    }
    await navigator.clipboard.writeText(code);
    setMessage(`${student.name} 키를 복사했습니다.`);
  }

  function startEdit() {
    if (!data) return;
    setEditing(true);
    setEditForm({
      name: data.name || "",
      description: data.description || "",
      subject: data.subject || "",
      grade_level: data.grade_level || "",
    });
  }

  async function saveEdit() {
    if (!data || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateClass(data.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        subject: editForm.subject.trim() || null,
        grade_level: editForm.grade_level.trim() || null,
      });
      setData({ ...data, ...updated });
      setEditing(false);
      setMessage("클래스 정보를 수정했습니다.");
    } catch {
      setMessage("클래스 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  function toggleRecurrenceWeekday(day: number) {
    setRecurrenceWeekdays((current) => {
      const base = current.length ? current : [defaultWeekdayFromDateTime(scheduleForm.starts_at)];
      return base.includes(day) ? base.filter((item) => item !== day) : [...base, day].sort((left, right) => left - right);
    });
  }

  async function createSchedules() {
    if (!data || !scheduleForm.title.trim() || !scheduleForm.starts_at) return;
    const starts = buildRecurringDateTimes(scheduleForm.starts_at, {
      unit: recurrence,
      interval: Number(recurrenceInterval) || 1,
      weekdays: selectedWeekdays,
      monthDay: selectedMonthDay,
      until: repeatUntil,
      maxOccurrences: 160,
    });
    const endOffset = scheduleForm.ends_at ? new Date(scheduleForm.ends_at).getTime() - new Date(scheduleForm.starts_at).getTime() : null;
    setScheduleSaving(true);
    try {
      for (const start of starts) {
        const end = endOffset && endOffset > 0 ? localDateTimeInputValue(new Date(new Date(start).getTime() + endOffset)) : null;
        await createScheduleEvent({
          class_id: data.id,
          title: scheduleForm.title.trim(),
          description: composeScheduleDescription(scheduleForm.lesson_plan, scheduleForm.assignment_note),
          event_type: scheduleForm.event_type,
          starts_at: start,
          ends_at: end,
        });
      }
      const next = await refresh();
      setSelectedEventId(next.schedule_events?.[0]?.id || "");
      setScheduleForm({ title: "", event_type: "class", starts_at: "", ends_at: "", lesson_plan: "", assignment_note: "" });
      setRecurrence("none");
      setRecurrenceInterval("1");
      setRecurrenceWeekdays([]);
      setRecurrenceMonthDay("");
      setRepeatUntil("");
      setMessage(starts.length > 1 ? `${starts.length}개의 반복 일정을 등록했습니다.` : "일정을 등록했습니다.");
    } catch {
      setMessage("일정 등록에 실패했습니다. 입력값을 확인해주세요.");
    } finally {
      setScheduleSaving(false);
    }
  }

  async function removeClass() {
    if (!data) return;
    setDeleting(true);
    try {
      await deleteClass(data.id);
      router.replace("/student-management");
    } catch {
      setMessage("클래스 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
    }
  }

  if (!data) return <div className="py-20 text-center text-sm text-muted-foreground">클래스를 불러오는 중입니다.</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-24">
      <Link href="/student-management" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        Student Management
      </Link>
      <header className="rounded-[10px] bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Class Profile</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-950">{data.name}</h1>
              <p className="mt-2 text-sm text-zinc-600">{data.description || [data.subject, data.grade_level].filter(Boolean).join(" · ") || "클래스 설명 없음"}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <span className="rounded-[8px] bg-zinc-100 px-3 py-2 font-semibold text-zinc-700">학생 {data.student_count}명</span>
                <span className="rounded-[8px] bg-zinc-100 px-3 py-2 font-semibold text-zinc-700">진행 세션 {data.upcoming_count}개</span>
                <span className="rounded-[8px] bg-zinc-100 px-3 py-2 font-semibold text-zinc-700">미해결 오답 {data.unresolved_wrong_count}개</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={startEdit}>
                클래스 정보 수정
              </Button>
              <Button onClick={makeReviewSet}>
                <RotateCcw className="h-4 w-4" />
                오답 복습 세트
              </Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={deleting}>
                <Trash2 className="h-4 w-4" />
                삭제
              </Button>
            </div>
          </div>
          {editing ? (
            <div className="mt-4 grid gap-2 rounded-[8px] bg-zinc-100 p-3 md:grid-cols-2 xl:grid-cols-4">
              <Input placeholder="클래스 이름" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
              <Input placeholder="레벨/설명" value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} />
              <Input placeholder="과목" value={editForm.subject} onChange={(event) => setEditForm((current) => ({ ...current, subject: event.target.value }))} />
              <Input placeholder="학년" value={editForm.grade_level} onChange={(event) => setEditForm((current) => ({ ...current, grade_level: event.target.value }))} />
              <div className="flex gap-2 md:col-span-2 xl:col-span-4">
                <Button type="button" size="sm" onClick={saveEdit} disabled={saving || !editForm.name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  저장
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : null}
          {message ? <div className="mt-4 rounded-[8px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">{message}</div> : null}
      </header>

        <div className="flex flex-wrap gap-2 rounded-[10px] bg-zinc-100 p-1">
          {[
            { id: "students", label: "학생", icon: Users },
            { id: "calendar", label: "캘린더", icon: CalendarDays },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ClassTab)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
                  activeTab === tab.id ? "bg-black text-white" : "text-zinc-600 hover:bg-white hover:text-zinc-950"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "students" ? (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["학생", classStudents.length],
                ["최근 점수", scoredStudentCount],
                ["미해결 오답", studentWrongTotal],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[10px] bg-white p-4">
                  <p className="text-xs font-semibold text-zinc-500">{label}</p>
                  <p className="mt-2 text-2xl font-black text-zinc-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="min-w-0 rounded-[10px] bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-black text-zinc-950"><Users className="h-4 w-4" />학생</h2>
                  <span className="text-xs font-semibold text-zinc-500">
                    {classStudents.length}명{pendingKeyCount ? ` · 대기 키 ${pendingKeyCount}개` : ""}
                  </span>
                </div>
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  {classStudentCards.map((student) =>
                    isPendingKeyCard(student) ? (
                      <article key={student.id} className="min-w-0 rounded-[8px] border border-dashed border-zinc-300 bg-zinc-50 p-3">
                        <p className="truncate text-sm font-black text-zinc-950">{student.name}</p>
                        <div className="mt-3 flex items-center gap-1.5 rounded-[7px] bg-white px-2 py-2 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200">
                          <span className="shrink-0 text-zinc-500">Invite</span>
                          <span className="min-w-0 flex-1 truncate font-mono">{studentKeyPreviewLabel(student)}</span>
                          <button
                            type="button"
                            onClick={() => void copyPendingKey(student)}
                            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
                            aria-label={`${student.name} 키 복사`}
                            title="키 복사"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    ) : (
                      <Link
                        key={student.id}
                        href={`/student-management/students/${student.id}`}
                        className="min-w-0 rounded-[8px] bg-zinc-100 p-3 transition hover:bg-zinc-200"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-zinc-950">{student.name}</p>
                            <p className="mt-1 truncate text-xs text-zinc-500">{[student.school, student.grade_level].filter(Boolean).join(" · ") || "학생 정보 없음"}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-[7px] bg-white px-2 py-2">
                            <p className="text-zinc-500">최근</p>
                            <p className="mt-1 font-bold text-zinc-950">{student.recent_score == null ? "-" : `${Math.round(student.recent_score)}점`}</p>
                          </div>
                          <div className="rounded-[7px] bg-white px-2 py-2">
                            <p className="text-zinc-500">오답</p>
                            <p className="mt-1 font-bold text-zinc-950">{student.unresolved_wrong_count}</p>
                          </div>
                        </div>
                      </Link>
                    )
                  )}
                  {!classStudentCards.length ? (
                    <p className="rounded-[8px] bg-zinc-100 p-6 text-center text-sm text-zinc-500 md:col-span-2">아직 이 클래스에 연결된 학생이 없습니다.</p>
                  ) : null}
                </div>
              </section>
              <aside className="rounded-[10px] bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-black text-zinc-950"><ClipboardCheck className="h-4 w-4" />Paper Sessions</h2>
                  <span className="text-xs font-semibold text-zinc-500">{paperSessions.length}개</span>
                </div>
                <div className="space-y-2 p-3">
                  {paperSessions.map((session) => (
                    <div key={session.id} className="rounded-[8px] bg-zinc-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-zinc-950">{session.title}</p>
                        <Badge className={cn("shrink-0", tone(session.status))}>{session.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{session.graded_count}/{session.assigned_count}명 채점 · {session.problem_count}문항</p>
                    </div>
                  ))}
                  {!paperSessions.length ? <p className="rounded-[8px] bg-zinc-100 p-4 text-sm text-zinc-500">아직 연결된 세션이 없습니다.</p> : null}
                </div>
              </aside>
            </div>
          </section>
        ) : null}

        {activeTab === "calendar" ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-zinc-950"><CalendarDays className="h-5 w-5" />캘린더</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {events.map((event) => {
                  const selected = selectedEvent?.id === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className={cn(
                        "w-full rounded-[8px] p-3 text-left transition",
                        selected ? "bg-black text-white" : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{event.title}</p>
                          <p className={cn("mt-1 flex items-center gap-1 text-xs", selected ? "text-zinc-200" : "text-zinc-500")}><Clock className="h-3.5 w-3.5" />{dateLabel(event.starts_at)}</p>
                        </div>
                        <Badge className={cn("shrink-0", selected ? "bg-white text-zinc-950" : tone(event.event_type))}>{event.event_type}</Badge>
                      </div>
                      {event.description ? <p className={cn("mt-2 line-clamp-2 whitespace-pre-line text-sm", selected ? "text-zinc-100" : "text-zinc-600")}>{event.description}</p> : null}
                    </button>
                  );
                })}
                {!events.length ? <p className="rounded-[8px] bg-zinc-100 p-4 text-sm text-zinc-500">등록된 수업 일정이 없습니다.</p> : null}
              </CardContent>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-zinc-950"><Plus className="h-5 w-5" />수업 일정 등록</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="일정 제목" value={scheduleForm.title} onChange={(event) => setScheduleForm((current) => ({ ...current, title: event.target.value }))} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="h-10 rounded-[8px] bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
                      value={scheduleForm.event_type}
                      onChange={(event) => setScheduleForm((current) => ({ ...current, event_type: event.target.value }))}
                    >
                      <option value="class">수업</option>
                      <option value="homework">과제</option>
                      <option value="test">시험</option>
                      <option value="other">기타</option>
                    </select>
                    <select
                      className="h-10 rounded-[8px] bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
                      value={recurrence}
                      onChange={(event) => {
                        setRecurrence(event.target.value as ScheduleRecurrenceUnit);
                        setRecurrenceInterval("1");
                      }}
                    >
                      <option value="none">한 번만</option>
                      <option value="day">일 단위 반복</option>
                      <option value="week">주 단위 반복</option>
                      <option value="month">월 단위 반복</option>
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input type="datetime-local" value={scheduleForm.starts_at} onChange={(event) => setScheduleForm((current) => ({ ...current, starts_at: event.target.value }))} />
                    <Input type="datetime-local" value={scheduleForm.ends_at} onChange={(event) => setScheduleForm((current) => ({ ...current, ends_at: event.target.value }))} />
                  </div>
                  {recurrence !== "none" ? (
                    <div className="space-y-3 rounded-[8px] bg-zinc-100 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-semibold text-zinc-600">
                          반복 간격
                          <select className="mt-1 h-10 w-full rounded-[8px] bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10" value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)}>
                            {(recurrence === "day" ? dayIntervalOptions : recurrence === "week" ? weekIntervalOptions : monthIntervalOptions).map((value) => (
                              <option key={value} value={value}>
                                {recurrence === "day" ? `${value}일마다` : recurrence === "week" ? `${value}주마다` : `${value}개월마다`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-zinc-600">
                          반복 종료일
                          <Input className="mt-1" type="date" value={repeatUntil} onChange={(event) => setRepeatUntil(event.target.value)} />
                        </label>
                      </div>
                      {recurrence === "week" ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-zinc-600">요일</p>
                          <div className="grid grid-cols-7 gap-1.5">
                            {scheduleWeekdays.map((day) => {
                              const active = selectedWeekdays.includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => toggleRecurrenceWeekday(day.value)}
                                  className={cn(
                                    "h-9 rounded-[7px] text-xs font-bold transition",
                                    active ? "bg-black text-white" : "bg-white text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950"
                                  )}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {recurrence === "month" ? (
                        <label className="block text-xs font-semibold text-zinc-600">
                          반복 날짜
                          <select className="mt-1 h-10 w-full rounded-[8px] bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10" value={selectedMonthDay} onChange={(event) => setRecurrenceMonthDay(event.target.value)}>
                            {monthDayOptions.map((value) => <option key={value} value={value}>{value}일</option>)}
                          </select>
                        </label>
                      ) : null}
                      <p className="text-xs text-zinc-500">종료일을 비워두면 최대 160개까지 반복 일정을 자동 등록합니다.</p>
                    </div>
                  ) : null}
                  <textarea
                    className="min-h-24 w-full rounded-[8px] bg-zinc-100 p-3 text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10"
                    placeholder="수업 지도 내용"
                    value={scheduleForm.lesson_plan}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, lesson_plan: event.target.value }))}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-[8px] bg-zinc-100 p-3 text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10"
                    placeholder="과제 / 준비물 / 전달사항"
                    value={scheduleForm.assignment_note}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, assignment_note: event.target.value }))}
                  />
                  <Button className="w-full" onClick={createSchedules} disabled={scheduleSaving || !scheduleForm.title.trim() || !scheduleForm.starts_at}>
                    {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    일정 등록
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-zinc-950">일정 상세</CardTitle></CardHeader>
                <CardContent>
                  {selectedEvent ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-lg font-black text-zinc-950">{selectedEvent.title}</p>
                        <p className="mt-1 text-sm text-zinc-600">{dateLabel(selectedEvent.starts_at)}{selectedEvent.ends_at ? ` - ${dateLabel(selectedEvent.ends_at)}` : ""}</p>
                      </div>
                      <div className="rounded-[8px] bg-zinc-100 p-3">
                        <p className="whitespace-pre-line text-sm leading-6 text-zinc-700">{selectedEvent.description || "등록된 수업 지도/과제 내용이 없습니다."}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">일정을 선택하면 수업 지도 내용과 과제를 확인할 수 있습니다.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}
      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent className="max-w-md bg-white text-zinc-950">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black">클래스 삭제</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                '{data.name}' 클래스를 삭제합니다. 학생 계정과 기존 채점 기록은 유지되지만, 이 클래스의 학생 연결과 일정은 제거됩니다.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                취소
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={removeClass}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                삭제
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
