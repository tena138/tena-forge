"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Download, GripVertical, Loader2, MessageSquareText, Pencil, Plus, RotateCcw, Save, Settings, Trash2, UserRound, X } from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CounselingLog,
  CounselingFormat,
  CounselingFormatField,
  CounselingPreset,
  ScheduleEvent,
  StudentCard,
  WrongAnswer,
  createCounselingLog,
  deleteCounselingLog,
  createReviewSet,
  deleteWrongAnswerRecord,
  getStudentDetail,
  savePaperSessionGrade,
  saveCounselingPreset,
  updateClassCounselingFormat,
  updateCounselingLog,
} from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
type AutosaveState = "pending" | "saving" | "saved" | "error";
type FormatAutosaveState = "idle" | "pending" | "saving" | "saved" | "error";
type CounselingDraftStatus = "idle" | "restored" | "saving" | "saved" | "error";
type StudentTab = "calendar" | "wrong" | "counseling";
type StudentCalendarItem = {
  id: string;
  date: string;
  title: string;
  meta: string;
  description: string;
  result_id?: string | null;
  kind: "수업" | "시험" | "상담";
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
  counseling_formats: CounselingFormat[];
  counseling_presets: CounselingPreset[];
  counseling_logs: CounselingLog[];
  analytics: {
    graded_count?: number;
    average_score?: number | null;
    unresolved_wrong_count?: number;
  };
};

type CounselingDraft = {
  version: 1;
  studentId: string;
  editingLogId: string | null;
  classId: string;
  form: {
    counseling_date: string;
    title: string;
  };
  fields: CounselingFormatField[];
  values: Record<string, string>;
  savedAt: string;
};

const DEFAULT_COUNSELING_FIELDS: CounselingFormatField[] = [
  { id: "notes", label: "상담하면서 기록할 내용", placeholder: "상담하면서 기록할 내용", include_in_report: true },
  { id: "weekly_report", label: "주간 리포트 초안", placeholder: "주간 리포트 초안", include_in_report: false },
  { id: "next_plan", label: "다음 지도 계획", placeholder: "다음 지도 계획 / 과제 제안", include_in_report: true },
];
const COUNSELING_DRAFT_KEY_PREFIX = "tena.student-management.counseling-draft";

function createFieldId(label: string, existing: string[] = []) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  const base = normalized || `field_${existing.length + 1}`;
  let candidate = base;
  let index = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}_${index}`.slice(0, 48);
    index += 1;
  }
  return candidate;
}

function normalizeCounselingFields(fields?: CounselingFormatField[] | null) {
  const source = fields?.length ? fields : DEFAULT_COUNSELING_FIELDS;
  return source
    .map((field, index) => ({
      id: field.id || `field_${index + 1}`,
      label: field.label || `항목 ${index + 1}`,
      placeholder: field.placeholder || field.label || `항목 ${index + 1}`,
      include_in_report: field.include_in_report !== false,
    }))
    .slice(0, 12);
}

function parseCounselingDraft(raw: string | null): CounselingDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CounselingDraft>;
    if (parsed.version !== 1 || typeof parsed.studentId !== "string" || !Array.isArray(parsed.fields) || !parsed.form || typeof parsed.form !== "object") return null;
    const form = parsed.form as Record<string, unknown>;
    const values = parsed.values && typeof parsed.values === "object" ? parsed.values : {};
    return {
      version: 1,
      studentId: parsed.studentId,
      editingLogId: typeof parsed.editingLogId === "string" ? parsed.editingLogId : null,
      classId: typeof parsed.classId === "string" ? parsed.classId : "",
      form: {
        counseling_date: typeof form.counseling_date === "string" ? form.counseling_date : new Date().toISOString().slice(0, 10),
        title: typeof form.title === "string" ? form.title : "학습 상담",
      },
      fields: normalizeCounselingFields(parsed.fields),
      values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : ""])),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

function hasCounselingDraftContent(form: CounselingDraft["form"], values: Record<string, string>, editingLogId: string | null) {
  if (editingLogId) return true;
  const today = new Date().toISOString().slice(0, 10);
  return form.counseling_date !== today || form.title !== "학습 상담" || Object.values(values).some((value) => value.trim());
}

function formatDraftSavedAt(savedAt: string | null) {
  if (!savedAt) return "";
  const savedDate = new Date(savedAt);
  if (Number.isNaN(savedDate.getTime())) return "";
  return savedDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function reportField(fields: CounselingFormatField[]) {
  return fields.find((field) => field.id === "weekly_report") || fields.find((field) => /리포트|보고/.test(field.label)) || null;
}

function sectionValue(log: CounselingLog, fieldId: string, label: string, fallback?: string | null) {
  const section = (log.sections || []).find((item) => item.field_id === fieldId || item.label === label);
  return section?.value || fallback || "";
}

function logSections(log: CounselingLog): Array<{ field_id: string; label: string; value: string; include_in_report?: boolean }> {
  if (log.sections?.length) {
    return log.sections.map((section) => {
      const isReport = section.field_id === "weekly_report" || /리포트|보고/.test(section.label);
      return { field_id: section.field_id, label: section.label, value: (isReport ? log.weekly_report || section.value : section.value) || "", include_in_report: section.include_in_report };
    });
  }
  return [
    { field_id: "notes", label: "상담하면서 기록할 내용", value: log.notes || "", include_in_report: true },
    { field_id: "weekly_report", label: "주간 리포트", value: log.weekly_report || "", include_in_report: false },
    { field_id: "next_plan", label: "다음 지도 계획", value: log.next_plan || "", include_in_report: true },
  ].filter((section) => section.value);
}

function tone(status?: string) {
  if (["graded", "completed", "resolved", "mastered", "Active", "class"].includes(status || "")) return "bg-emerald-500/15 text-emerald-100 border-emerald-400/20";
  if (["unresolved", "Needs Review", "wrong"].includes(status || "")) return "bg-rose-500/15 text-rose-100 border-rose-400/20";
  return "bg-violet-500/15 text-violet-100 border-violet-300/20";
}

function isArchiveResolved(status?: string | null) {
  return ["completed", "correct", "mastered", "resolved"].includes((status || "").toLowerCase());
}

function archiveStatusLabel(status?: string | null) {
  const value = (status || "").toLowerCase();
  if (isArchiveResolved(value)) return "완료";
  if (["unanswered", "missing"].includes(value)) return "미풀이";
  if (["unresolved", "wrong", "needs review"].includes(value)) return "복습 필요";
  return status || "복습 필요";
}

function archiveAccentColor(wrong: WrongAnswer) {
  const status = (wrong.resolved_status || "").toLowerCase();
  if (isArchiveResolved(status)) return "#34d399";
  if (["unanswered", "missing"].includes(status)) return "#fb7185";
  if (wrong.wrong_count > 1) return "#fb923c";
  return "#8b5cf6";
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
  const resultBySessionId = new Map(student.paper_session_history.map((result) => [result.paper_session_id, result]));
  const eventItems = (student.schedule_events || []).map((event) => ({
    id: `event-${event.id}`,
    date: event.starts_at,
    title: event.title,
    meta: event.event_type,
    description: event.description || "",
    result_id: event.linked_paper_session_id ? resultBySessionId.get(event.linked_paper_session_id)?.id || null : null,
    kind: "수업" as const,
  }));
  const sessionItems = student.paper_session_history
    .filter((result) => result.session?.scheduled_at)
    .map((result) => ({
      id: `session-${result.id}`,
      date: result.session?.scheduled_at || "",
      title: result.session?.title || "Paper Session",
      meta: result.status,
      result_id: result.id,
      description: `${result.score == null ? "-" : `${Math.round(result.score)}점`} · ${problemCount(result)}문항`,
      kind: "시험" as const,
    }));
  const counselingItems = (student.counseling_logs || []).map((log) => ({
    id: `counseling-${log.id}`,
    date: log.counseling_date,
    title: log.title || "학습 상담",
    meta: log.class_name || "상담",
    description: sectionValue(log, "notes", "상담하면서 기록할 내용", log.notes) || logSections(log)[0]?.value || "",
    kind: "상담" as const,
  }));
  return [...eventItems, ...sessionItems, ...counselingItems]
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
  if (item.kind === "상담") return "border-emerald-300/30 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30";
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
  const [selectedCalendarItemId, setSelectedCalendarItemId] = useState("");
  const [resultStatuses, setResultStatuses] = useState<Record<string, Record<number, ProblemStatus>>>({});
  const [savingResultId, setSavingResultId] = useState("");
  const [autosaveStates, setAutosaveStates] = useState<Record<string, AutosaveState>>({});
  const [deletingWrongAnswerId, setDeletingWrongAnswerId] = useState("");
  const autosaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const calendarInitializedRef = useRef(false);
  const [message, setMessage] = useState("");
  const [counselingSaving, setCounselingSaving] = useState(false);
  const [deletingCounselingLogId, setDeletingCounselingLogId] = useState("");
  const [formatSaving, setFormatSaving] = useState(false);
  const [formatAutosaveState, setFormatAutosaveState] = useState<FormatAutosaveState>("idle");
  const [formatAutosaveSavedAt, setFormatAutosaveSavedAt] = useState<string | null>(null);
  const [formatRevision, setFormatRevision] = useState(0);
  const [presetSavingSlot, setPresetSavingSlot] = useState<number | null>(null);
  const [formatSettingsOpen, setFormatSettingsOpen] = useState(false);
  const [counselingClassId, setCounselingClassId] = useState("");
  const [counselingFields, setCounselingFields] = useState<CounselingFormatField[]>(DEFAULT_COUNSELING_FIELDS);
  const [draggingCounselingFieldId, setDraggingCounselingFieldId] = useState("");
  const [counselingFieldValues, setCounselingFieldValues] = useState<Record<string, string>>({});
  const [counselingForm, setCounselingForm] = useState({
    counseling_date: new Date().toISOString().slice(0, 10),
    title: "학습 상담",
  });
  const [editingCounselingLogId, setEditingCounselingLogId] = useState<string | null>(null);
  const [counselingDraftStatus, setCounselingDraftStatus] = useState<CounselingDraftStatus>("idle");
  const [counselingDraftSavedAt, setCounselingDraftSavedAt] = useState<string | null>(null);
  const counselingDraftHydratedRef = useRef<Record<string, boolean>>({});
  const counselingDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatSaveRequestRef = useRef(0);
  const skipNextCounselingDraftSaveRef = useRef(false);
  const skipNextCounselingFormatSyncRef = useRef(false);

  const calendarItems = useMemo(() => (data ? studentCalendarItems(data) : []), [data]);
  const archivedWrongAnswers = useMemo(() => data?.wrong_answers || [], [data?.wrong_answers]);
  const archiveReviewNeededCount = useMemo(
    () => archivedWrongAnswers.filter((wrong) => !isArchiveResolved(wrong.resolved_status)).length,
    [archivedWrongAnswers]
  );
  const activeReportField = useMemo(() => reportField(counselingFields), [counselingFields]);
  const selectedClassName = useMemo(() => {
    if (!data || !counselingClassId) return "";
    const index = data.class_ids.indexOf(counselingClassId);
    return index >= 0 ? data.class_names[index] || "" : "";
  }, [data, counselingClassId]);
  const selectedClassSubject = useMemo(() => {
    if (!data || !counselingClassId) return "";
    const index = data.class_ids.indexOf(counselingClassId);
    return index >= 0 ? data.class_subjects?.[index] || "" : "";
  }, [data, counselingClassId]);
  const counselingPresets = useMemo(
    () =>
      [1, 2, 3, 4].map(
        (slot) =>
          data?.counseling_presets?.find((preset) => preset.slot === slot) || {
            slot,
            name: `프리셋 ${slot}`,
            subject: null,
            fields: [],
            updated_at: null,
          }
      ),
    [data?.counseling_presets]
  );
  const counselingDraftLabel = useMemo(() => {
    if (counselingDraftStatus === "saving") return "임시 저장 중...";
    if (counselingDraftStatus === "restored") return "임시 저장본을 불러왔습니다.";
    if (counselingDraftStatus === "error") return "임시 저장에 실패했습니다.";
    const savedTime = formatDraftSavedAt(counselingDraftSavedAt);
    return savedTime ? `임시 저장됨 ${savedTime}` : "입력 내용은 자동 임시 저장됩니다.";
  }, [counselingDraftSavedAt, counselingDraftStatus]);
  const formatAutosaveLabel = useMemo(() => {
    if (!counselingClassId) return "클래스를 선택하면 포맷이 클래스 단위로 자동 저장됩니다.";
    if (formatAutosaveState === "pending") return "클래스 포맷 자동 저장 대기 중...";
    if (formatAutosaveState === "saving") return "클래스 포맷 자동 저장 중...";
    if (formatAutosaveState === "saved") {
      const savedTime = formatDraftSavedAt(formatAutosaveSavedAt);
      return savedTime ? `클래스 포맷 자동 저장됨 ${savedTime}` : "클래스 포맷 자동 저장됨";
    }
    if (formatAutosaveState === "error") return "자동 저장 실패. 지금 저장을 눌러 다시 시도하세요.";
    return "이 클래스의 모든 학생에게 같은 포맷이 자동 적용됩니다.";
  }, [counselingClassId, formatAutosaveSavedAt, formatAutosaveState]);
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
  const selectedCalendarItem =
    selectedCalendarItems.find((item) => item.id === selectedCalendarItemId) ||
    selectedCalendarItems.find((item) => item.result_id) ||
    selectedCalendarItems[0] ||
    null;
  const selectedCalendarResult = selectedCalendarItem?.result_id
    ? data?.paper_session_history.find((result) => result.id === selectedCalendarItem.result_id) || null
    : null;

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
        setSelectedCalendarItemId(target.id);
      }
      calendarInitializedRef.current = true;
    }
  }

  function counselingDraftKey(logId: string | null = editingCounselingLogId) {
    return `${COUNSELING_DRAFT_KEY_PREFIX}.${params.id}.${logId || "new"}`;
  }

  function readCounselingDraft(logId: string | null = editingCounselingLogId) {
    if (typeof window === "undefined") return null;
    const draft = parseCounselingDraft(window.localStorage.getItem(counselingDraftKey(logId)));
    if (!draft || draft.studentId !== params.id || (draft.editingLogId || null) !== (logId || null)) return null;
    return draft;
  }

  function clearCounselingDraft(logId: string | null = editingCounselingLogId) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(counselingDraftKey(logId));
      } catch {
        undefined;
      }
    }
    setCounselingDraftStatus("idle");
    setCounselingDraftSavedAt(null);
  }

  function applyCounselingDraft(draft: CounselingDraft) {
    const nextFields = normalizeCounselingFields(draft.fields);
    const nextValues: Record<string, string> = {};
    for (const field of nextFields) nextValues[field.id] = draft.values[field.id] || "";
    const nextClassId = draft.classId && data?.class_ids.includes(draft.classId) ? draft.classId : counselingClassId;
    if (nextClassId && nextClassId !== counselingClassId) skipNextCounselingFormatSyncRef.current = true;
    if (nextClassId) setCounselingClassId(nextClassId);
    setCounselingFields(nextFields);
    setCounselingFieldValues(nextValues);
    setCounselingForm({
      counseling_date: draft.form.counseling_date || new Date().toISOString().slice(0, 10),
      title: draft.form.title,
    });
    skipNextCounselingDraftSaveRef.current = true;
    setCounselingDraftStatus("restored");
    setCounselingDraftSavedAt(draft.savedAt || null);
  }

  useEffect(() => {
    calendarInitializedRef.current = false;
    setFormatAutosaveState("idle");
    setFormatAutosaveSavedAt(null);
    getStudentDetail(params.id).then((student) => applyStudentData(student as StudentDetail)).catch(() => setData(null));
  }, [params.id]);

  useEffect(() => {
    if (!data) return;
    setCounselingClassId((current) => (current && data.class_ids.includes(current) ? current : data.class_ids[0] || ""));
  }, [data?.id, data?.class_ids.join("|")]);

  useEffect(() => {
    if (!data) return;
    if (editingCounselingLogId) return;
    if (skipNextCounselingFormatSyncRef.current) {
      skipNextCounselingFormatSyncRef.current = false;
      return;
    }
    const format = (data.counseling_formats || []).find((item) => item.class_id === counselingClassId);
    const nextFields = normalizeCounselingFields(format?.fields);
    setCounselingFields(nextFields);
    setCounselingFieldValues((current) => {
      const next: Record<string, string> = {};
      for (const field of nextFields) next[field.id] = current[field.id] || "";
      return next;
    });
  }, [data, counselingClassId, editingCounselingLogId]);

  useEffect(() => {
    if (!data || editingCounselingLogId) return;
    const key = counselingDraftKey(null);
    if (counselingDraftHydratedRef.current[key]) return;
    counselingDraftHydratedRef.current[key] = true;
    const draft = readCounselingDraft(null);
    if (!draft) return;
    applyCounselingDraft(draft);
    setMessage("임시 저장된 상담일지를 불러왔습니다.");
  }, [data?.id, editingCounselingLogId]);

  useEffect(() => {
    if (!data) return;
    if (counselingDraftTimerRef.current) {
      clearTimeout(counselingDraftTimerRef.current);
      counselingDraftTimerRef.current = null;
    }
    if (skipNextCounselingDraftSaveRef.current) {
      skipNextCounselingDraftSaveRef.current = false;
      return;
    }
    if (counselingSaving) return;
    const key = counselingDraftKey();
    if (!hasCounselingDraftContent(counselingForm, counselingFieldValues, editingCounselingLogId)) {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(key);
        } catch {
          undefined;
        }
      }
      setCounselingDraftStatus("idle");
      setCounselingDraftSavedAt(null);
      return;
    }
    setCounselingDraftStatus("saving");
    counselingDraftTimerRef.current = setTimeout(() => {
      const savedAt = new Date().toISOString();
      const draft: CounselingDraft = {
        version: 1,
        studentId: params.id,
        editingLogId: editingCounselingLogId,
        classId: counselingClassId,
        form: counselingForm,
        fields: counselingFields,
        values: counselingFieldValues,
        savedAt,
      };
      try {
        window.localStorage.setItem(key, JSON.stringify(draft));
        setCounselingDraftStatus("saved");
        setCounselingDraftSavedAt(savedAt);
      } catch {
        setCounselingDraftStatus("error");
      } finally {
        counselingDraftTimerRef.current = null;
      }
    }, 700);
    return () => {
      if (counselingDraftTimerRef.current) {
        clearTimeout(counselingDraftTimerRef.current);
        counselingDraftTimerRef.current = null;
      }
    };
  }, [data, params.id, editingCounselingLogId, counselingClassId, counselingForm, counselingFields, counselingFieldValues, counselingSaving]);

  useEffect(() => {
    if (!formatRevision || !counselingClassId) return;
    if (formatAutosaveTimerRef.current) {
      clearTimeout(formatAutosaveTimerRef.current);
      formatAutosaveTimerRef.current = null;
    }
    setFormatAutosaveState("pending");
    const classId = counselingClassId;
    const fields = counselingFields;
    formatAutosaveTimerRef.current = setTimeout(() => {
      formatAutosaveTimerRef.current = null;
      persistClassFormat(fields, classId).catch(() => undefined);
    }, 650);
    return () => {
      if (formatAutosaveTimerRef.current) {
        clearTimeout(formatAutosaveTimerRef.current);
        formatAutosaveTimerRef.current = null;
      }
    };
  }, [formatRevision]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(autosaveTimers.current)) clearTimeout(timer);
      if (counselingDraftTimerRef.current) clearTimeout(counselingDraftTimerRef.current);
      if (formatAutosaveTimerRef.current) clearTimeout(formatAutosaveTimerRef.current);
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

  async function deleteWrongAnswer(wrong: WrongAnswer) {
    if (!window.confirm(`${wrong.problem_number}번 오답 기록을 삭제할까요?`)) return;
    setDeletingWrongAnswerId(wrong.id);
    try {
      await deleteWrongAnswerRecord(wrong.id);
      await refreshStudent();
      setMessage("오답 기록을 삭제했습니다.");
    } catch {
      setMessage("오답 기록 삭제에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setDeletingWrongAnswerId("");
    }
  }

  function markCounselingFormatChanged() {
    setFormatRevision((current) => current + 1);
  }

  function changeCounselingClass(nextClassId: string) {
    setCounselingClassId(nextClassId);
    setFormatAutosaveState("idle");
    setFormatAutosaveSavedAt(null);
  }

  async function persistClassFormat(fields: CounselingFormatField[], classId: string, options: { manual?: boolean } = {}) {
    if (!classId) return null;
    const requestId = formatSaveRequestRef.current + 1;
    formatSaveRequestRef.current = requestId;
    setFormatSaving(true);
    setFormatAutosaveState("saving");
    try {
      const saved = await updateClassCounselingFormat(classId, { fields });
      setData((current) => {
        if (!current) return current;
        if (!current.class_ids.includes(classId)) return current;
        const others = (current.counseling_formats || []).filter((item) => item.class_id !== classId);
        return { ...current, counseling_formats: [...others, saved] };
      });
      if (formatSaveRequestRef.current === requestId) {
        setFormatAutosaveState("saved");
        setFormatAutosaveSavedAt(new Date().toISOString());
      }
      if (options.manual) setMessage("상담일지 포맷을 저장했습니다.");
      return saved;
    } catch {
      if (formatSaveRequestRef.current === requestId) {
        setFormatAutosaveState("error");
        setFormatAutosaveSavedAt(null);
      }
      setMessage(options.manual ? "상담일지 포맷 저장에 실패했습니다." : "상담일지 포맷 자동 저장에 실패했습니다.");
      return null;
    } finally {
      if (formatSaveRequestRef.current === requestId) setFormatSaving(false);
    }
  }

  function updateCounselingFieldValue(fieldId: string, value: string) {
    setCounselingFieldValues((current) => ({ ...current, [fieldId]: value }));
  }

  function updateCounselingField(fieldId: string, patch: Partial<CounselingFormatField>) {
    setCounselingFields((current) => current.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)));
    markCounselingFormatChanged();
  }

  function reorderCounselingField(targetFieldId: string) {
    if (!draggingCounselingFieldId || draggingCounselingFieldId === targetFieldId) return;
    setCounselingFields((current) => {
      const fromIndex = current.findIndex((field) => field.id === draggingCounselingFieldId);
      const toIndex = current.findIndex((field) => field.id === targetFieldId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    markCounselingFormatChanged();
  }

  function addCounselingField() {
    setCounselingFields((current) => {
      const id = createFieldId("새 항목", current.map((field) => field.id));
      return [...current, { id, label: "", placeholder: "", include_in_report: true }];
    });
    markCounselingFormatChanged();
  }

  function removeCounselingField(fieldId: string) {
    setCounselingFields((current) => (current.length <= 1 ? current : current.filter((field) => field.id !== fieldId)));
    setCounselingFieldValues((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
    markCounselingFormatChanged();
  }

  function insertReportVariable(field: CounselingFormatField) {
    const target = reportField(counselingFields);
    if (!target || target.id === field.id) return;
    const token = `{{${field.label}}}`;
    setCounselingFieldValues((current) => ({
      ...current,
      [target.id]: current[target.id] ? `${current[target.id]}\n${token}` : token,
    }));
  }

  function resolveReportTemplate(value: string) {
    let output = value || "";
    for (const field of counselingFields) {
      const fieldValue = counselingFieldValues[field.id] || "";
      output = output.replaceAll(`{{${field.label}}}`, fieldValue).replaceAll(`{{${field.id}}}`, fieldValue);
    }
    return output;
  }

  async function saveClassFormat() {
    if (!counselingClassId) return;
    if (formatAutosaveTimerRef.current) {
      clearTimeout(formatAutosaveTimerRef.current);
      formatAutosaveTimerRef.current = null;
    }
    await persistClassFormat(counselingFields, counselingClassId, { manual: true });
  }

  async function savePreset(slot: number) {
    setPresetSavingSlot(slot);
    try {
      const saved = await saveCounselingPreset(slot, {
        name: `${selectedClassName || "상담"} 프리셋 ${slot}`,
        subject: selectedClassSubject || null,
        fields: counselingFields,
      });
      setData((current) => {
        if (!current) return current;
        const others = (current.counseling_presets || []).filter((item) => item.slot !== slot);
        return { ...current, counseling_presets: [...others, saved].sort((left, right) => left.slot - right.slot) };
      });
      setMessage(`프리셋 ${slot}에 저장했습니다.`);
    } catch {
      setMessage("프리셋 저장에 실패했습니다.");
    } finally {
      setPresetSavingSlot(null);
    }
  }

  function applyPreset(preset: CounselingPreset) {
    if (!preset.fields.length) return;
    const nextFields = normalizeCounselingFields(preset.fields);
    setCounselingFields(nextFields);
    setCounselingFieldValues((current) => {
      const next: Record<string, string> = {};
      for (const field of nextFields) next[field.id] = current[field.id] || "";
      return next;
    });
    markCounselingFormatChanged();
    setMessage(`${preset.name || `프리셋 ${preset.slot}`}을 적용했습니다. 같은 클래스 학생에게 자동 반영됩니다.`);
  }

  function buildCounselingLogPayload() {
    const sections = counselingFields.map((field) => ({
      field_id: field.id,
      label: field.label,
      value: counselingFieldValues[field.id] || "",
      include_in_report: field.include_in_report !== false,
    }));
    const notesField = counselingFields.find((field) => field.id === "notes") || counselingFields.find((field) => field.label.includes("상담")) || counselingFields[0];
    const nextPlanField = counselingFields.find((field) => field.id === "next_plan") || counselingFields.find((field) => field.label.includes("다음") || field.label.includes("계획"));
    const report = activeReportField ? resolveReportTemplate(counselingFieldValues[activeReportField.id] || "") : "";
    return {
      counseling_date: counselingForm.counseling_date ? `${counselingForm.counseling_date}T00:00:00` : null,
      title: counselingForm.title.trim(),
      class_id: counselingClassId || null,
      notes: notesField ? counselingFieldValues[notesField.id] || "" : "",
      weekly_report: report,
      next_plan: nextPlanField ? counselingFieldValues[nextPlanField.id] || "" : "",
      sections,
    };
  }

  function resetCounselingEntryForm(options: { clearDraft?: boolean } = {}) {
    if (options.clearDraft !== false) clearCounselingDraft(editingCounselingLogId);
    skipNextCounselingDraftSaveRef.current = true;
    skipNextCounselingFormatSyncRef.current = false;
    setEditingCounselingLogId(null);
    setCounselingForm({ counseling_date: new Date().toISOString().slice(0, 10), title: "학습 상담" });
    setCounselingFieldValues({});
  }

  function startEditingCounselingLog(log: CounselingLog) {
    const sourceSections = log.sections?.length
      ? log.sections.map((section) => ({
          field_id: section.field_id,
          label: section.label,
          value: section.value || "",
          include_in_report: section.include_in_report,
        }))
      : [
          { field_id: "notes", label: "상담하면서 기록할 내용", value: log.notes || "", include_in_report: true },
          { field_id: "weekly_report", label: "주간 리포트", value: log.weekly_report || "", include_in_report: false },
          { field_id: "next_plan", label: "다음 지도 계획", value: log.next_plan || "", include_in_report: true },
        ];
    const fields = normalizeCounselingFields(
      sourceSections.map((section) => ({
        id: section.field_id,
        label: section.label,
        placeholder: section.label,
        include_in_report: section.include_in_report !== false,
      }))
    );
    const values = Object.fromEntries(
      fields.map((field) => {
        const section = sourceSections.find((item) => item.field_id === field.id || item.label === field.label);
        return [field.id, section?.value || ""];
      })
    );
    const draft = readCounselingDraft(log.id);
    counselingDraftHydratedRef.current[counselingDraftKey(log.id)] = true;
    setEditingCounselingLogId(log.id);
    if (draft) {
      applyCounselingDraft(draft);
    } else {
      setCounselingDraftStatus("idle");
      setCounselingDraftSavedAt(null);
      setCounselingClassId(log.class_id && data?.class_ids.includes(log.class_id) ? log.class_id : "");
      setCounselingFields(fields);
      setCounselingFieldValues(values);
      setCounselingForm({
        counseling_date: dateKey(log.counseling_date) || new Date().toISOString().slice(0, 10),
        title: log.title || "학습 상담",
      });
    }
    setFormatSettingsOpen(false);
    setMessage(draft ? "임시 저장된 상담 기록 편집본을 불러왔습니다." : "상담 기록을 편집 중입니다. 내용을 수정한 뒤 저장해 주세요.");
  }

  async function saveCounselingLog() {
    if (!data || !counselingForm.title.trim()) return;
    const savedEditingLogId = editingCounselingLogId;
    setCounselingSaving(true);
    try {
      const payload = buildCounselingLogPayload();
      if (savedEditingLogId) await updateCounselingLog(data.id, savedEditingLogId, payload);
      else await createCounselingLog(data.id, payload);
      clearCounselingDraft(savedEditingLogId);
      await refreshStudent();
      resetCounselingEntryForm({ clearDraft: false });
      setMessage(savedEditingLogId ? "상담일지를 수정했습니다." : "상담일지를 저장했습니다.");
    } catch {
      setMessage(savedEditingLogId ? "상담일지 수정에 실패했습니다. 다시 시도해주세요." : "상담일지 저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setCounselingSaving(false);
    }
  }

  async function deleteCounselingRecord(log: CounselingLog) {
    if (!data) return;
    if (!window.confirm(`${shortDate(log.counseling_date)} 상담 기록을 삭제할까요?`)) return;
    setDeletingCounselingLogId(log.id);
    try {
      await deleteCounselingLog(data.id, log.id);
      if (editingCounselingLogId === log.id) {
        clearCounselingDraft(log.id);
        resetCounselingEntryForm({ clearDraft: false });
      }
      await refreshStudent();
      setMessage("상담 기록을 삭제했습니다.");
    } catch {
      setMessage("상담 기록 삭제에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setDeletingCounselingLogId("");
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
        log.class_name ? `클래스: ${log.class_name}` : "",
        "",
        ...logSections(log).flatMap((section) => [`[${section.label}]`, section.value || "-", ""]),
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

  if (!data) return <main className="min-h-screen bg-transparent p-8 text-slate-400">학생 정보를 불러오는 중입니다.</main>;

  return (
    <main className="min-h-screen bg-transparent px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="relative">
          <Link
            href="/student-management"
            className="absolute left-0 top-1/2 inline-flex h-10 w-10 -translate-x-[calc(100%+0.75rem)] -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.05] hover:text-white max-lg:top-5 max-lg:translate-x-0 max-lg:-translate-y-0"
            aria-label="학생 관리로 돌아가기"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <header className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
              <div className="rounded-lg border border-violet-300/20 bg-violet-500/15 p-3 text-violet-100">
                <UserRound className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-white">{data.name}</h1>
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
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Card className="border-white/[0.08] bg-white/[0.025]"><CardContent className="p-4"><p className="text-xs text-slate-500">최근 점수</p><p className="mt-1 text-2xl font-black text-white">{data.recent_score == null ? "-" : `${Math.round(data.recent_score)}점`}</p></CardContent></Card>
          <Card className="border-white/[0.08] bg-white/[0.025]"><CardContent className="p-4"><p className="text-xs text-slate-500">평균 점수</p><p className="mt-1 text-2xl font-black text-emerald-100">{data.analytics.average_score == null ? "-" : `${Math.round(data.analytics.average_score)}점`}</p></CardContent></Card>
          <Card className="border-white/[0.08] bg-white/[0.025]"><CardContent className="p-4"><p className="text-xs text-slate-500">채점 기록</p><p className="mt-1 text-2xl font-black text-violet-100">{data.analytics.graded_count || 0}</p></CardContent></Card>
          <Card className="border-white/[0.08] bg-white/[0.025]"><CardContent className="p-4"><p className="text-xs text-slate-500">미해결 오답</p><p className="mt-1 text-2xl font-black text-rose-100">{data.analytics.unresolved_wrong_count || 0}</p></CardContent></Card>
        </section>

        <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.08] bg-white/[0.025] p-1">
          {[
            { id: "calendar", label: "캘린더", icon: CalendarDays },
            { id: "wrong", label: "아카이브", icon: Archive },
            { id: "counseling", label: "학습 상담", icon: MessageSquareText },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as StudentTab)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition",
                  activeTab === tab.id ? "bg-violet-500/85 text-white shadow-lg shadow-violet-950/25" : "text-slate-400 hover:bg-white/[0.045] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "calendar" ? (
          <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="border-white/[0.08] bg-white/[0.025]">
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
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-7 border-y border-white/[0.08] bg-white/[0.025] text-center text-xs font-semibold text-slate-500">
                      {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                        <div key={day} className="px-2 py-2">{day}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 border-l border-white/[0.08]">
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
                            onClick={() => {
                              setSelectedCalendarDate(key);
                              setSelectedCalendarItemId(items.find((item) => item.result_id)?.id || items[0]?.id || "");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                setSelectedCalendarDate(key);
                                setSelectedCalendarItemId(items.find((item) => item.result_id)?.id || items[0]?.id || "");
                              }
                            }}
                            className={cn(
                              "min-h-[138px] border-b border-r border-white/[0.08] p-2 text-left outline-none transition",
                              isCurrentMonth ? "bg-white/[0.012]" : "bg-white/[0.006] text-slate-600",
                              isSelected && "bg-violet-500/[0.08] ring-1 ring-inset ring-violet-300/45",
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
                                    setSelectedCalendarItemId(item.id);
                                  }}
                                  className={cn(
                                    "block w-full truncate rounded border px-2 py-1 text-left text-[11px] font-semibold leading-4 transition",
                                    calendarBlockClass(item),
                                    selectedCalendarItemId === item.id && "ring-1 ring-white/70"
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
            <Card className="border-white/[0.08] bg-white/[0.025]">
              <CardHeader>
                <CardTitle className="text-white">{shortDate(`${selectedCalendarDate}T00:00:00`)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedCalendarItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCalendarItemId(item.id)}
                    className={cn(
                      "block w-full rounded-lg border bg-white/[0.03] p-3 text-left transition hover:border-violet-300/40 hover:bg-white/[0.045]",
                      selectedCalendarItem?.id === item.id ? "border-violet-300/50 ring-1 ring-violet-300/25" : "border-white/[0.08]"
                    )}
                  >
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
                  </button>
                ))}
                {selectedCalendarResult ? (
                  <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500">결과 입력</p>
                        <h3 className="mt-1 text-sm font-black text-white">{selectedCalendarResult.session?.title || selectedCalendarItem?.title || "시험/과제"}</h3>
                      </div>
                      <div className="text-right text-xs font-semibold text-slate-500">
                        {autosaveStates[selectedCalendarResult.id] === "saving" ? "저장 중" : autosaveStates[selectedCalendarResult.id] === "saved" ? "자동 저장됨" : autosaveStates[selectedCalendarResult.id] === "error" ? "저장 실패" : "클릭하면 자동 저장"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
                      <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-100">초록: 정답</span>
                      <span className="rounded bg-orange-500/15 px-2 py-1 text-orange-100">주황: 오답</span>
                      <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-100">빨강: 못 풂</span>
                    </div>
                    <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                      {Array.from({ length: problemCount(selectedCalendarResult) }, (_, index) => {
                        const number = index + 1;
                        const statuses = resultStatuses[selectedCalendarResult.id] || buildStatuses(selectedCalendarResult);
                        return (
                          <ResultCell
                            key={number}
                            number={number}
                            status={statuses[number] || "correct"}
                            onClick={() => toggleResultProblem(selectedCalendarResult, number)}
                          />
                        );
                      })}
                    </div>
                    <Button className="mt-3 w-full" size="sm" variant="outline" onClick={() => saveResult(selectedCalendarResult)} disabled={savingResultId === selectedCalendarResult.id}>
                      {savingResultId === selectedCalendarResult.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      저장
                    </Button>
                  </div>
                ) : selectedCalendarItem ? (
                  <p className="rounded-lg border border-dashed border-white/10 p-3 text-sm text-slate-500">이 일정에는 아직 채점할 시험/과제 결과가 연결되어 있지 않습니다.</p>
                ) : null}
                {!selectedCalendarItems.length ? <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-500">선택한 날짜에 등록된 일정이 없습니다.</p> : null}
              </CardContent>
            </Card>
          </section>
        ) : null}

        {activeTab === "wrong" ? (
          <section className="space-y-4">
            <Card className="border-white/[0.08] bg-white/[0.025]">
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-violet-300/25 bg-violet-500/15 text-violet-100">
                    <Archive className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white">아카이브</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>{archivedWrongAnswers.length}문항</span>
                      <span className="text-slate-700">·</span>
                      <span>복습 필요 {archiveReviewNeededCount}문항</span>
                    </div>
                  </div>
                </div>
                <Button onClick={makeReviewSet} disabled={!archiveReviewNeededCount}>
                  <RotateCcw className="h-4 w-4" />
                  복습 세트 만들기
                </Button>
              </CardContent>
            </Card>

            {archivedWrongAnswers.length ? (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {archivedWrongAnswers.map((wrong) => (
                  <article
                    key={wrong.id}
                    className="group relative min-h-[215px] overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03] transition-all hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-white/[0.045] hover:shadow-[0_18px_45px_rgba(76,29,149,0.16)]"
                  >
                    <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: archiveAccentColor(wrong) }} />
                    <div className="flex h-full flex-col p-4 pl-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-xs font-black text-violet-100">
                              #{wrong.problem_number}
                            </span>
                            <Badge className={cn("border", tone(wrong.resolved_status))}>{archiveStatusLabel(wrong.resolved_status)}</Badge>
                          </div>
                          <p className="mt-2 line-clamp-1 text-xs font-semibold text-slate-500">
                            {[wrong.subject, wrong.unit].filter(Boolean).join(" · ") || "분류 없음"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {wrong.problem_id ? (
                            <Link
                              href={`/problems/${wrong.problem_id}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/20 text-slate-300 transition hover:border-violet-300/50 hover:bg-violet-500/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
                              aria-label={`${wrong.problem_number}번 상세 보기`}
                            >
                              <ArrowUpRight className="h-4 w-4" />
                            </Link>
                          ) : null}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-500 hover:bg-rose-500/10 hover:text-rose-100"
                            onClick={() => deleteWrongAnswer(wrong)}
                            disabled={deletingWrongAnswerId === wrong.id}
                            aria-label={`${wrong.problem_number}번 아카이브 항목 삭제`}
                          >
                            {deletingWrongAnswerId === wrong.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      <MathText className="mt-4 line-clamp-4 text-[14px] font-medium leading-[1.55] text-slate-200" value={wrong.problem_text || "문항 내용 없음"} />

                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-[11px] font-medium text-slate-500">
                        <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-slate-300">오답 {wrong.wrong_count}회</span>
                        <span>{wrong.latest_wrong_at ? shortDate(wrong.latest_wrong_at) : "최근 기록 없음"}</span>
                        {wrong.unit ? (
                          <>
                            <span className="text-slate-700">·</span>
                            <span>{wrong.unit}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
                <Archive className="mx-auto h-8 w-8 text-violet-200" />
                <p className="mt-3 text-sm font-semibold text-slate-400">아카이브에 담긴 문항이 없습니다.</p>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "counseling" ? (
          <section className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="border-white/[0.08] bg-white/[0.025]">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-white"><MessageSquareText className="h-5 w-5" />{editingCounselingLogId ? "상담일지 편집" : "상담일지 작성"}</CardTitle>
                  <div className="flex items-center gap-2">
                    {editingCounselingLogId ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => resetCounselingEntryForm()}>
                        <X className="h-4 w-4" />
                        취소
                      </Button>
                    ) : null}
                    <Button type="button" size="icon" variant="outline" onClick={() => setFormatSettingsOpen((current) => !current)} aria-label="상담일지 포맷 설정">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {formatSettingsOpen ? (
                  <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400">적용 클래스</p>
                      {data.class_ids.length ? (
                        <select
                          value={counselingClassId}
                          onChange={(event) => changeCounselingClass(event.target.value)}
                          className="h-10 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white outline-none"
                        >
                          {data.class_ids.map((classId, index) => (
                            <option key={classId} value={classId}>{data.class_names[index] || `클래스 ${index + 1}`}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="rounded-md border border-dashed border-white/10 p-3 text-xs text-slate-500">클래스에 속한 학생일 때 클래스별 포맷을 저장할 수 있습니다.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {counselingFields.map((field) => (
                        <div
                          key={field.id}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            reorderCounselingField(field.id);
                            setDraggingCounselingFieldId("");
                          }}
                          className={cn(
                            "rounded-md border border-white/[0.08] bg-white/[0.025] p-2 transition",
                            draggingCounselingFieldId === field.id && "border-violet-300/45 bg-violet-500/10 opacity-70"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => {
                                setDraggingCounselingFieldId(field.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", field.id);
                              }}
                              onDragEnd={() => setDraggingCounselingFieldId("")}
                              className="grid h-10 w-8 shrink-0 cursor-grab place-items-center rounded-md border border-white/[0.08] bg-black/20 text-slate-400 transition hover:border-violet-300/35 hover:text-white active:cursor-grabbing"
                              aria-label={`${field.label} 순서 변경`}
                              title="드래그해서 순서 변경"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <Input
                              value={field.label}
                              onChange={(event) => updateCounselingField(field.id, { label: event.target.value })}
                              placeholder="새 항목"
                            />
                            <Button type="button" size="icon" variant="outline" onClick={() => removeCounselingField(field.id)} disabled={counselingFields.length <= 1} aria-label="항목 삭제">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <Input
                            className="mt-2"
                            value={field.placeholder || ""}
                            onChange={(event) => updateCounselingField(field.id, { placeholder: event.target.value })}
                            placeholder="기록할 내용을 입력하세요"
                          />
                          <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                            <input
                              type="checkbox"
                              checked={field.include_in_report !== false}
                              onChange={(event) => updateCounselingField(field.id, { include_in_report: event.target.checked })}
                            />
                            주간 리포트 변수로 사용
                          </label>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={addCounselingField}>
                        <Plus className="h-4 w-4" />
                        항목 추가
                      </Button>
                      <Button type="button" size="sm" onClick={saveClassFormat} disabled={formatSaving || !counselingClassId}>
                        {formatSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        지금 저장
                      </Button>
                    </div>
                    <p className={cn("text-xs", formatAutosaveState === "error" ? "text-rose-300" : "text-slate-500")}>{formatAutosaveLabel}</p>

                    <div className="grid grid-cols-2 gap-2">
                      {counselingPresets.map((preset) => (
                        <div key={preset.slot} className="rounded-md border border-white/[0.08] bg-white/[0.025] p-2">
                          <p className="truncate text-xs font-bold text-slate-300">{preset.name || `프리셋 ${preset.slot}`}</p>
                          <div className="mt-2 flex gap-1">
                            <Button type="button" size="sm" variant="outline" className="flex-1 px-2" onClick={() => applyPreset(preset)} disabled={!preset.fields.length}>
                              적용
                            </Button>
                            <Button type="button" size="sm" className="flex-1 px-2" onClick={() => savePreset(preset.slot)} disabled={presetSavingSlot === preset.slot}>
                              {presetSavingSlot === preset.slot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              저장
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className={cn("text-xs", counselingDraftStatus === "error" ? "text-rose-300" : "text-slate-500")}>{counselingDraftLabel}</p>
                <Input type="date" value={counselingForm.counseling_date} onChange={(event) => setCounselingForm((current) => ({ ...current, counseling_date: event.target.value }))} />
                <Input placeholder="상담 제목" value={counselingForm.title} onChange={(event) => setCounselingForm((current) => ({ ...current, title: event.target.value }))} />
                {counselingFields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-400">{field.label}</p>
                      {activeReportField?.id === field.id ? <span className="text-[11px] text-violet-200">변수 사용 가능</span> : null}
                    </div>
                    {activeReportField?.id === field.id ? (
                      <div className="flex flex-wrap gap-1">
                        {counselingFields
                          .filter((item) => item.id !== field.id && item.include_in_report !== false)
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => insertReportVariable(item)}
                              className="rounded border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/20"
                            >
                              {`{{${item.label}}}`}
                            </button>
                          ))}
                      </div>
                    ) : null}
                    <textarea
                      className="min-h-28 w-full rounded-md border border-white/[0.08] bg-white/[0.035] p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-300/50"
                      placeholder={field.placeholder || field.label}
                      value={counselingFieldValues[field.id] || ""}
                      onChange={(event) => updateCounselingFieldValue(field.id, event.target.value)}
                    />
                  </div>
                ))}
                <Button className="w-full" onClick={saveCounselingLog} disabled={counselingSaving || !counselingForm.title.trim()} aria-label={editingCounselingLogId ? "상담일지 수정 저장" : "상담일지 저장"}>
                  {counselingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </CardContent>
            </Card>
            <Card className="border-white/[0.08] bg-white/[0.025]">
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
                  <div key={log.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm text-violet-200">{shortDate(log.counseling_date)}</p>
                        <p className="mt-1 text-lg font-black text-white">{log.title}</p>
                        {log.class_name ? <p className="mt-1 text-xs text-slate-500">{log.class_name}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => startEditingCounselingLog(log)}>
                          <Pencil className="h-3.5 w-3.5" />
                          편집
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-rose-400/20 text-rose-100 hover:bg-rose-500/10"
                          onClick={() => deleteCounselingRecord(log)}
                          disabled={deletingCounselingLogId === log.id}
                        >
                          {deletingCounselingLogId === log.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          삭제
                        </Button>
                        <Badge className="border border-violet-300/20 bg-violet-500/15 text-violet-100">상담</Badge>
                      </div>
                    </div>
                    <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                      {logSections(log).map((section) => (
                        <p key={`${log.id}-${section.field_id}`} className="whitespace-pre-line rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <span className="font-semibold text-white">{section.label}</span>
                          <br />
                          {section.value || "-"}
                        </p>
                      ))}
                      {!logSections(log).length ? <p className="whitespace-pre-line text-slate-400">상담 내용 없음</p> : null}
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
