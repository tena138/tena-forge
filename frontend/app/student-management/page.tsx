"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  GripVertical,
  KeyRound,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Square,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AcademyProfile } from "@/lib/auth-api";
import { WORKSPACE_CHANGED_EVENT, getActiveWorkspaceId, readStoredAuthProfile } from "@/lib/auth-client";
import {
  issueLearningStudentKeys,
  listAcademySeats,
  releaseAcademySeat,
  rotateAcademySeatCode,
} from "@/lib/academyStudent";
import type { AcademySeat } from "@/lib/academyStudent";
import type { StudentKeyRecipient } from "@/lib/academyStudent";
import { ProblemSetListItem, api } from "@/lib/api";
import {
  ClassCard,
  PaperSessionDetail,
  PaperSessionSummary,
  RoutineAction,
  RoutineMessage,
  SessionProblem,
  StudentCard,
  StudentProfileCollectionSettings,
  WrongAnswer,
  createClass,
  createCounselingLog,
  createPaperSession,
  createScheduleEvent,
  createReviewSet,
  deleteClass,
  ensureStudentInviteCode,
  getPaperSessionDetail,
  getStudentManagementDashboard,
  getStudentProfileCollectionSettings,
  listPaperSessions,
  listRoutineActions,
  listWrongAnswers,
  mergeStudents,
  previewCounselingIntake,
  refreshRoutineAi,
  savePaperSessionGrade,
  sendRoutineAction,
  transcribeCounselingAudio,
  updateClassOrder,
  updateStudentProfileCollectionSettings,
  updateRoutineMessage,
} from "@/lib/studentManagement";
import type { CounselingIntakePreview } from "@/lib/studentManagement";
import {
  buildRecurringDateTimes,
  dayIntervalOptions,
  defaultMonthDayFromDateTime,
  defaultWeekdayFromDateTime,
  localDateTimeInputValue,
  monthDayOptions,
  monthIntervalOptions,
  scheduleWeekdays,
  type ScheduleRecurrenceUnit,
  weekIntervalOptions,
} from "@/lib/scheduleRecurrence";
import { cn } from "@/lib/utils";

function resolveActiveManagementAcademyId(profile?: AcademyProfile | null) {
  const activeWorkspaceId = getActiveWorkspaceId();
  if (activeWorkspaceId && activeWorkspaceId !== "student") return activeWorkspaceId;
  return profile?.account_type === "academy" ? profile.id : "";
}

function normalizeListResponse<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

type TabKey = "routine" | "classes" | "students" | "counseling" | "sessions" | "grading" | "wrong" | "calendar" | "analytics";
const STUDENT_MANAGEMENT_TAB_KEYS: TabKey[] = ["routine", "classes", "students", "counseling", "sessions", "grading", "wrong", "calendar", "analytics"];
type CounselingMode = "new" | "existing";
type BulkInviteResult = AcademySeat & { key_code: string; status: string };
type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
type TrendMetricKey = "selected" | "average" | "highest" | "lowest" | "q1" | "q2" | "q3" | "stddev";
type ClassSessionMetricPoint = {
  id: string;
  title: string;
  date?: string | null;
  assigned: number;
  respondents: number;
  selected: number | null;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  stddev: number | null;
};
type ProblemPageGroup = {
  key: string;
  label: string;
  problems: SessionProblem[];
};
type StudentMergeMenuState = { student: StudentCard; classId: string; x: number; y: number };
type PendingCounselingCandidate = {
  id: string;
  created_at: string;
  title: string;
  transcript: string;
  summary: string;
  profile: CounselingIntakePreview["student_profile"];
  sections: CounselingIntakePreview["sections"];
};

const emptyClassForm = {
  name: "",
  description: "",
  subject: "",
  grade_level: "",
  routine_date: "",
  routine_starts_at: "",
  routine_ends_at: "",
  routine_recurrence_unit: "week" as ScheduleRecurrenceUnit,
  routine_recurrence_interval: "1",
  routine_recurrence_weekdays: [] as number[],
  routine_recurrence_month_day: "",
  routine_repeat_until: "",
};
const CLASS_TIME_STEP_MINUTES = 10;
const CLASS_TIME_OPTIONS = Array.from({ length: (24 * 60) / CLASS_TIME_STEP_MINUTES }, (_, index) => {
  const minutes = index * CLASS_TIME_STEP_MINUTES;
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const value = `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { value, label: value, minutes };
});
const CLASS_START_TIME_OPTIONS = CLASS_TIME_OPTIONS.slice(0, -1);
const CLASS_TIME_WHEEL_ITEM_HEIGHT = 34;
const CLASS_TIME_WHEEL_VISIBLE_ITEMS = 5;
const CLASS_TIME_WHEEL_PADDING_ITEMS = Math.floor(CLASS_TIME_WHEEL_VISIBLE_ITEMS / 2);
const COUNSELING_PENDING_STORAGE_KEY = "tena.student-management.pending-counseling";

function minutesFromTimeValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function timeValueFromMinutes(value: number) {
  const rounded = Math.round(value / CLASS_TIME_STEP_MINUTES) * CLASS_TIME_STEP_MINUTES;
  const minutes = Math.max(0, Math.min(24 * 60 - CLASS_TIME_STEP_MINUTES, rounded));
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

type ClassTimeOption = (typeof CLASS_TIME_OPTIONS)[number];

function ClassTimeWheel({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: ClassTimeOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const displayIndex = selectedIndex >= 0 ? selectedIndex : 0;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const nextScrollTop = displayIndex * CLASS_TIME_WHEEL_ITEM_HEIGHT;
    if (Math.abs(element.scrollTop - nextScrollTop) > 1) {
      element.scrollTo({ top: nextScrollTop, behavior: "smooth" });
    }
  }, [displayIndex, options]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) window.clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  function selectIndex(index: number) {
    if (disabled || !options.length) return;
    const nextIndex = Math.max(0, Math.min(options.length - 1, index));
    const nextValue = options[nextIndex]?.value;
    if (nextValue && nextValue !== value) onChange(nextValue);
  }

  function handleScroll() {
    if (disabled) return;
    if (scrollTimeoutRef.current !== null) window.clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => {
      const element = scrollRef.current;
      if (!element) return;
      selectIndex(Math.round(element.scrollTop / CLASS_TIME_WHEEL_ITEM_HEIGHT));
    }, 80);
  }

  return (
    <div className={cn("rounded-[10px] bg-zinc-100 p-2", disabled && "opacity-50")}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-black text-zinc-500">{label}</span>
        <span className="font-mono text-xs font-black text-zinc-950">{value || "--:--"}</span>
      </div>
      <div className="relative overflow-hidden rounded-[9px] bg-white ring-1 ring-zinc-200">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-0 h-[34px] -translate-y-1/2 rounded-[8px] bg-zinc-950/[0.06] ring-1 ring-zinc-950/10" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-white to-white/0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-white to-white/0" />
        <div
          ref={scrollRef}
          role="listbox"
          aria-label={label}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onScroll={handleScroll}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              selectIndex(displayIndex + 1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              selectIndex(displayIndex - 1);
            }
          }}
          className="relative z-10 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-black/10"
          style={{
            height: CLASS_TIME_WHEEL_ITEM_HEIGHT * CLASS_TIME_WHEEL_VISIBLE_ITEMS,
            scrollSnapType: "y mandatory",
            scrollbarWidth: "none",
          }}
        >
          <div style={{ height: CLASS_TIME_WHEEL_ITEM_HEIGHT * CLASS_TIME_WHEEL_PADDING_ITEMS }} />
          {options.map((option, index) => {
            const active = selectedIndex === index;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                disabled={disabled}
                onClick={() => selectIndex(index)}
                className={cn(
                  "flex w-full items-center justify-center font-mono text-sm font-black transition",
                  active ? "scale-105 text-zinc-950" : "text-zinc-400 hover:text-zinc-700"
                )}
                style={{ height: CLASS_TIME_WHEEL_ITEM_HEIGHT, scrollSnapAlign: "center" }}
              >
                {option.label}
              </button>
            );
          })}
          <div style={{ height: CLASS_TIME_WHEEL_ITEM_HEIGHT * CLASS_TIME_WHEEL_PADDING_ITEMS }} />
        </div>
      </div>
    </div>
  );
}

function readPendingCounselingCandidates(): PendingCounselingCandidate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COUNSELING_PENDING_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writePendingCounselingCandidates(items: PendingCounselingCandidate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COUNSELING_PENDING_STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
}

function mergeInviteCodes(existing: StudentCard["invite_codes"], next: StudentCard["invite_codes"]) {
  const byKey = new Map<string, NonNullable<StudentCard["invite_codes"]>[number]>();
  for (const code of [...(existing || []), ...(next || [])]) {
    const key = code.seat_id || code.membership_id || `${code.class_id || ""}:${code.invite_code_preview || code.invite_code || ""}`;
    byKey.set(key, { ...byKey.get(key), ...code });
  }
  return Array.from(byKey.values());
}

function mergeStudentCard(existing: StudentCard, next: StudentCard): StudentCard {
  const classIds = [...existing.class_ids];
  const classNames = [...existing.class_names];
  const classSubjects = [...(existing.class_subjects || [])];
  for (const [index, classId] of next.class_ids.entries()) {
    if (classIds.includes(classId)) continue;
    classIds.push(classId);
    classNames.push(next.class_names[index] || "");
    classSubjects.push(next.class_subjects?.[index] || null);
  }
  return {
    ...existing,
    recent_score: existing.recent_score ?? next.recent_score,
    recent_completion_status: existing.recent_completion_status ?? next.recent_completion_status,
    unresolved_wrong_count: Math.max(existing.unresolved_wrong_count || 0, next.unresolved_wrong_count || 0),
    class_ids: classIds,
    class_names: classNames,
    class_subjects: classSubjects,
    invite_codes: mergeInviteCodes(existing.invite_codes, next.invite_codes),
  };
}

function studentDirectoryText(student: StudentCard) {
  return [student.name, student.school, student.grade_level, student.class_names.join(" ")].filter(Boolean).join(" ").toLowerCase();
}

function studentMetaText(student: StudentCard) {
  return [student.school, student.grade_level, student.class_names.join(", ")].filter(Boolean).join(" · ") || "소속 없음";
}

function parseBulkInviteRows(value: string): StudentKeyRecipient[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", phone = "", account_user_id = "", memo = ""] = line
        .split(/\t|,|\//)
        .map((part) => part.trim());
      return { name: name || null, phone: phone || null, account_user_id: account_user_id || null, memo: memo || null };
    });
}

function bulkInviteLineFromCandidate(candidate: PendingCounselingCandidate) {
  const profile = candidate.profile || {};
  const extraProfile = profile as Record<string, string | undefined>;
  const phone = profile.guardian_phone || extraProfile.student_phone || "";
  return [profile.name || candidate.title || "", phone].filter(Boolean).join(", ");
}

function deliveryStatusLabel(status?: string | null) {
  if (status === "sms_link_ready") return "SMS 준비";
  if (status === "app_notification_created") return "앱 초대 생성";
  if (status === "claimed") return "등록 완료";
  return "직접 전달";
}

function isPendingKeyCard(student: StudentCard) {
  return student.card_type === "pending_key" || student.status === "pending_key";
}

function mergePrimaryPreview(left: StudentCard | null, right: StudentCard | null) {
  if (!left || !right) return left || right;
  const leftTime = left.joined_at ? new Date(left.joined_at).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.joined_at ? new Date(right.joined_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime < rightTime ? left : right;
  return left.id.localeCompare(right.id) <= 0 ? left : right;
}

function seatKeyStatusLabel(seat: AcademySeat) {
  if (seat.key_status === "legacy_unassigned") return "클래스 미배정";
  if (seat.key_status === "revoked") return "비활성";
  if (seat.key_status === "claimed" || seat.assigned) return "연결됨";
  return "대기";
}

function seatKeyStatusVariant(seat: AcademySeat): "success" | "secondary" | "warning" | "error" {
  if (seat.key_status === "legacy_unassigned") return "warning";
  if (seat.key_status === "revoked") return "error";
  if (seat.key_status === "claimed" || seat.assigned) return "success";
  return "secondary";
}

const trendMetricOptions: Array<{ key: TrendMetricKey; label: string; shortLabel: string; color: string }> = [
  { key: "selected", label: "본인 점수", shortLabel: "본인", color: "#111827" },
  { key: "average", label: "응시자 평균", shortLabel: "평균", color: "#525252" },
  { key: "highest", label: "최고점", shortLabel: "최고", color: "#737373" },
  { key: "lowest", label: "최저점", shortLabel: "최저", color: "#a3a3a3" },
  { key: "q1", label: "Q1", shortLabel: "Q1", color: "#404040" },
  { key: "q2", label: "중앙값", shortLabel: "중앙", color: "#18181b" },
  { key: "q3", label: "Q3", shortLabel: "Q3", color: "#71717a" },
  { key: "stddev", label: "표준편차", shortLabel: "σ", color: "#27272a" },
];
const defaultTrendMetrics: TrendMetricKey[] = ["selected", "average", "q2"];
function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(status?: string) {
  if (!status) return "border-zinc-200 bg-zinc-100 text-zinc-600";
  if (["graded", "completed", "Active", "active"].includes(status)) return "border-zinc-300 bg-white text-zinc-950";
  if (["wrong", "Needs Review", "missing", "late", "unresolved"].includes(status)) return "border-zinc-400 bg-zinc-100 text-zinc-950";
  if (["scheduled", "grading", "pending_grading", "reviewing"].includes(status)) return "border-zinc-300 bg-zinc-50 text-zinc-800";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function statusLabel(status?: string | null) {
  if (!status) return "대기";
  if (status === "active" || status === "Active") return "활성";
  if (status === "completed") return "완료";
  if (status === "graded") return "채점 완료";
  if (status === "grading") return "채점 중";
  if (status === "pending" || status === "not_started") return "대기";
  if (status === "pending_grading") return "채점 대기";
  if (status === "scheduled") return "예정";
  if (status === "reviewing") return "검토 중";
  if (status === "unresolved") return "미해결";
  if (status === "resolved") return "해결";
  if (status === "wrong") return "오답";
  if (status === "unanswered") return "미응답";
  if (status === "unmarked") return "미채점";
  return status;
}

function sessionTypeLabel(type?: string | null) {
  if (type === "test") return "시험";
  if (type === "homework") return "숙제";
  if (type === "review") return "복습";
  if (type === "mock_exam") return "모의고사";
  if (type === "practice") return "연습";
  return type || "세션";
}

function routineTypeLabel(type: string) {
  if (type === "grade_report") return "채점 리포트";
  if (type === "class_feedback") return "수업 피드백";
  if (type === "counseling_share") return "상담 공유";
  return "루틴";
}

function routineStatusLabel(status: string) {
  if (status === "sent") return "전송됨";
  if (status === "reviewing") return "검토 중";
  if (status === "suggested") return "제안";
  return status || "제안";
}

function routineStatusTone(status: string) {
  if (status === "sent") return "border-zinc-300 bg-white text-zinc-950";
  if (status === "reviewing") return "border-zinc-300 bg-zinc-100 text-zinc-950";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function routineChannelLabel(channel: string) {
  if (channel === "student_app") return "학생앱 알림";
  return channel === "student_notification" ? "학생앱 알림" : channel;
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

function numericValues(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function quantile(values: Array<number | null | undefined>, fraction: number) {
  const scores = numericValues(values).sort((left, right) => left - right);
  if (!scores.length) return null;
  if (scores.length === 1) return scores[0];
  const position = (scores.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return scores[lowerIndex];
  const lower = scores[lowerIndex];
  const upper = scores[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
}

function standardDeviation(values: Array<number | null | undefined>) {
  const scores = numericValues(values);
  if (scores.length < 2) return null;
  const mean = average(scores) || 0;
  const variance = scores.reduce((total, value) => total + (value - mean) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

function minScore(values: Array<number | null | undefined>) {
  const scores = numericValues(values);
  return scores.length ? Math.min(...scores) : null;
}

function maxScore(values: Array<number | null | undefined>) {
  const scores = numericValues(values);
  return scores.length ? Math.max(...scores) : null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scoreLabel(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}점` : "-";
}

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  if (candidate.message === "Network Error") return fallback;
  return candidate.message || fallback;
}

function ClassStudentCard({ student, onMergeContext }: { student: StudentCard; onMergeContext?: (event: MouseEvent<HTMLElement>, student: StudentCard) => void }) {
  if (isPendingKeyCard(student)) {
    const keyLabel = studentKeyLabel(student);
    const metadata = (student.invite_metadata || {}) as Record<string, string | null | undefined>;
    const phone = student.recipient_phone || metadata.recipient_phone;
    const delivery = student.delivery_status || metadata.delivery_status;
    return (
      <article className="flex h-full min-h-[92px] w-full flex-col justify-between rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-2.5 lg:min-h-[136px] lg:w-[210px] lg:shrink-0 lg:p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-zinc-700 ring-1 ring-zinc-200">
            <KeyRound className="h-4 w-4" />
          </div>
          <Badge className="shrink-0 rounded-md bg-zinc-900 text-white hover:bg-zinc-900">{deliveryStatusLabel(delivery)}</Badge>
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-950">{student.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{phone ? `${phone} · ` : ""}학생이 Tena Note에서 초대 링크를 수락하면 실제 정보로 채워집니다.</p>
        </div>
        <div className="mt-3 rounded bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 ring-1 ring-zinc-200 lg:rounded-md lg:text-xs">
          <span className="text-zinc-500">Invite </span>
          <span className="font-mono">{keyLabel}</span>
        </div>
      </article>
    );
  }

  return (
    <Link
      href={`/student-management/students/${student.id}`}
      onContextMenu={(event) => {
        if (!onMergeContext) return;
        event.preventDefault();
        onMergeContext(event, student);
      }}
      className="flex h-full min-h-[92px] w-full flex-col justify-between rounded-md bg-white p-2.5 transition hover:bg-zinc-50 lg:min-h-[136px] lg:w-[210px] lg:shrink-0 lg:p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-950">{student.name}</p>
            <p className="mt-1 truncate text-xs text-zinc-500">{[student.school, student.grade_level].filter(Boolean).join(" · ") || "학생 정보 미입력"}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-center text-[11px] lg:mt-3 lg:gap-2 lg:text-xs">
        <div className="rounded bg-zinc-100 px-2 py-1.5 lg:rounded-md lg:p-2">
          <p className="text-zinc-500">최근 점수</p>
          <p className="mt-1 font-semibold text-zinc-950">{student.recent_score == null ? "-" : `${Math.round(student.recent_score)}점`}</p>
        </div>
        <div className="rounded bg-zinc-100 px-2 py-1.5 lg:rounded-md lg:p-2">
          <p className="text-zinc-500">오답</p>
          <p className="mt-1 font-semibold text-zinc-950">{student.unresolved_wrong_count}</p>
        </div>
      </div>
    </Link>
  );
}

function studentKeyLabel(student: StudentCard) {
  const keys = student.invite_codes || [];
  if (keys.length > 1) return `${keys.length}개 클래스 키`;
  const key = keys[0];
  if (key?.invite_code) return key.invite_code;
  if (key?.invite_code_preview) return `****${key.invite_code_preview}`;
  return student.invite_code || (student.invite_code_preview ? `****${student.invite_code_preview}` : "키 없음");
}

function StudentDirectoryCard({ student, copying, onCopyKey }: { student: StudentCard; copying?: boolean; onCopyKey: (student: StudentCard) => void }) {
  const meta = [student.school, student.grade_level, student.class_names.join(", ")].filter(Boolean).join(" · ") || "학생 정보 미입력";
  const keyLabel = studentKeyLabel(student);
  return (
    <article className="group min-w-0 rounded-md bg-white p-3 transition hover:bg-zinc-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={`/student-management/students/${student.id}`} className="truncate text-sm font-black text-zinc-950 hover:text-zinc-700">
              {student.name}
            </Link>
            <span className="inline-flex max-w-full items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-zinc-800">
              <span className="text-zinc-500">Key</span>
              <span className="truncate">{keyLabel}</span>
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">{meta}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
          onClick={() => onCopyKey(student)}
          disabled={copying}
          aria-label={`${student.name} 학생 키 복사`}
          title="학생 키 복사"
        >
          {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-zinc-100 px-2 py-2">
          <p className="text-zinc-500">최근</p>
          <p className="mt-1 font-bold text-zinc-950">{student.recent_score == null ? "-" : `${Math.round(student.recent_score)}점`}</p>
        </div>
        <div className="rounded bg-zinc-100 px-2 py-2">
          <p className="text-zinc-500">오답</p>
          <p className="mt-1 font-bold text-zinc-950">{student.unresolved_wrong_count}</p>
        </div>
        <div className="rounded bg-zinc-100 px-2 py-2">
          <p className="text-zinc-500">반</p>
          <p className="mt-1 truncate font-bold text-zinc-950">{student.class_names.length || "-"}</p>
        </div>
      </div>
    </article>
  );
}

function ClassTrendChart({
  points,
  selectedPointId,
  onSelectPoint,
}: {
  points: ClassSessionMetricPoint[];
  selectedPointId?: string | null;
  onSelectPoint?: (pointId: string) => void;
}) {
  const [selectedMetrics, setSelectedMetrics] = useState<TrendMetricKey[]>(defaultTrendMetrics);
  const visibleMetrics = trendMetricOptions.filter((metric) => selectedMetrics.includes(metric.key));
  const latestPoint = [...points].reverse().find((point) => point.respondents > 0);
  const selectedPoint = selectedPointId ? points.find((point) => point.id === selectedPointId) || null : null;
  const summaryPoint = selectedPoint || latestPoint;
  const chartWidth = Math.max(760, points.length * 118);
  const chartHeight = 300;
  const padding = { top: 22, right: 26, bottom: 58, left: 44 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const baseline = padding.top + plotHeight;
  const edgeInset = Math.min(52, Math.max(28, plotWidth * 0.08));
  const xFor = (index: number) =>
    padding.left + (points.length <= 1 ? plotWidth / 2 : edgeInset + (index / (points.length - 1)) * Math.max(1, plotWidth - edgeInset * 2));
  const yFor = (value: number) => padding.top + ((100 - clampScore(value)) / 100) * plotHeight;

  function toggleMetric(key: TrendMetricKey) {
    setSelectedMetrics((current) => {
      if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
      return [...current, key];
    });
  }

  return (
    <div className="rounded-lg bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {trendMetricOptions.map((metric) => {
          const active = selectedMetrics.includes(metric.key);
          return (
            <label
              key={metric.key}
              className={cn(
                "inline-flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-bold transition",
                active ? "text-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-200"
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggleMetric(metric.key)}
                className="h-3 w-3 shrink-0 rounded border-slate-300"
                style={{ accentColor: metric.color }}
                aria-label={`${metric.label} 표시`}
              />
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", metric.key === "selected" && "border border-slate-300")}
                style={{ backgroundColor: active ? metric.color : "rgba(148, 163, 184, 0.35)" }}
                aria-hidden="true"
              />
              <span>{metric.label}</span>
            </label>
          );
        })}
      </div>

      {points.length ? (
        <div className="mt-4 overflow-x-auto rounded-md bg-white p-3 [scrollbar-width:thin]">
          <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="시험 통계 추이 그래프">
            {[100, 75, 50, 25, 0].map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} stroke="rgba(161, 161, 170, 0.24)" />
                  <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="rgb(113, 113, 122)">{tick}</text>
                </g>
              );
            })}
            <line x1={padding.left} x2={padding.left} y1={padding.top} y2={baseline} stroke="rgba(113, 113, 122, 0.32)" />
            <line x1={padding.left} x2={chartWidth - padding.right} y1={baseline} y2={baseline} stroke="rgba(113, 113, 122, 0.32)" />

            {visibleMetrics.map((metric) => {
              const linePoints = points
                .map((point, index) => ({ x: xFor(index), y: typeof point[metric.key] === "number" ? yFor(point[metric.key] as number) : null }))
                .filter((point): point is { x: number; y: number } => point.y != null);
              return (
                <g key={metric.key}>
                  {linePoints.length > 1 ? (
                    <polyline points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={metric.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {linePoints.map((point, index) => (
                    <circle key={`${metric.key}-${index}`} cx={point.x} cy={point.y} r="4" fill={metric.color} stroke="#ffffff" strokeWidth="2" />
                  ))}
                </g>
              );
            })}

            {points.map((point, index) => (
              <g
                key={point.id}
                role="button"
                tabIndex={0}
                aria-label={`${point.title} 선택`}
                onClick={() => onSelectPoint?.(point.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectPoint?.(point.id);
                  }
                }}
                style={{ cursor: onSelectPoint ? "pointer" : "default" }}
              >
                <rect
                  x={xFor(index) - Math.max(44, Math.min(76, plotWidth / Math.max(1, points.length))) / 2}
                  y={padding.top}
                  width={Math.max(44, Math.min(76, plotWidth / Math.max(1, points.length)))}
                  height={chartHeight - padding.top - 7}
                  rx="8"
                  fill={selectedPointId === point.id ? "rgba(0, 0, 0, 0.06)" : "transparent"}
                  stroke={selectedPointId === point.id ? "rgba(0, 0, 0, 0.24)" : "transparent"}
                />
                <text x={xFor(index)} y={chartHeight - 32} textAnchor="middle" fontSize="11" fontWeight="700" fill={selectedPointId === point.id ? "rgb(9, 9, 11)" : "rgb(82, 82, 91)"}>
                  {point.title.length > 11 ? `${point.title.slice(0, 11)}…` : point.title}
                </text>
                <text x={xFor(index)} y={chartHeight - 15} textAnchor="middle" fontSize="10" fill="rgb(100, 116, 139)">
                  {formatDate(point.date)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">통계를 낼 채점 완료 시험이 없습니다.</div>
      )}

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-slate-500">{selectedPoint ? "선택 평균" : "최근 평균"}</p>
          <p className="mt-1 text-base font-black text-slate-950 dark:text-white">{scoreLabel(summaryPoint?.average)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-slate-500">{selectedPoint ? "선택 중앙값" : "최근 중앙값"}</p>
          <p className="mt-1 text-base font-black text-zinc-700 dark:text-zinc-100">{scoreLabel(summaryPoint?.q2)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-slate-500">{selectedPoint ? "선택 범위" : "최근 범위"}</p>
          <p className="mt-1 text-base font-black text-slate-950 dark:text-slate-100">{summaryPoint ? `${scoreLabel(summaryPoint.lowest)} - ${scoreLabel(summaryPoint.highest)}` : "-"}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-slate-500">{selectedPoint ? "선택 응시" : "최근 응시"}</p>
          <p className="mt-1 text-base font-black text-zinc-700 dark:text-zinc-100">{summaryPoint ? `${summaryPoint.respondents}/${summaryPoint.assigned}` : "-"}</p>
        </div>
      </div>
    </div>
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
  const [selectedStatsId, setSelectedStatsId] = useState("");

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
        const classScoreValues = numericValues(classScores);
        const selectedRow = selectedStudent ? classStudents.find((student) => student.id === selectedStudent.id) : null;
        const selectedScore = typeof selectedRow?.result.score === "number" && selectedRow.result.status === "graded" ? selectedRow.result.score : null;
        const classAverage = average(classScores);
        const overallAverage = average(overallScores);
        const classStdDev = standardDeviation(classScores);
        const overallStdDev = standardDeviation(overallScores);
        const rank = selectedScore == null ? null : classScoreValues.filter((score) => score > selectedScore).length + 1;
        const percentile = selectedScore == null || classScoreValues.length < 2 || rank == null ? null : Math.round(((classScoreValues.length - rank) / (classScoreValues.length - 1)) * 100);
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
          highestScore: maxScore(classScores),
          lowestScore: minScore(classScores),
          q1Score: quantile(classScores, 0.25),
          q2Score: quantile(classScores, 0.5),
          q3Score: quantile(classScores, 0.75),
          rank,
          percentile,
          classAssignedCount: classStudents.length,
          classGradedCount: classScoreValues.length,
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
  const latestScoredStat = scoredStats[scoredStats.length - 1] || null;
  const selectedSessionStat = selectedStatsId ? sessionStats.find((item) => item.detail.id === selectedStatsId) || null : null;
  const focusedStat = selectedSessionStat || latestScoredStat;
  const focusedClassDelta =
    focusedStat?.selectedScore != null && focusedStat.classAverage != null
      ? focusedStat.selectedScore - focusedStat.classAverage
      : null;
  const classMetricPoints: ClassSessionMetricPoint[] = sessionStats
    .filter((item) => item.classGradedCount > 0)
    .map((item) => ({
      id: item.detail.id,
      title: item.detail.title,
      date: item.detail.scheduled_at || item.detail.created_at,
      assigned: item.classAssignedCount,
      respondents: item.classGradedCount,
      selected: item.selectedScore,
      average: item.classAverage,
      highest: item.highestScore,
      lowest: item.lowestScore,
      q1: item.q1Score,
      q2: item.q2Score,
      q3: item.q3Score,
      stddev: item.classStdDev,
    }));
  const focusedPointId = focusedStat?.detail.id || classMetricPoints[classMetricPoints.length - 1]?.id || null;

  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg bg-white p-4">
        {loading ? (
          <div className="flex min-h-36 items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            통계 계산 중
          </div>
        ) : null}
        {!loading && !sessionStats.length ? (
          <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-white/10">아직 이 반에 연결된 시험 기록이 없습니다.</div>
        ) : null}
        {!loading && sessionStats.length ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">{classRow.name} 성적 통계</p>
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
                      selectedStudent?.id === student.id
                        ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-300/50 dark:bg-zinc-500/25 dark:text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400 dark:hover:text-white"
                    )}
                  >
                    {student.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr]">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-semibold text-zinc-700 dark:text-slate-400">{selectedSessionStat ? "본인 선택 점수" : "본인 최근 점수"}</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <p className="text-4xl font-black tracking-normal text-slate-950 dark:text-white">{scoreLabel(focusedStat?.selectedScore)}</p>
                  <p className="max-w-[220px] truncate text-right text-xs text-slate-500 dark:text-slate-400" title={focusedStat?.detail.title}>
                    {focusedStat ? `${focusedStat.detail.title} · ${formatDate(focusedStat.detail.scheduled_at || focusedStat.detail.created_at)}` : "채점 완료 기록 없음"}
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">반 평균 대비</p>
                <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{focusedClassDelta == null ? "-" : `${focusedClassDelta >= 0 ? "+" : ""}${focusedClassDelta.toFixed(1)}`}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">{selectedSessionStat ? "선택 반 평균" : "최근 반 평균"}</p>
                <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{scoreLabel(focusedStat?.classAverage)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">석차</p>
                <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{focusedStat?.rank == null ? "-" : `${focusedStat.rank}/${focusedStat.classGradedCount}`}</p>
              </div>
            </div>

            <ClassTrendChart points={classMetricPoints} selectedPointId={focusedPointId} onSelectPoint={setSelectedStatsId} />

            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-500">학생 평균</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scoreLabel(selectedAverage)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-500">반 평균</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scoreLabel(classAverageAcross)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-500">전체 평균</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scoreLabel(overallAverageAcross)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-500">점수 표준편차</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-slate-100">{selectedStdDev == null ? "-" : selectedStdDev.toFixed(1)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-500">반 평균 대비</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{averageClassDelta == null ? "-" : `${averageClassDelta >= 0 ? "+" : ""}${averageClassDelta.toFixed(1)}`}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-500">추세</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{trend == null ? "-" : `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}`}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg bg-white p-4 [scrollbar-width:thin]">
              <div className="min-w-[860px]">
                <div className="mb-2 grid grid-cols-[42px_minmax(0,1fr)] gap-3 text-xs text-slate-500">
                  <span>점수</span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-zinc-400" />학생 점수</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-zinc-300" />반 평균</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-zinc-300" />전체 평균</span>
                    <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-zinc-200/20 ring-1 ring-zinc-100/20" />±표준편차</span>
                  </div>
                </div>
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
                  <div className="relative h-72 text-right text-[11px] text-slate-500">
                    {[100, 75, 50, 25, 0].map((tick) => (
                      <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - tick}%` }}>{tick}</span>
                    ))}
                  </div>
                  <div className="relative h-72 border-l border-b border-slate-200 dark:border-white/10">
                    {[100, 75, 50, 25].map((tick) => (
                      <span key={tick} className="absolute left-0 right-0 border-t border-slate-100 dark:border-white/[0.06]" style={{ top: `${100 - tick}%` }} />
                    ))}
                    <div className="absolute inset-0 flex items-end gap-4 px-4 pb-11">
                      {sessionStats.map((item) => {
                        const bandAverage = item.showOverallAverage ? item.overallAverage : item.classAverage;
                        const bandStdDev = item.showOverallAverage ? item.overallStdDev : item.classStdDev;
                        const low = bandAverage == null || bandStdDev == null ? null : Math.max(0, bandAverage - bandStdDev);
                        const high = bandAverage == null || bandStdDev == null ? null : Math.min(100, bandAverage + bandStdDev);
                        const bars = [
                          { key: "student", value: item.selectedScore, color: "bg-zinc-400", label: "학생" },
                          { key: "class", value: item.classAverage, color: "bg-zinc-300", label: "반 평균" },
                          { key: "overall", value: item.showOverallAverage ? item.overallAverage : null, color: "bg-zinc-300", label: "전체 평균" },
                        ];
                        return (
                          <div key={item.detail.id} className="relative flex h-full w-28 shrink-0 items-end justify-center gap-1">
                            {low != null && high != null ? (
                              <span
                                className="absolute left-1 right-1 rounded bg-zinc-200/10 ring-1 ring-zinc-100/15"
                                style={{ bottom: `${low}%`, height: `${Math.max(2, high - low)}%` }}
                                title={`표준편차 범위 ${scoreLabel(low)} - ${scoreLabel(high)}`}
                              />
                            ) : null}
                            {bars.map((bar) => {
                              const height = bar.value == null ? 0 : Math.max(2, Math.min(100, bar.value));
                              return (
                                <span key={bar.key} className="relative flex h-full w-6 items-end justify-center">
                                  <i
                                    className={cn("w-full rounded-t-sm", bar.value == null ? "h-px bg-slate-200 dark:bg-white/10" : bar.color)}
                                    style={{ height: bar.value == null ? undefined : `${height}%` }}
                                    title={`${item.detail.title} ${bar.label}: ${scoreLabel(bar.value)}`}
                                  />
                                </span>
                              );
                            })}
                            <div className="absolute -bottom-10 left-1/2 w-28 -translate-x-1/2 text-center">
                              <p className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-300" title={item.detail.title}>{item.detail.title}</p>
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
                <div key={item.detail.id} className="rounded-md bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">{item.detail.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedStudent?.name || "학생"} {scoreLabel(item.selectedScore)} · 반 평균 {scoreLabel(item.classAverage)}
                        {item.showOverallAverage ? ` · 전체 평균 ${scoreLabel(item.overallAverage)}` : ""}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0 border", statusTone(item.selectedStatus))}>{statusLabel(item.selectedStatus)}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">석차 {item.rank == null ? "-" : `${item.rank}/${item.classGradedCount}`}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">백분위 {item.percentile == null ? "-" : `${item.percentile}`}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">반 σ {item.classStdDev == null ? "-" : item.classStdDev.toFixed(1)}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">전체 n {item.overallGradedCount}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {item.selectedMissed.length ? item.selectedMissed.map((number) => (
                      <span key={number} className="rounded bg-zinc-100 px-2 py-1 text-zinc-800 dark:bg-zinc-500/15 dark:text-zinc-100">{number}번</span>
                    )) : <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-800 dark:bg-zinc-500/15 dark:text-zinc-100">학생 오답 없음</span>}
                    {item.commonMissed.slice(0, 3).map(([number, count]) => (
                      <span key={`common-${number}`} className="rounded bg-zinc-100 px-2 py-1 text-zinc-800 dark:bg-zinc-500/15 dark:text-zinc-100">반 다빈도 {number}번 {count}명</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {bestExam ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
                {selectedStudent?.name || "선택 학생"} 최고 기록은 <span className="font-black text-slate-950 dark:text-white">{bestExam.detail.title}</span>의 <span className="font-black text-zinc-700 dark:text-zinc-100">{scoreLabel(bestExam.selectedScore)}</span>입니다.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function problemStatusKey(problem: Pick<SessionProblem, "problem_id" | "problem_number">) {
  return problem.problem_id || String(problem.problem_number);
}

function displayProblemNumber(problem: Pick<SessionProblem, "problem_number" | "original_problem_number">) {
  return problem.original_problem_number ?? problem.problem_number;
}

function sessionProblemDisplayNumber(problem: Pick<SessionProblem, "problem_number" | "original_problem_number">, index: number, sessionType?: string | null) {
  return usesFlatProblemGrid(sessionType) ? index + 1 : displayProblemNumber(problem);
}

function problemMetadataLabel(problem: SessionProblem) {
  return [
    problem.source_label,
    problem.review_page_number ? `원본 페이지 ${problem.review_page_number}p` : null,
    `원본 문항 ${displayProblemNumber(problem)}번`,
    problem.problem_number !== displayProblemNumber(problem) ? `저장 번호 ${problem.problem_number}번` : null,
    problem.subject,
    problem.unit,
    problem.difficulty,
    problem.answer ? `정답 ${problem.answer}` : null,
  ].filter(Boolean).join(" · ");
}

function problemPageLabel(problem: Pick<SessionProblem, "review_page_number">) {
  return problem.review_page_number ? `p.${problem.review_page_number}` : "페이지 미상";
}

function groupProblemsByPage(problems: SessionProblem[]): ProblemPageGroup[] {
  const groups = new Map<string, ProblemPageGroup>();
  for (const problem of problems) {
    const key = problem.review_page_number ? String(problem.review_page_number) : "unknown";
    const group = groups.get(key) || { key, label: problemPageLabel(problem), problems: [] };
    group.problems.push(problem);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function usesFlatProblemGrid(sessionType?: string | null) {
  return sessionType === "test" || sessionType === "mock_exam";
}

function problemMatchesInput(problem: SessionProblem, rawToken: string, displayNumber = displayProblemNumber(problem), includeMetadataAliases = true) {
  const token = rawToken.trim().toLowerCase().replace(/\s+/g, "");
  if (!token) return false;
  const display = String(displayNumber);
  const internal = String(problem.problem_number);
  const original = String(displayProblemNumber(problem));
  const page = problem.review_page_number ? String(problem.review_page_number) : "";
  if (token === display) return true;
  if (!includeMetadataAliases) return false;
  if (token === internal || token === original) return true;
  if (!page) return false;
  const pageTokens = [
    `${page}-${original}`,
    `${page}:${original}`,
    `${page}.${original}`,
    `p${page}-${original}`,
    `p${page}:${original}`,
    `${page}p-${original}`,
  ];
  return pageTokens.includes(token);
}

function ProblemCell({
  label,
  subtitle,
  metadata,
  status,
  onClick,
}: {
  label: string;
  subtitle?: string;
  metadata?: string;
  status: ProblemStatus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md border px-1 text-xs font-black leading-none transition",
        status === "correct" && "border-zinc-300 bg-white text-zinc-950 shadow-sm shadow-zinc-950/5",
        status === "wrong" && "border-zinc-500 bg-zinc-200 text-zinc-950",
        status === "unanswered" && "border-zinc-400 bg-zinc-100 text-zinc-700",
        status === "unmarked" && "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-zinc-400 hover:text-zinc-950"
      )}
      title={[`${label}번`, metadata || subtitle, status].filter(Boolean).join(" · ")}
    >
      {label}
    </button>
  );
}

export default function StudentManagementPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("classes");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [sessions, setSessions] = useState<PaperSessionSummary[]>([]);
  const [routines, setRoutines] = useState<RoutineAction[]>([]);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [routineBusyId, setRoutineBusyId] = useState("");
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [routineMessageDrafts, setRoutineMessageDrafts] = useState<Record<string, string>>({});
  const [statsOpen, setStatsOpen] = useState<Record<string, boolean>>({});
  const [classStatsDetails, setClassStatsDetails] = useState<Record<string, PaperSessionDetail[]>>({});
  const [classStatsLoading, setClassStatsLoading] = useState<Record<string, boolean>>({});
  const [draggingClassId, setDraggingClassId] = useState("");
  const [problemSets, setProblemSets] = useState<ProblemSetListItem[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [sessionDetail, setSessionDetail] = useState<PaperSessionDetail | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [gridStatuses, setGridStatuses] = useState<Record<string, ProblemStatus>>({});
  const [collapsedTextbookGrids, setCollapsedTextbookGrids] = useState<Record<string, boolean>>({});
  const [wrongInput, setWrongInput] = useState("");
  const [classSaving, setClassSaving] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState("");
  const [showClassCreator, setShowClassCreator] = useState(false);
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [addingStudentClassId, setAddingStudentClassId] = useState("");
  const [classStudentSavingId, setClassStudentSavingId] = useState("");
  const [copyingStudentKeyId, setCopyingStudentKeyId] = useState("");
  const [academyId, setAcademyId] = useState("");
  const [keySeats, setKeySeats] = useState<AcademySeat[]>([]);
  const [keyClassId, setKeyClassId] = useState("");
  const [keyManagerLoading, setKeyManagerLoading] = useState(false);
  const [keyBusySeatId, setKeyBusySeatId] = useState("");
  const [newKeyCodes, setNewKeyCodes] = useState<string[]>([]);
  const [bulkKeyCount, setBulkKeyCount] = useState("1");
  const [bulkInviteText, setBulkInviteText] = useState("");
  const [bulkInviteResults, setBulkInviteResults] = useState<BulkInviteResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [studentMergeMenu, setStudentMergeMenu] = useState<StudentMergeMenuState | null>(null);
  const [mergeSourceStudent, setMergeSourceStudent] = useState<StudentCard | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTargetStudentId, setMergeTargetStudentId] = useState("");
  const [mergingStudent, setMergingStudent] = useState(false);
  const [studentProfileSettings, setStudentProfileSettings] = useState<StudentProfileCollectionSettings>({ fields: [] });
  const [profileSettingsLoading, setProfileSettingsLoading] = useState(false);
  const [profileSettingsSaving, setProfileSettingsSaving] = useState(false);

  const [classForm, setClassForm] = useState(emptyClassForm);
  const [sessionForm, setSessionForm] = useState({
    title: "",
    source_problem_set_id: "",
    session_type: "test",
    class_id: "",
    scheduled_at: todayInput(),
    due_at: "",
  });
  const [sessionStudentIds, setSessionStudentIds] = useState<string[]>([]);
  const [counselingMode, setCounselingMode] = useState<CounselingMode>("new");
  const [counselingStudentId, setCounselingStudentId] = useState("");
  const [counselingClassId, setCounselingClassId] = useState("");
  const [counselingDate, setCounselingDate] = useState(todayInput());
  const [counselingTitle, setCounselingTitle] = useState("신입 상담");
  const [counselingTranscript, setCounselingTranscript] = useState("");
  const [counselingAudioBlob, setCounselingAudioBlob] = useState<Blob | null>(null);
  const [counselingRecording, setCounselingRecording] = useState(false);
  const [counselingBusy, setCounselingBusy] = useState<"" | "transcribing" | "analyzing" | "saving">("");
  const [counselingPreview, setCounselingPreview] = useState<CounselingIntakePreview | null>(null);
  const [pendingCounselingCandidates, setPendingCounselingCandidates] = useState<PendingCounselingCandidate[]>([]);
  const counselingRecorderRef = useRef<MediaRecorder | null>(null);
  const counselingStreamRef = useRef<MediaStream | null>(null);
  const counselingChunksRef = useRef<BlobPart[]>([]);
  const classOrderRef = useRef<ClassCard[]>([]);

  const allStudents = useMemo(() => {
    const map = new Map<string, StudentCard>();
    for (const classRow of classes) {
      for (const student of classRow.students || []) {
        if (isPendingKeyCard(student)) continue;
        const key = student.student_person_id || student.student_user_id || student.id;
        const existing = map.get(key);
        map.set(key, existing ? mergeStudentCard(existing, student) : student);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);
  const bulkInviteRecipients = useMemo(() => parseBulkInviteRows(bulkInviteText), [bulkInviteText]);
  const mergeTargetStudent = useMemo(
    () => allStudents.find((student) => student.id === mergeTargetStudentId) || null,
    [allStudents, mergeTargetStudentId]
  );
  const mergeCandidates = useMemo(() => {
    if (!mergeSourceStudent) return [];
    const query = mergeSearch.trim().toLowerCase();
    return allStudents.filter((student) => {
      if (student.id === mergeSourceStudent.id) return false;
      return !query || studentDirectoryText(student).includes(query);
    });
  }, [allStudents, mergeSearch, mergeSourceStudent]);
  const mergePrimaryStudent = useMemo(() => mergePrimaryPreview(mergeSourceStudent, mergeTargetStudent), [mergeSourceStudent, mergeTargetStudent]);
  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedRoutineId) || routines[0] || null,
    [routines, selectedRoutineId]
  );
  const classRoutineStartDateTime = `${classForm.routine_date || todayInput()}T${classForm.routine_starts_at || "00:00"}`;
  const classRoutineSelectedWeekdays = classForm.routine_recurrence_weekdays.length
    ? classForm.routine_recurrence_weekdays
    : [defaultWeekdayFromDateTime(classRoutineStartDateTime)];
  const classRoutineSelectedMonthDay = Number(classForm.routine_recurrence_month_day) || defaultMonthDayFromDateTime(classRoutineStartDateTime);
  const classRoutineEndTimeOptions = useMemo(() => {
    const startMinutes = minutesFromTimeValue(classForm.routine_starts_at);
    return startMinutes === null ? CLASS_TIME_OPTIONS : CLASS_TIME_OPTIONS.filter((option) => option.minutes > startMinutes);
  }, [classForm.routine_starts_at]);
  const remainingStudentKeyCount = useMemo(() => classes.reduce((total, classRow) => total + (classRow.pending_key_count || 0), 0), [classes]);
  const requestedTab = searchParams.get("tab");

  useEffect(() => {
    if (!requestedTab) {
      setActiveTab("classes");
      return;
    }
    if (STUDENT_MANAGEMENT_TAB_KEYS.includes(requestedTab as TabKey)) {
      setActiveTab(requestedTab as TabKey);
    }
  }, [requestedTab]);

  useEffect(() => {
    classOrderRef.current = classes;
  }, [classes]);

  useEffect(() => {
    setPendingCounselingCandidates(readPendingCounselingCandidates());
    return () => {
      if (counselingRecorderRef.current && counselingRecorderRef.current.state !== "inactive") {
        counselingRecorderRef.current.stop();
      }
      counselingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!studentMergeMenu) return;
    const close = () => setStudentMergeMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [studentMergeMenu]);

  useEffect(() => {
    const syncWorkspace = () => {
      const stored = readStoredAuthProfile<AcademyProfile>();
      setAcademyId(resolveActiveManagementAcademyId(stored));
    };
    const handleWorkspaceChange = () => {
      syncWorkspace();
      void refresh();
      void loadRoutines({ force: true });
    };
    syncWorkspace();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
    };
  }, []);

  useEffect(() => {
    setKeyClassId((current) => (classes.some((classRow) => classRow.id === current) ? current : classes[0]?.id || ""));
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
      const problemSetRows = normalizeListResponse<ProblemSetListItem>(sets);
      const wrongRows = normalizeListResponse<WrongAnswer>(wrongs);
      const sessionRows = normalizeListResponse<PaperSessionSummary>(allSessions);
      const dashboardSessions = normalizeListResponse<PaperSessionSummary>(dashboard.recent_sessions);
      setClasses(dashboard.classes);
      setSessions(sessionRows.length ? sessionRows : dashboardSessions);
      setProblemSets(problemSetRows);
      setWrongAnswers(wrongRows);
      const nextSession = sessionRows[0] || dashboardSessions[0];
      if (!selectedSessionId && nextSession) setSelectedSessionId(nextSession.id);
    } finally {
      setLoading(false);
    }
  }

  function syncRoutineDrafts(items: RoutineAction[]) {
    setRoutineMessageDrafts((current) => {
      const next = { ...current };
      for (const routine of items) {
        for (const message of routine.messages || []) {
          next[message.id] = message.message_body;
        }
      }
      return next;
    });
  }

  function upsertRoutine(updated: RoutineAction) {
    setRoutines((current) => {
      const exists = current.some((routine) => routine.id === updated.id);
      return exists ? current.map((routine) => (routine.id === updated.id ? updated : routine)) : [updated, ...current];
    });
    syncRoutineDrafts([updated]);
    setSelectedRoutineId(updated.id);
  }

  async function loadRoutines(options: { force?: boolean } = {}) {
    if (routineLoading && !options.force) return;
    setRoutineLoading(true);
    try {
      const items = await listRoutineActions();
      setRoutines(items);
      syncRoutineDrafts(items);
      setSelectedRoutineId((current) => (current && items.some((routine) => routine.id === current) ? current : items[0]?.id || ""));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 제안을 불러오지 못했습니다."));
    } finally {
      setRoutineLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function regenerateRoutine(routine: RoutineAction) {
    setRoutineBusyId(routine.id);
    try {
      upsertRoutine(await refreshRoutineAi(routine.id));
      setMessage("AI가 루틴 문구를 다시 생성했습니다.");
    } catch (error) {
      setMessage(errorMessage(error, "AI 루틴 문구를 다시 생성하지 못했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function persistRoutineMessage(routine: RoutineAction, message: RoutineMessage, body?: string) {
    const nextBody = (body ?? routineMessageDrafts[message.id] ?? message.message_body).trim();
    if (!nextBody || nextBody === message.message_body) return;
    setRoutineBusyId(message.id);
    try {
      upsertRoutine(await updateRoutineMessage(routine.id, message.id, { message_body: nextBody }));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 메시지를 저장하지 못했습니다."));
      setRoutineMessageDrafts((current) => ({ ...current, [message.id]: message.message_body }));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function toggleRoutineMessage(routine: RoutineAction, message: RoutineMessage) {
    const nextStatus = message.status === "excluded" ? "pending" : "excluded";
    setRoutineBusyId(message.id);
    try {
      upsertRoutine(await updateRoutineMessage(routine.id, message.id, { status: nextStatus }));
    } catch (error) {
      setMessage(errorMessage(error, "루틴 메시지 상태를 바꾸지 못했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

  async function sendRoutine(routine: RoutineAction) {
    for (const message of routine.messages || []) {
      const draft = routineMessageDrafts[message.id];
      if (message.status !== "excluded" && draft !== undefined && draft.trim() && draft.trim() !== message.message_body) {
        await persistRoutineMessage(routine, message, draft);
      }
    }
    setRoutineBusyId(routine.id);
    try {
      const sent = await sendRoutineAction(routine.id);
      upsertRoutine(sent);
      setMessage(`${sent.sendable_count}건의 루틴 알림을 전송했습니다.`);
    } catch (error) {
      setMessage(errorMessage(error, "루틴 알림 전송에 실패했습니다."));
    } finally {
      setRoutineBusyId("");
    }
  }

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
    const next: Record<string, ProblemStatus> = {};
    for (const problem of sessionDetail.problems) next[problemStatusKey(problem)] = "correct";
    for (const result of student?.problem_results || []) {
      const problem = sessionDetail.problems.find((item) => item.problem_id === result.problem_id) || sessionDetail.problems.find((item) => item.problem_number === result.problem_number);
      next[problem ? problemStatusKey(problem) : String(result.problem_number)] = result.result_status;
    }
    setGridStatuses(next);
    setWrongInput(
      (student?.problem_results || [])
        .filter((item) => item.result_status === "wrong")
        .map((item) => {
          const problemIndex = sessionDetail.problems.findIndex((candidate) => candidate.problem_id === item.problem_id || candidate.problem_number === item.problem_number);
          const problem = problemIndex >= 0 ? sessionDetail.problems[problemIndex] : null;
          return problem ? String(sessionProblemDisplayNumber(problem, problemIndex, sessionDetail.session_type)) : String(item.problem_number);
        })
        .join(", ")
    );
  }, [sessionDetail, selectedStudentId]);

  function toggleClassRoutineWeekday(day: number) {
    setClassForm((current) => {
      const base = current.routine_recurrence_weekdays.length
        ? current.routine_recurrence_weekdays
        : [defaultWeekdayFromDateTime(`${current.routine_date || todayInput()}T${current.routine_starts_at || "00:00"}`)];
      return {
        ...current,
        routine_recurrence_weekdays: base.includes(day)
          ? base.filter((item) => item !== day)
          : [...base, day].sort((left, right) => left - right),
      };
    });
  }

  function updateClassRoutineStartTime(value: string) {
    setClassForm((current) => {
      const nextStartMinutes = minutesFromTimeValue(value);
      const currentStartMinutes = minutesFromTimeValue(current.routine_starts_at);
      const currentEndMinutes = minutesFromTimeValue(current.routine_ends_at);
      const durationMinutes = currentStartMinutes !== null && currentEndMinutes !== null && currentEndMinutes > currentStartMinutes ? currentEndMinutes - currentStartMinutes : 60;
      const nextEnd = nextStartMinutes !== null ? timeValueFromMinutes(nextStartMinutes + durationMinutes) : "";

      return {
        ...current,
        routine_starts_at: value,
        routine_ends_at: nextEnd,
      };
    });
  }

  function updateClassRoutineEndTime(value: string) {
    setClassForm((current) => ({ ...current, routine_ends_at: value }));
  }

  async function submitClass() {
    if (!classForm.name.trim()) return;
    setClassSaving(true);
    try {
      const submittedClassForm = classForm;
      const routineStartDateTime = submittedClassForm.routine_date && submittedClassForm.routine_starts_at ? `${submittedClassForm.routine_date}T${submittedClassForm.routine_starts_at}:00` : "";
      const routineEndOffset = routineStartDateTime && submittedClassForm.routine_ends_at
        ? new Date(`${submittedClassForm.routine_date}T${submittedClassForm.routine_ends_at}:00`).getTime() - new Date(routineStartDateTime).getTime()
        : null;
      const selectedWeekdays = classRoutineSelectedWeekdays;
      const selectedMonthDay = classRoutineSelectedMonthDay;
      const created = await createClass(submittedClassForm);
      setClasses((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setClassForm(emptyClassForm);
      setShowClassCreator(false);

      if (!routineStartDateTime) {
        setMessage("클래스를 만들었습니다.");
        await refresh().catch(() => undefined);
        return;
      }

      const starts = buildRecurringDateTimes(routineStartDateTime, {
        unit: submittedClassForm.routine_recurrence_unit,
        interval: Number(submittedClassForm.routine_recurrence_interval) || 1,
        weekdays: selectedWeekdays,
        monthDay: selectedMonthDay,
        until: submittedClassForm.routine_repeat_until || undefined,
        maxOccurrences: 160,
      });
      setMessage(`클래스를 만들었습니다. 일정 ${starts.length}개를 저장하는 중입니다.`);

      void (async () => {
        let scheduleCount = 0;
        const seriesId = starts.length > 1 ? `class-${created.id}-${Date.now()}` : null;
        for (const [index, startsAt] of starts.entries()) {
          const endsAt = routineEndOffset && routineEndOffset > 0
            ? localDateTimeInputValue(new Date(new Date(startsAt).getTime() + routineEndOffset))
            : null;
          await createScheduleEvent({
            class_id: created.id,
            title: created.name,
            description: created.description || null,
            event_type: "class",
            starts_at: startsAt,
            ends_at: endsAt,
            counts_for_tuition: true,
            series_id: seriesId,
            series_position: seriesId ? index + 1 : null,
            series_size: seriesId ? starts.length : null,
          });
          scheduleCount += 1;
        }
        setMessage(`클래스와 루틴 일정 ${scheduleCount}개를 만들었습니다.`);
        await refresh().catch(() => undefined);
      })().catch((error) => {
        setMessage(errorMessage(error, "클래스는 만들었지만 일정 저장에 실패했습니다. 클래스 상세에서 일정을 다시 추가해 주세요."));
        void refresh().catch(() => undefined);
      });
    } catch (error) {
      setMessage(errorMessage(error, "클래스 생성에 실패했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setClassSaving(false);
    }
  }

  async function copyStudentKey(student: StudentCard) {
    if (isPendingKeyCard(student)) {
      setMessage("아직 학생 계정과 연결되지 않은 활성 키입니다. 전체 키는 발급/회전 직후에만 복사할 수 있습니다.");
      return;
    }
    setCopyingStudentKeyId(student.id);
    try {
      const response = await ensureStudentInviteCode(student.id);
      const inviteCodes = response.invite_codes?.length
        ? response.invite_codes
        : [{ invite_code: response.invite_code, invite_code_preview: response.invite_code_preview, class_name: student.class_names[0] }];
      const copyText = inviteCodes
        .map((entry) => [entry.class_name || "클래스 미지정", entry.invite_code].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("\n");
      await navigator.clipboard.writeText(copyText || response.invite_code || "");
      setClasses((current) =>
        current.map((classRow) => ({
          ...classRow,
          students: classRow.students.map((item) =>
            item.id === student.id || (!!student.student_person_id && item.student_person_id === student.student_person_id) || item.student_user_id === student.student_user_id
              ? { ...item, invite_code: response.invite_code, invite_code_preview: response.invite_code_preview || item.invite_code_preview, invite_codes: response.invite_codes || item.invite_codes }
              : item
          ),
        }))
      );
      setMessage(`${student.name} 학생 키 ${inviteCodes.length}개를 복사했습니다.`);
    } catch (error) {
      setMessage(errorMessage(error, "학생 키를 복사하지 못했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setCopyingStudentKeyId("");
    }
  }

  async function loadKeyManager(id = academyId) {
    if (!id) return;
    setKeyManagerLoading(true);
    try {
      setKeySeats(await listAcademySeats(id));
    } catch (error) {
      setMessage(errorMessage(error, "학생 키 정보를 불러오지 못했습니다."));
    } finally {
      setKeyManagerLoading(false);
    }
  }

  async function loadStudentProfileSettings() {
    setProfileSettingsLoading(true);
    try {
      setStudentProfileSettings(await getStudentProfileCollectionSettings());
    } catch (error) {
      setMessage(errorMessage(error, "학생 정보 수집 설정을 불러오지 못했습니다."));
    } finally {
      setProfileSettingsLoading(false);
    }
  }

  function updateStudentProfileField(
    key: string,
    patch: Partial<StudentProfileCollectionSettings["fields"][number]>
  ) {
    setStudentProfileSettings((current) => ({
      fields: current.fields.map((field) => {
        if (field.key !== key) return field;
        const next = { ...field, ...patch };
        if (patch.enabled === false) {
          next.required = false;
          next.real_name = false;
        }
        return next;
      }),
    }));
  }

  async function saveStudentProfileSettings() {
    setProfileSettingsSaving(true);
    try {
      setStudentProfileSettings(await updateStudentProfileCollectionSettings(studentProfileSettings));
      setMessage("학생 정보 수집 설정을 저장했습니다.");
    } catch (error) {
      setMessage(errorMessage(error, "학생 정보 수집 설정을 저장하지 못했습니다."));
    } finally {
      setProfileSettingsSaving(false);
    }
  }

  function toggleKeyManager() {
    setShowKeyManager((current) => {
      const next = !current;
      if (next) {
        setShowClassCreator(false);
        void loadKeyManager();
        void loadStudentProfileSettings();
      }
      return next;
    });
  }

  async function issueClassKey() {
    if (!academyId || !keyClassId) return;
    setKeyManagerLoading(true);
    try {
      const created = await issueLearningStudentKeys(academyId, { count: 1, class_id: keyClassId });
      const codes = created.keys.map((seat) => seat.key_code || "").filter(Boolean);
      setNewKeyCodes(codes);
      setMessage(codes[0] ? `익명 좌석 키를 발급했습니다: ${codes[0]}` : "익명 좌석 키를 발급했습니다.");
      await Promise.all([loadKeyManager(), refresh().catch(() => undefined)]);
    } catch (error) {
      setMessage(errorMessage(error, "익명 좌석 키를 발급하지 못했습니다."));
    } finally {
      setKeyManagerLoading(false);
    }
  }

  async function issueBulkClassKeys() {
    if (!academyId || !keyClassId) return;
    const recipients = bulkInviteRecipients;
    const count = recipients.length || Math.max(1, Number(bulkKeyCount) || 1);
    setKeyManagerLoading(true);
    try {
      const created = await issueLearningStudentKeys(academyId, {
        count,
        class_id: keyClassId,
        delivery_channel: "manual",
        recipients: recipients.length ? recipients : undefined,
      });
      setBulkInviteResults(created.keys as BulkInviteResult[]);
      setNewKeyCodes(created.keys.map((seat) => seat.key_code || "").filter(Boolean));
      setMessage(`${created.keys.length}개의 익명 좌석 키를 만들었습니다. 생성 직후에만 전체 키를 복사할 수 있습니다.`);
      await Promise.all([loadKeyManager(), refresh().catch(() => undefined)]);
    } catch (error) {
      setMessage(errorMessage(error, "익명 좌석 키 대량 발급에 실패했습니다."));
    } finally {
      setKeyManagerLoading(false);
    }
  }

  async function copyBulkInviteResults() {
    if (!bulkInviteResults.length) return;
    const text = bulkInviteResults
      .map((seat) => {
        const meta = seat.invite_metadata || {};
        return [meta.recipient_name || seat.display_name || seat.seat_number, meta.recipient_phone || "", seat.key_code].filter(Boolean).join("\t");
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
    setMessage("생성된 익명 좌석 키 목록을 클립보드에 복사했습니다.");
  }

  function loadCounselingCandidatesIntoBulkInvite() {
    const lines = pendingCounselingCandidates.map(bulkInviteLineFromCandidate).filter(Boolean);
    setBulkInviteText(lines.join("\n"));
    setMessage(lines.length ? `상담 대기 후보 ${lines.length}명을 키 발급 메모로 불러왔습니다.` : "불러올 상담 대기 후보가 없습니다.");
  }

  async function copySeatKey(code: string) {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setMessage("익명 좌석 키를 복사했습니다.");
  }

  async function rotateSeatKey(seat: AcademySeat) {
    if (!academyId) return;
    setKeyBusySeatId(seat.id);
    try {
      const updated = await rotateAcademySeatCode(academyId, seat.id);
      const code = updated.invite_code || "";
      setNewKeyCodes(code ? [code] : []);
      setMessage(code ? `익명 좌석 키를 새로 만들었습니다: ${code}` : "익명 좌석 키를 새로 만들었습니다.");
      await loadKeyManager();
    } catch (error) {
      setMessage(errorMessage(error, "익명 좌석 키를 새로 만들지 못했습니다."));
    } finally {
      setKeyBusySeatId("");
    }
  }

  async function releaseKeySeat(seat: AcademySeat) {
    if (!academyId || !seat.assigned || !window.confirm("이 학생의 학원 접근 권한을 종료하고 좌석을 비울까요?")) return;
    setKeyBusySeatId(seat.id);
    try {
      const updated = await releaseAcademySeat(academyId, seat.id, "released_from_student_management");
      const code = updated.invite_code || "";
      setNewKeyCodes(code ? [code] : []);
      setMessage("좌석을 비웠습니다. 필요하면 새 키를 복사해서 전달하세요.");
      await loadKeyManager();
    } catch (error) {
      setMessage(errorMessage(error, "좌석을 비우지 못했습니다."));
    } finally {
      setKeyBusySeatId("");
    }
  }

  function openStudentMerge(student: StudentCard) {
    setStudentMergeMenu(null);
    setMergeSourceStudent(student);
    setMergeSearch("");
    setMergeTargetStudentId("");
  }

  function closeStudentMerge() {
    setMergeSourceStudent(null);
    setMergeSearch("");
    setMergeTargetStudentId("");
    setMergingStudent(false);
  }

  async function submitStudentMerge() {
    if (!mergeSourceStudent || !mergeTargetStudentId) return;
    setMergingStudent(true);
    try {
      const result = await mergeStudents(mergeSourceStudent.id, mergeTargetStudentId);
      const primary = result.primary_student;
      closeStudentMerge();
      setMessage(`${primary.name} 기준으로 학생을 통합했습니다.`);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "학생 통합에 실패했습니다. 잠시 후 다시 시도해주세요."));
      setMergingStudent(false);
    }
  }

  function startClassStudentAdd(classRow: ClassCard) {
    setAddingStudentClassId(classRow.id);
    setKeyClassId(classRow.id);
  }

  function cancelClassStudentAdd() {
    setAddingStudentClassId("");
    setClassStudentSavingId("");
  }

  async function issueClassKeyForClass(classRow: ClassCard) {
    if (!academyId) return;
    setClassStudentSavingId(classRow.id);
    try {
      const created = await issueLearningStudentKeys(academyId, { count: 1, class_id: classRow.id });
      const code = created.keys.map((seat) => seat.key_code || "").find(Boolean) || "";
      if (code) {
        await navigator.clipboard.writeText(code);
        setNewKeyCodes([code]);
      }
      setMessage(code ? classRow.name + " 익명 좌석 키를 발급하고 복사했습니다: " + code : classRow.name + " 익명 좌석 키를 발급했습니다.");
      await Promise.all([refresh(), loadKeyManager().catch(() => undefined)]);
    } catch (error) {
      setMessage(errorMessage(error, "익명 좌석 키를 발급하지 못했습니다. 잠시 후 다시 시도해주세요."));
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

  function toggleProblem(problem: SessionProblem) {
    const key = problemStatusKey(problem);
    setGridStatuses((current) => {
      const currentStatus = current[key] || "correct";
      const nextStatus = currentStatus === "correct" ? "wrong" : currentStatus === "wrong" ? "unanswered" : "correct";
      return { ...current, [key]: nextStatus };
    });
  }

  function applyWrongInput() {
    if (!sessionDetail) return;
    const tokens = wrongInput.split(/[\s,;/]+/).filter(Boolean);
    const flatProblemGrid = usesFlatProblemGrid(sessionDetail.session_type);
    const next: Record<string, ProblemStatus> = {};
    for (const [index, problem] of sessionDetail.problems.entries()) {
      const displayNumber = sessionProblemDisplayNumber(problem, index, sessionDetail.session_type);
      next[problemStatusKey(problem)] = tokens.some((token) => problemMatchesInput(problem, token, displayNumber, !flatProblemGrid)) ? "wrong" : "correct";
    }
    setGridStatuses(next);
  }

  function markAll(status: ProblemStatus) {
    if (!sessionDetail) return;
    const next: Record<string, ProblemStatus> = {};
    for (const problem of sessionDetail.problems) next[problemStatusKey(problem)] = status;
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
        result_status: gridStatuses[problemStatusKey(problem)] || "unmarked",
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

  function classStudentMembershipIds(classRow: ClassCard) {
    return new Set([...(classRow.student_membership_ids || []), ...classRow.students.filter((student) => !isPendingKeyCard(student)).map((student) => student.id)]);
  }

  function sessionBelongsToClass(session: PaperSessionSummary, classRow: ClassCard) {
    if (session.class_ids.includes(classRow.id)) return true;
    const studentIds = classStudentMembershipIds(classRow);
    return session.student_membership_ids.some((studentId) => studentIds.has(studentId));
  }

  function sessionsForClass(classRow: ClassCard) {
    const byId = new Map<string, PaperSessionSummary>();
    for (const session of [...(classRow.paper_sessions || []), ...sessions]) {
      if (sessionBelongsToClass(session, classRow)) byId.set(session.id, session);
    }
    return Array.from(byId.values()).sort((left, right) => {
      const leftDate = left.scheduled_at || left.created_at || "";
      const rightDate = right.scheduled_at || right.created_at || "";
      return rightDate.localeCompare(leftDate) || right.title.localeCompare(left.title);
    });
  }

  function classSessionCount(classRow: ClassCard) {
    return sessionsForClass(classRow).length;
  }

  async function loadClassStats(classId: string) {
    const classRow = classes.find((row) => row.id === classId);
    const targetSessions = classRow ? sessionsForClass(classRow) : sessions.filter((session) => session.class_ids.includes(classId));
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

  function moveClassRow(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return;
    setClasses((current) => {
      const sourceIndex = current.findIndex((classRow) => classRow.id === sourceId);
      const targetIndex = current.findIndex((classRow) => classRow.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      classOrderRef.current = next;
      return next;
    });
  }

  async function persistClassOrder() {
    const orderedIds = classOrderRef.current.map((classRow) => classRow.id);
    if (!orderedIds.length) return;
    try {
      const ordered = await updateClassOrder(orderedIds);
      setClasses(ordered);
    } catch (error) {
      setMessage(errorMessage(error, "클래스 순서를 저장하지 못했습니다."));
      await refresh().catch(() => undefined);
    }
  }

  async function removeClassRow(classRow: ClassCard) {
    if (deletingClassId) return;
    const ok = window.confirm(`${classRow.name} 클래스를 삭제할까요? 연결된 일정과 학생 배정도 함께 정리될 수 있습니다.`);
    if (!ok) return;
    setDeletingClassId(classRow.id);
    try {
      await deleteClass(classRow.id);
      setClasses((current) => {
        const next = current.filter((item) => item.id !== classRow.id);
        classOrderRef.current = next;
        return next;
      });
      setStatsOpen((current) => {
        const { [classRow.id]: _removed, ...next } = current;
        return next;
      });
      setClassStatsDetails((current) => {
        const { [classRow.id]: _removed, ...next } = current;
        return next;
      });
      setClassStatsLoading((current) => {
        const { [classRow.id]: _removed, ...next } = current;
        return next;
      });
      if (addingStudentClassId === classRow.id) setAddingStudentClassId("");
      if (keyClassId === classRow.id) setKeyClassId("");
      if (draggingClassId === classRow.id) setDraggingClassId("");
      setMessage(`${classRow.name} 클래스를 삭제했습니다.`);
    } catch (error) {
      setMessage(errorMessage(error, "클래스를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요."));
      await refresh().catch(() => undefined);
    } finally {
      setDeletingClassId("");
    }
  }

  function resetCounselingDraft(options: { keepTranscript?: boolean } = {}) {
    setCounselingPreview(null);
    setCounselingAudioBlob(null);
    if (!options.keepTranscript) setCounselingTranscript("");
    setCounselingTitle(counselingMode === "new" ? "신입 상담" : "학습 상담");
    setCounselingDate(todayInput());
    setCounselingClassId("");
  }

  function switchCounselingMode(mode: CounselingMode) {
    setCounselingMode(mode);
    setCounselingTitle(mode === "new" ? "신입 상담" : "학습 상담");
    setCounselingPreview(null);
    setCounselingClassId("");
  }

  async function startCounselingRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("이 브라우저에서는 상담 녹음을 시작할 수 없습니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      counselingChunksRef.current = [];
      counselingStreamRef.current = stream;
      counselingRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) counselingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(counselingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setCounselingAudioBlob(blob.size > 0 ? blob : null);
        setCounselingRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        counselingStreamRef.current = null;
        counselingRecorderRef.current = null;
      };
      setCounselingAudioBlob(null);
      setCounselingRecording(true);
      recorder.start();
    } catch (error) {
      setMessage(errorMessage(error, "마이크 권한을 확인해 주세요."));
    }
  }

  function stopCounselingRecording() {
    const recorder = counselingRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function transcribeCounselingRecording() {
    if (!counselingAudioBlob) {
      setMessage("먼저 상담 녹음을 완료해 주세요.");
      return;
    }
    setCounselingBusy("transcribing");
    try {
      const result = await transcribeCounselingAudio(counselingAudioBlob);
      setCounselingTranscript((current) => [current.trim(), result.text].filter(Boolean).join("\n\n"));
      setMessage("상담 녹음을 전사했습니다. 필요한 경우 내용을 다듬은 뒤 AI 추출을 실행하세요.");
    } catch (error) {
      setMessage(errorMessage(error, "상담 녹음을 전사하지 못했습니다."));
    } finally {
      setCounselingBusy("");
    }
  }

  async function analyzeCounselingTranscript() {
    const transcript = counselingTranscript.trim();
    if (!transcript) {
      setMessage("전사 텍스트나 상담 메모를 먼저 입력해 주세요.");
      return;
    }
    const student = allStudents.find((item) => item.id === counselingStudentId) || null;
    if (counselingMode === "existing" && !student) {
      setMessage("기존 학생 상담은 학생을 먼저 선택해야 합니다.");
      return;
    }
    setCounselingBusy("analyzing");
    try {
      const preview = await previewCounselingIntake({
        mode: counselingMode,
        transcript,
        student_id: counselingMode === "existing" ? student?.id || null : null,
        student_name: student?.name || null,
      });
      setCounselingPreview(preview);
      setCounselingTitle(preview.title || (counselingMode === "new" ? "신입 상담" : "학습 상담"));
      setMessage(counselingMode === "new" ? "신입 상담 정보를 대기 후보로 저장할 수 있게 정리했습니다." : "기존 학생 상담 기록으로 저장할 내용을 정리했습니다.");
    } catch (error) {
      setMessage(errorMessage(error, "상담 내용을 AI로 정리하지 못했습니다."));
    } finally {
      setCounselingBusy("");
    }
  }

  function updateCounselingProfile(field: keyof CounselingIntakePreview["student_profile"], value: string) {
    setCounselingPreview((current) =>
      current
        ? {
            ...current,
            student_profile: { ...current.student_profile, [field]: value },
          }
        : current
    );
  }

  function updateCounselingSection(fieldId: string, value: string) {
    setCounselingPreview((current) =>
      current
        ? {
            ...current,
            sections: current.sections.map((section) => (section.field_id === fieldId ? { ...section, value } : section)),
          }
        : current
    );
  }

  function counselingSectionValue(fieldId: string) {
    return counselingPreview?.sections.find((section) => section.field_id === fieldId)?.value || "";
  }

  function savePendingCounselingCandidate() {
    if (!counselingPreview) {
      setMessage("먼저 상담 내용을 AI로 정리해 주세요.");
      return;
    }
    const next: PendingCounselingCandidate = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      created_at: new Date().toISOString(),
      title: counselingTitle.trim() || counselingPreview.title || "신입 상담",
      transcript: counselingTranscript.trim(),
      summary: counselingPreview.summary,
      profile: counselingPreview.student_profile,
      sections: counselingPreview.sections,
    };
    const items = [next, ...pendingCounselingCandidates].slice(0, 20);
    setPendingCounselingCandidates(items);
    writePendingCounselingCandidates(items);
    resetCounselingDraft();
    setMessage("신입 상담 후보를 대기 상태로 저장했습니다. 등록이 확정되면 익명 좌석 키를 발급해 연결할 수 있습니다.");
  }

  async function saveExistingCounselingLog() {
    const student = allStudents.find((item) => item.id === counselingStudentId) || null;
    if (!student || !counselingPreview) {
      setMessage("학생을 선택하고 상담 내용을 AI로 정리해 주세요.");
      return;
    }
    setCounselingBusy("saving");
    try {
      await createCounselingLog(student.id, {
        counseling_date: counselingDate,
        title: counselingTitle.trim() || counselingPreview.title || "학습 상담",
        class_id: counselingClassId || null,
        notes: counselingSectionValue("notes") || counselingPreview.summary || counselingTranscript,
        weekly_report: counselingSectionValue("weekly_report"),
        next_plan: counselingSectionValue("next_plan"),
        sections: counselingPreview.sections,
      });
      resetCounselingDraft();
      setMessage(`${student.name} 학생 상담 기록에 저장했습니다.`);
    } catch (error) {
      setMessage(errorMessage(error, "상담 기록 저장에 실패했습니다."));
    } finally {
      setCounselingBusy("");
    }
  }

  const selectedStudent = sessionDetail?.students.find((student) => student.id === selectedStudentId);
  const selectedCounselingStudent = allStudents.find((student) => student.id === counselingStudentId) || null;
  const counselingClassOptions = selectedCounselingStudent
    ? classes.filter((classRow) => selectedCounselingStudent.class_ids.includes(classRow.id))
    : classes;
  const activeStudentCount = allStudents.filter(
    (student) => student.status === "active" || student.status_chip === "Active" || student.status_chip === "active"
  ).length;
  const scoredStudentCount = allStudents.filter((student) => typeof student.recent_score === "number").length;
  const unresolvedStudentWrongs = allStudents.reduce((total, student) => total + student.unresolved_wrong_count, 0);
  return (
    <main className="min-h-screen bg-transparent px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {message ? (
          <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm text-zinc-800">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage("")} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950">
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

        {!loading && activeTab === "routine" ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-950">루틴</h2>
                  <p className="mt-1 text-sm text-zinc-500">AI가 오늘 처리할 전송 후보를 모아 제안합니다.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => loadRoutines({ force: true })} disabled={routineLoading}>
                  {routineLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  새로고침
                </Button>
              </div>
              {routineLoading && !routines.length ? (
                <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white text-sm text-zinc-500 shadow-sm shadow-zinc-950/5">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  루틴 제안을 불러오는 중입니다.
                </div>
              ) : null}
              {!routineLoading && !routines.length ? (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm shadow-zinc-950/5">지금 검토할 루틴 제안이 없습니다.</div>
              ) : null}
              {routines.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => setSelectedRoutineId(routine.id)}
                  className={cn(
                    "w-full rounded-lg bg-white p-4 text-left shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200 transition",
                    selectedRoutine?.id === routine.id ? "bg-zinc-100 ring-zinc-400" : "hover:bg-zinc-50 hover:ring-zinc-300"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn("border", routineStatusTone(routine.status))}>{routineStatusLabel(routine.status)}</Badge>
                        <span className="text-xs font-semibold text-zinc-500">{routineTypeLabel(routine.routine_type)}</span>
                      </div>
                      <p className="mt-2 truncate text-base font-black text-zinc-950">{routine.title}</p>
                    </div>
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200">{routine.sendable_count}/{routine.message_count}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">{routine.summary || "AI 제안 요약이 없습니다."}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{routineChannelLabel(routine.channel)}</span>
                    <span>{formatDate(routine.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-lg bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
              {selectedRoutine ? (
                <div className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn("border", routineStatusTone(selectedRoutine.status))}>{routineStatusLabel(selectedRoutine.status)}</Badge>
                        <Badge variant="outline">{routineChannelLabel(selectedRoutine.channel)}</Badge>
                      </div>
                      <h3 className="mt-3 text-xl font-black text-zinc-950">{selectedRoutine.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">{selectedRoutine.summary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => regenerateRoutine(selectedRoutine)} disabled={routineBusyId === selectedRoutine.id || selectedRoutine.status === "sent"}>
                        {routineBusyId === selectedRoutine.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        다시 생성
                      </Button>
                      <Button type="button" size="sm" onClick={() => sendRoutine(selectedRoutine)} disabled={routineBusyId === selectedRoutine.id || selectedRoutine.status === "sent" || !selectedRoutine.sendable_count}>
                        {routineBusyId === selectedRoutine.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        일괄 전송
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedRoutine.messages.map((message) => {
                      const excluded = message.status === "excluded";
                      return (
                        <div key={message.id} className={cn("rounded-lg p-3 ring-1", excluded ? "bg-zinc-100 opacity-70 ring-zinc-200" : "bg-zinc-50 ring-zinc-200")}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-zinc-950">{message.student_name}</p>
                              <p className="text-xs text-zinc-500">{message.class_name || "클래스 없음"} · {message.delivery_status === "sent" ? "전송됨" : excluded ? "제외됨" : "대기"}</p>
                            </div>
                            <Button type="button" size="sm" variant="outline" onClick={() => toggleRoutineMessage(selectedRoutine, message)} disabled={routineBusyId === message.id || selectedRoutine.status === "sent"}>
                              {excluded ? "포함" : "제외"}
                            </Button>
                          </div>
                          <textarea
                            className="min-h-28 w-full rounded-md border-0 bg-white p-3 text-sm leading-6 text-zinc-950 shadow-sm shadow-zinc-950/5 outline-none placeholder:text-zinc-500 ring-1 ring-zinc-200 focus:ring-2 focus:ring-black/10 disabled:bg-zinc-100 disabled:text-zinc-500"
                            value={routineMessageDrafts[message.id] ?? message.message_body}
                            onChange={(event) => setRoutineMessageDrafts((current) => ({ ...current, [message.id]: event.target.value }))}
                            onBlur={() => persistRoutineMessage(selectedRoutine, message)}
                            disabled={excluded || selectedRoutine.status === "sent"}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-zinc-500">왼쪽에서 루틴 제안을 선택하세요.</div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "classes" ? (
          <section className="space-y-3">
            {!showKeyManager && !showClassCreator ? (
              <div className="grid grid-cols-2 gap-2 sm:hidden">
                <Button type="button" variant="outline" onClick={toggleKeyManager} className="h-11 rounded-lg bg-white">
                  <KeyRound className="h-4 w-4" />
                  학생 키
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowKeyManager(false);
                    setShowClassCreator(true);
                  }}
                  className="h-11 rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                  클래스 만들기
                </Button>
              </div>
            ) : null}
            {classes.map((classRow) => (
              <Card
                key={classRow.id}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  moveClassRow(draggingClassId, classRow.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDraggingClassId("");
                }}
                className={cn(
                  "overflow-visible rounded-lg border-0 bg-white shadow-none transition",
                  draggingClassId === classRow.id && "bg-zinc-100"
                )}
              >
                <CardContent className="p-0">
                  <div className="grid min-h-0 grid-cols-[22px_minmax(0,1fr)] lg:min-h-[168px] lg:grid-cols-[28px_180px_minmax(0,1fr)]">
                    <button
                      type="button"
                      draggable
                      aria-label={`${classRow.name} 순서 이동`}
                      title={`${classRow.name} 순서 이동`}
                      onDragStart={(event) => {
                        setDraggingClassId(classRow.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", classRow.id);
                      }}
                      onDragEnd={() => {
                        setDraggingClassId("");
                        void persistClassOrder();
                      }}
                      className={cn(
                        "row-span-2 flex h-full min-h-[112px] cursor-grab items-center justify-center bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 active:cursor-grabbing lg:row-span-1 lg:min-h-[168px]",
                        draggingClassId === classRow.id && "text-zinc-950"
                      )}
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>
                    <aside className="flex items-center justify-between gap-2 bg-zinc-50 px-3 py-2 lg:flex-col lg:items-stretch lg:gap-4 lg:p-4">
                      <div>
                        <p className="text-lg font-black tracking-normal text-zinc-950 lg:text-3xl">{classRow.name}</p>
                        <p className="mt-0.5 text-sm font-black text-zinc-800 lg:mt-2 lg:text-2xl">{classRow.student_count}</p>
                        <p className="text-[11px] text-zinc-500 lg:text-xs">
                          학생{classRow.pending_key_count ? ` · 대기 ${classRow.pending_key_count}` : ""}
                        </p>
                        <p className="mt-1 max-w-[150px] truncate text-[11px] text-zinc-500 lg:mt-3 lg:max-w-none lg:text-xs">{[classRow.subject, classRow.grade_level].filter(Boolean).join(" · ") || classRow.description || "클래스 정보 없음"}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5 lg:gap-2">
                        <button
                          type="button"
                          aria-label={`${classRow.name} 통계`}
                          title={`${classRow.name} 통계`}
                          onClick={() => toggleClassStats(classRow)}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md border transition lg:h-10 lg:w-10",
                            statsOpen[classRow.id] ? "border-black bg-black text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950"
                          )}
                        >
                          <BarChart3 className="h-4 w-4 lg:h-5 lg:w-5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${classRow.name} 익명 자리 만들기`}
                          title={`${classRow.name} 익명 자리 만들기`}
                          onClick={() => startClassStudentAdd(classRow)}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md border transition lg:h-10 lg:w-10",
                            addingStudentClassId === classRow.id ? "border-black bg-black text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950"
                          )}
                        >
                          <UserPlus className="h-4 w-4 lg:h-5 lg:w-5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${classRow.name} 클래스 삭제`}
                          title={`${classRow.name} 클래스 삭제`}
                          onClick={() => void removeClassRow(classRow)}
                          disabled={Boolean(deletingClassId)}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-55 lg:h-10 lg:w-10",
                            deletingClassId === classRow.id
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-zinc-200 bg-white text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          )}
                        >
                          {deletingClassId === classRow.id ? <Loader2 className="h-4 w-4 animate-spin lg:h-5 lg:w-5" /> : <Trash2 className="h-4 w-4 lg:h-5 lg:w-5" />}
                        </button>
                      </div>
                    </aside>
                    <div className="col-start-2 flex min-w-0 flex-col gap-2 p-2.5 lg:col-start-auto lg:gap-3 lg:p-4">
                      {addingStudentClassId === classRow.id ? (
                        <div className="rounded-lg bg-white p-3 shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-100">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-zinc-950">익명 자리 만들기</p>
                              <p className="mt-1 text-xs leading-5 text-zinc-500">이 클래스에 비어 있는 좌석을 만들고, 생성된 키를 학생에게 따로 전달하세요. 학생이 Tena Note에서 키를 입력하면 본인 계정과 연결됩니다.</p>
                            </div>
                            <button type="button" onClick={cancelClassStudentAdd} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950" aria-label="학생 연결 패널 닫기">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => issueClassKeyForClass(classRow)} disabled={classStudentSavingId === classRow.id || !academyId}>
                              {classStudentSavingId === classRow.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                              익명 키 발급 후 복사
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowClassCreator(false);
                                setShowKeyManager(true);
                                setKeyClassId(classRow.id);
                                void loadKeyManager();
                                void loadStudentProfileSettings();
                              }}
                            >
                              키 목록 보기
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {classRow.students.length ? (
                        <div className="flex min-h-[92px] flex-1 flex-col items-stretch gap-2 pb-1 lg:min-h-[136px] lg:flex-row lg:gap-3 lg:overflow-x-auto lg:[scrollbar-color:#d4d4d8_transparent] lg:[scrollbar-width:thin]">
                          {classRow.students.map((student) => (
                            <ClassStudentCard
                              key={student.id}
                              student={student}
                              onMergeContext={(event, selectedStudent) =>
                                setStudentMergeMenu({
                                  student: selectedStudent,
                                  classId: classRow.id,
                                  x: Math.min(event.clientX, window.innerWidth - 180),
                                  y: Math.min(event.clientY, window.innerHeight - 96),
                                })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <button type="button" onClick={() => startClassStudentAdd(classRow)} className="flex h-full min-h-[84px] w-full items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-white text-sm font-semibold text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 lg:min-h-[116px]">
                          익명 자리 만들기
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
              <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">아직 클래스가 없습니다. 오른쪽 아래 + 버튼으로 클래스를 만들 수 있습니다.</div>
            ) : null}
          </section>
        ) : null}

        {!loading && activeTab === "students" ? (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["전체 학생", allStudents.length],
                ["활성 학생", activeStudentCount],
                ["미해결 오답", unresolvedStudentWrongs],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white p-4">
                  <p className="text-xs font-semibold text-zinc-500">{label}</p>
                  <p className="mt-2 text-2xl font-black text-zinc-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 rounded-lg bg-white">
                <div className="flex flex-col gap-1 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-black text-zinc-950">학생 목록</h2>
                    <p className="mt-1 text-xs text-zinc-500">최근 점수 입력 {scoredStudentCount}명</p>
                  </div>
                  <span className="text-xs font-semibold text-zinc-500">{allStudents.length}명</span>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {allStudents.map((student) => (
                    <StudentDirectoryCard
                      key={student.id}
                      student={student}
                      copying={copyingStudentKeyId === student.id}
                      onCopyKey={copyStudentKey}
                    />
                  ))}
                  {!allStudents.length ? (
                    <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 sm:col-span-2 2xl:col-span-3">
                      아직 등록된 학생이 없습니다.
                    </div>
                  ) : null}
                </div>
              </section>
              <aside className="space-y-4 rounded-lg bg-white p-4">
                <div>
                  <h2 className="text-sm font-black text-zinc-950">익명 좌석 키</h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    학생은 학원에서 받은 키를 Tena Note에 입력하고, 학원이 요구한 개인정보만 본인 계정 정보로 채웁니다.
                  </p>
                </div>
                <div className="space-y-2">
                  <Select value={keyClassId} onChange={(event) => setKeyClassId(event.target.value)}>
                    <option value="">익명 키를 발급할 클래스 선택</option>
                    {classes.map((classRow) => (
                      <option key={classRow.id} value={classRow.id}>{classRow.name}</option>
                    ))}
                  </Select>
                  <Button type="button" className="w-full" onClick={issueClassKey} disabled={!academyId || !keyClassId || keyManagerLoading || !classes.length}>
                    <KeyRound className="h-4 w-4" />
                    익명 키 발급
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowClassCreator(false);
                      setShowKeyManager(true);
                      void loadKeyManager();
                      void loadStudentProfileSettings();
                    }}
                  >
                    키/필수 정보 설정 열기
                  </Button>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-500">
                  이름, 학교, 학년, 보호자 연락처 같은 항목은 설정에서 켜거나 필수값으로 지정할 수 있습니다. 학생이 초대 링크를 수락하면 해당 정보가 학생 카드에 자동 반영됩니다.
                </div>
              </aside>
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "counseling" ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <div className="rounded-lg bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-zinc-950">상담</h2>
                    <p className="mt-1 text-sm text-zinc-500">상담 녹음을 전사하고, AI가 필요한 학생 정보와 상담 기록만 정리합니다.</p>
                  </div>
                  <div className="inline-flex shrink-0 rounded-md bg-zinc-100 p-1">
                    {[
                      ["new", "신입 상담"] as const,
                      ["existing", "기존 학생"] as const,
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => switchCounselingMode(mode)}
                        className={cn(
                          "h-9 rounded px-3 text-sm font-black transition",
                          counselingMode === mode ? "bg-black text-white" : "text-zinc-500 hover:bg-white hover:text-zinc-950"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <section className="rounded-lg bg-white p-4">
                  <h3 className="text-sm font-black text-zinc-950">녹음</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">마이크로 상담을 녹음한 뒤 AI 전사를 실행합니다.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button type="button" onClick={startCounselingRecording} disabled={counselingRecording || Boolean(counselingBusy)} className="h-11">
                      <Mic className="h-4 w-4" />
                      시작
                    </Button>
                    <Button type="button" variant="outline" onClick={stopCounselingRecording} disabled={!counselingRecording} className="h-11">
                      <Square className="h-4 w-4" />
                      중지
                    </Button>
                  </div>
                  <div className="mt-3 rounded-md bg-zinc-100 p-3 text-xs font-semibold text-zinc-600">
                    {counselingRecording
                      ? "녹음 중입니다."
                      : counselingAudioBlob
                        ? `녹음 완료 · ${Math.max(1, Math.round(counselingAudioBlob.size / 1024))}KB`
                        : "녹음 대기"}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={transcribeCounselingRecording}
                    disabled={!counselingAudioBlob || counselingBusy === "transcribing"}
                    className="mt-3 w-full"
                  >
                    {counselingBusy === "transcribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    AI 전사
                  </Button>
                </section>

                <section className="rounded-lg bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                    <Input value={counselingTitle} onChange={(event) => setCounselingTitle(event.target.value)} placeholder="상담 제목" />
                    <Input type="date" value={counselingDate} onChange={(event) => setCounselingDate(event.target.value)} />
                  </div>
                  {counselingMode === "existing" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Select value={counselingStudentId} onChange={(event) => { setCounselingStudentId(event.target.value); setCounselingClassId(""); setCounselingPreview(null); }}>
                        <option value="">학생 선택</option>
                        {allStudents.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name} · {studentMetaText(student)}
                          </option>
                        ))}
                      </Select>
                      <Select value={counselingClassId} onChange={(event) => setCounselingClassId(event.target.value)} disabled={!selectedCounselingStudent}>
                        <option value="">클래스 선택 안 함</option>
                        {counselingClassOptions.map((classRow) => (
                          <option key={classRow.id} value={classRow.id}>{classRow.name}</option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  <textarea
                    className="mt-3 min-h-[260px] w-full rounded-md border-0 bg-zinc-100 p-3 text-sm leading-6 text-zinc-950 outline-none placeholder:text-zinc-500 ring-1 ring-zinc-200 focus:ring-2 focus:ring-black/10"
                    value={counselingTranscript}
                    onChange={(event) => {
                      setCounselingTranscript(event.target.value);
                      setCounselingPreview(null);
                    }}
                    placeholder="녹음 전사 내용이 여기에 들어옵니다. 직접 메모를 입력해도 AI가 학생 정보와 상담 기록을 정리합니다."
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" onClick={analyzeCounselingTranscript} disabled={counselingBusy === "analyzing" || !counselingTranscript.trim()}>
                      {counselingBusy === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      AI 정보 추출
                    </Button>
                    <Button type="button" variant="outline" onClick={() => resetCounselingDraft()}>
                      초기화
                    </Button>
                  </div>
                </section>
              </div>

              {counselingPreview ? (
                <section className="rounded-lg bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-black text-zinc-950">AI 정리 결과</h3>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">{counselingPreview.summary || "요약 없음"}</p>
                    </div>
                    {counselingMode === "new" ? (
                      <Button type="button" onClick={savePendingCounselingCandidate} disabled={counselingBusy === "saving"}>
                        <Save className="h-4 w-4" />
                        대기 저장
                      </Button>
                    ) : (
                      <Button type="button" onClick={saveExistingCounselingLog} disabled={counselingBusy === "saving" || !selectedCounselingStudent}>
                        {counselingBusy === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        상담 기록 저장
                      </Button>
                    )}
                  </div>

                  {counselingMode === "new" ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {[
                        ["name", "학생 이름"],
                        ["school", "학교"],
                        ["grade_level", "학년"],
                        ["guardian_name", "보호자 이름"],
                        ["guardian_phone", "보호자 연락처"],
                        ["recommended_class", "추천 클래스"],
                      ].map(([field, label]) => (
                        <label key={field} className="text-xs font-bold text-zinc-500">
                          {label}
                          <Input
                            className="mt-1"
                            value={counselingPreview.student_profile[field as keyof CounselingIntakePreview["student_profile"]] || ""}
                            onChange={(event) => updateCounselingProfile(field as keyof CounselingIntakePreview["student_profile"], event.target.value)}
                          />
                        </label>
                      ))}
                      <label className="text-xs font-bold text-zinc-500 md:col-span-2">
                        메모
                        <textarea
                          className="mt-1 min-h-24 w-full rounded-md border-0 bg-zinc-100 p-3 text-sm leading-6 text-zinc-950 outline-none ring-1 ring-zinc-200 focus:ring-2 focus:ring-black/10"
                          value={counselingPreview.student_profile.memo || ""}
                          onChange={(event) => updateCounselingProfile("memo", event.target.value)}
                        />
                      </label>
                      <label className="text-xs font-bold text-zinc-500 md:col-span-2">
                        대기 사유
                        <Input
                          className="mt-1"
                          value={counselingPreview.student_profile.pending_reason || ""}
                          onChange={(event) => updateCounselingProfile("pending_reason", event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {counselingPreview.sections.map((section) => (
                      <label key={section.field_id} className="text-xs font-bold text-zinc-500">
                        {section.label}
                        <textarea
                          className="mt-1 min-h-32 w-full rounded-md border-0 bg-zinc-100 p-3 text-sm leading-6 text-zinc-950 outline-none ring-1 ring-zinc-200 focus:ring-2 focus:ring-black/10"
                          value={section.value || ""}
                          onChange={(event) => updateCounselingSection(section.field_id, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg bg-white p-4">
                <h3 className="text-sm font-black text-zinc-950">신입 상담 대기</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">등록이 확정되기 전까지 학생 키와 연결하지 않고 후보로 보관합니다.</p>
                <div className="mt-3 space-y-2">
                  {pendingCounselingCandidates.map((candidate) => (
                    <article key={candidate.id} className="rounded-md bg-zinc-100 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-zinc-950">{candidate.profile.name || candidate.title}</p>
                          <p className="mt-1 truncate text-xs text-zinc-500">{[candidate.profile.school, candidate.profile.grade_level, candidate.profile.recommended_class].filter(Boolean).join(" · ") || "정보 확인 대기"}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded p-1 text-zinc-400 hover:bg-white hover:text-zinc-950"
                          onClick={() => {
                            const items = pendingCounselingCandidates.filter((item) => item.id !== candidate.id);
                            setPendingCounselingCandidates(items);
                            writePendingCounselingCandidates(items);
                          }}
                          aria-label="대기 후보 삭제"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-600">{candidate.summary || candidate.profile.memo}</p>
                    </article>
                  ))}
                  {!pendingCounselingCandidates.length ? (
                    <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">대기 중인 신입 상담 후보가 없습니다.</div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-lg bg-white p-4">
                <h3 className="text-sm font-black text-zinc-950">저장 흐름</h3>
                <div className="mt-3 space-y-2 text-sm text-zinc-600">
                  <p className="rounded-md bg-zinc-100 px-3 py-2">1. 상담 녹음 시작 후 중지</p>
                  <p className="rounded-md bg-zinc-100 px-3 py-2">2. AI 전사로 텍스트 생성</p>
                  <p className="rounded-md bg-zinc-100 px-3 py-2">3. AI 정보 추출로 필요한 항목만 정리</p>
                  <p className="rounded-md bg-zinc-100 px-3 py-2">4. 신입은 대기 저장, 기존 학생은 상담 기록 저장</p>
                </div>
              </section>
            </aside>
          </section>
        ) : null}

        {!loading && activeTab === "sessions" ? (
          <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
              <CardHeader>
                <CardTitle className="text-zinc-950">문제 세트 배정</CardTitle>
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
                <div className="rounded-lg bg-zinc-100 p-3 ring-1 ring-zinc-200">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">개별 학생 추가 선택</p>
                  <div className="mt-2 grid max-h-36 gap-1 overflow-auto pr-1">
                    {allStudents.map((student) => {
                      const checked = sessionStudentIds.includes(student.id);
                      return (
                        <label key={student.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-white">
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
                    {!allStudents.length ? <p className="text-sm text-zinc-500">먼저 학생이 학원 키를 등록해야 합니다.</p> : null}
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
                <Button className="w-full" onClick={submitSession}>세션 만들기</Button>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {sessions.map((session) => (
                <button key={session.id} type="button" onClick={() => { setSelectedSessionId(session.id); setActiveTab("grading"); }} className="w-full rounded-lg bg-white p-4 text-left shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200 transition hover:bg-zinc-50 hover:ring-zinc-300">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-zinc-950">{session.title}</p>
                      <p className="mt-1 text-sm text-zinc-500">{formatDate(session.scheduled_at)} · {sessionTypeLabel(session.session_type)} · {session.problem_count}문항</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("border", statusTone(session.status))}>{statusLabel(session.status)}</Badge>
                      <span className="text-sm text-zinc-500">{session.graded_count}/{session.assigned_count} 채점</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && activeTab === "grading" ? (
          <section className="grid min-h-[620px] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
              <CardHeader>
                <CardTitle className="text-zinc-950">채점할 세션</CardTitle>
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
                        selectedStudentId === student.id ? "border-zinc-400 bg-zinc-100 text-zinc-950 shadow-sm shadow-zinc-950/5" : "border-zinc-200 bg-zinc-50 text-zinc-950 hover:border-zinc-300 hover:bg-white"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-950">{student.name}</span>
                        <Badge className={cn("border", statusTone(student.result.status))}>{statusLabel(student.result.status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{student.result.correct_count}/{student.result.total_count || sessionDetail.problem_count} 정답</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
              <CardHeader className="border-b border-zinc-200">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-zinc-950">{sessionDetail?.title || "세션을 선택하세요"}</CardTitle>
                    {selectedStudent ? <p className="mt-1 text-sm text-zinc-500">{`${selectedStudent.name} · ${sessionDetail?.problem_count || 0}문항`}</p> : null}
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
                  <Input placeholder={usesFlatProblemGrid(sessionDetail?.session_type) ? "틀린 번호만 입력: 3, 7, 12" : "틀린 교재 번호: 3, 7 또는 p8-12"} value={wrongInput} onChange={(event) => setWrongInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyWrongInput(); }} />
                  <Button variant="outline" onClick={applyWrongInput}>틀린 번호 적용</Button>
                </div>
                {sessionDetail && selectedStudent ? (
                  usesFlatProblemGrid(sessionDetail.session_type) ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,2.5rem))] gap-1.5">
                      {sessionDetail.problems.map((problem, index) => (
                        <ProblemCell
                          key={problem.problem_id}
                          label={String(sessionProblemDisplayNumber(problem, index, sessionDetail.session_type))}
                          metadata={problemMetadataLabel(problem)}
                          status={gridStatuses[problemStatusKey(problem)] || "correct"}
                          onClick={() => toggleProblem(problem)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg bg-zinc-50 ring-1 ring-zinc-200">
                      {(() => {
                        const collapsed = collapsedTextbookGrids[sessionDetail.id] || false;
                        const groups = groupProblemsByPage(sessionDetail.problems);
                        return (
                          <>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 py-2 text-left transition hover:bg-zinc-50"
                              onClick={() => setCollapsedTextbookGrids((current) => ({ ...current, [sessionDetail.id]: !collapsed }))}
                            >
                            <span className="flex min-w-0 items-center gap-2">
                              {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
                              <span className="text-sm font-bold text-zinc-950">교재 문항</span>
                            </span>
                              <span className="text-xs font-semibold text-zinc-500">{groups.length}p · {sessionDetail.problems.length}문항</span>
                            </button>
                            {!collapsed ? (
                              <div className="max-h-[420px] overflow-y-auto p-2">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                  {groups.map((group) => (
                                    <div key={group.key} className="rounded-lg bg-white p-2 ring-1 ring-zinc-200">
                                      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                                        <span className="text-zinc-950">{group.label}</span>
                                        <span className="text-zinc-500">{group.problems.length}문항</span>
                                      </div>
                                      <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,2.5rem))] gap-1.5">
                                        {group.problems.map((problem) => (
                                          <ProblemCell
                                            key={problem.problem_id}
                                            label={String(displayProblemNumber(problem))}
                                            subtitle={group.label}
                                            metadata={problemMetadataLabel(problem)}
                                            status={gridStatuses[problemStatusKey(problem)] || "correct"}
                                            onClick={() => toggleProblem(problem)}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  )
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-10 text-center text-sm text-zinc-500">세션과 학생을 선택하세요.</div>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
                  <span className="rounded bg-white px-2 py-1 text-zinc-950 ring-1 ring-zinc-300">정답</span>
                  <span className="rounded bg-zinc-200 px-2 py-1 text-zinc-950">오답</span>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-700 ring-1 ring-zinc-300">못 풂</span>
                  <span className="rounded bg-zinc-50 px-2 py-1 ring-1 ring-zinc-200">미채점</span>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {!loading && activeTab === "wrong" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-zinc-950">오답 아카이브</h2>
              <Button onClick={() => makeReviewSet()}>
                <RotateCcw className="h-4 w-4" />
                전체 미해결 오답으로 복습 세트
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {wrongAnswers.map((wrong) => (
                <Card key={wrong.id} className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base text-zinc-950">{wrong.student_name} · {wrong.problem_number}번</CardTitle>
                        <p className="mt-1 text-xs text-zinc-500">{[wrong.subject, wrong.unit].filter(Boolean).join(" · ") || "단원 정보 없음"}</p>
                      </div>
                      <Badge className={cn("border", statusTone(wrong.resolved_status))}>{statusLabel(wrong.resolved_status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MathText className="line-clamp-3 text-sm leading-6 text-zinc-700" value={wrong.problem_text} />
                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
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
              <Card key={classRow.id} className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
                <CardHeader>
                  <CardTitle className="text-zinc-950">{classRow.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sessionsForClass(classRow).slice(0, 6).map((session) => (
                    <div key={session.id} className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
                      <p className="text-sm font-semibold text-zinc-950">{session.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{formatDate(session.scheduled_at)} · {sessionTypeLabel(session.session_type)}</p>
                    </div>
                  ))}
                  {!sessionsForClass(classRow).length ? <p className="text-sm text-zinc-500">등록된 일정이 없습니다.</p> : null}
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        {!loading && activeTab === "analytics" ? (
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200">
              <CardHeader>
                <CardTitle className="text-zinc-950">채점 진행</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.map((session) => {
                  const ratio = session.assigned_count ? Math.round((session.graded_count / session.assigned_count) * 100) : 0;
                  return (
                    <div key={session.id}>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-700">{session.title}</span>
                        <span className="text-zinc-500">{ratio}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-zinc-100">
                        <div className="h-2 rounded-full bg-black" style={{ width: `${ratio}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="bg-white shadow-sm shadow-zinc-950/5 ring-1 ring-zinc-200 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-zinc-950">클래스별 오답 현황</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {classes.map((classRow) => (
                  <div key={classRow.id} className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-zinc-950">{classRow.name}</p>
                      <span className="text-zinc-950">{classRow.unresolved_wrong_count}</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">{classRow.student_count}명 · 세션 {classSessionCount(classRow)}개</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}
        {studentMergeMenu ? (
          <div
            className="fixed z-50 w-44 rounded-md bg-white p-1 shadow-2xl shadow-zinc-950/15 ring-1 ring-black/5"
            style={{ left: studentMergeMenu.x, top: studentMergeMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
              onClick={() => openStudentMerge(studentMergeMenu.student)}
            >
              <UserPlus className="h-4 w-4 text-zinc-600" />
              통합하기
            </button>
          </div>
        ) : null}
        {mergeSourceStudent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8">
            <section className="w-full max-w-xl rounded-lg bg-zinc-50 p-4 text-zinc-950 shadow-[0_24px_90px_rgba(0,0,0,0.16)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-zinc-950">학생 통합</h2>
                  <p className="mt-1 text-sm text-zinc-500">{mergeSourceStudent.name}</p>
                </div>
                <button type="button" onClick={closeStudentMerge} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950" aria-label="닫기">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <Input
                  className="border-0 bg-white text-zinc-950 shadow-sm shadow-zinc-950/5 placeholder:text-zinc-500 focus-visible:ring-black/10"
                  placeholder="합칠 학생 검색"
                  value={mergeSearch}
                  onChange={(event) => {
                    setMergeSearch(event.target.value);
                    setMergeTargetStudentId("");
                  }}
                />
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {mergeCandidates.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setMergeTargetStudentId(student.id)}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition",
                        mergeTargetStudentId === student.id ? "border-zinc-300 bg-zinc-200" : "border-zinc-100 bg-white hover:border-zinc-200"
                      )}
                    >
                      <span className="block truncate text-sm font-bold text-zinc-950">{student.name}</span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">{studentMetaText(student)}</span>
                    </button>
                  ))}
                  {!mergeCandidates.length ? (
                    <div className="rounded-md bg-white px-3 py-6 text-center text-sm text-zinc-500">검색 결과 없음</div>
                  ) : null}
                </div>
                {mergeTargetStudent ? (
                  <div className="rounded-md bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm shadow-zinc-950/5">
                    기준 학생: <span className="font-bold text-zinc-950">{mergePrimaryStudent?.name || "-"}</span>
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeStudentMerge}>취소</Button>
                  <Button type="button" onClick={submitStudentMerge} disabled={!mergeTargetStudentId || mergingStudent}>
                    {mergingStudent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    확인
                  </Button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
        {activeTab === "classes" ? (
          <>
            {showKeyManager ? (
              <div className="fixed bottom-36 right-6 z-40 w-[min(440px,calc(100vw-48px))] rounded-lg bg-white p-4 text-zinc-950 shadow-2xl shadow-zinc-950/15 ring-1 ring-black/5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-zinc-950">
                      <KeyRound className="h-4 w-4 text-zinc-700" />
                      학생 키 관리
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">반별 익명 좌석 키를 발급하고 대기/연결 상태를 관리합니다.</p>
                  </div>
                  <button type="button" onClick={() => setShowKeyManager(false)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950" aria-label="학생 키 관리 닫기">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      className="h-10 min-w-0 rounded-md border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
                      value={keyClassId}
                      disabled={!classes.length || keyManagerLoading}
                      onChange={(event) => setKeyClassId(event.target.value)}
                    >
                      {!classes.length ? <option value="">클래스 없음</option> : null}
                      {classes.map((classRow) => (
                        <option key={classRow.id} value={classRow.id}>
                          {classRow.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" onClick={issueClassKey} disabled={!academyId || !keyClassId || keyManagerLoading || !classes.length}>
                      {keyManagerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      익명 키 발급
                    </Button>
                  </div>
                  {!classes.length ? (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">익명 좌석 키를 발급하려면 먼저 클래스를 만들어야 합니다.</p>
                  ) : null}
                  {newKeyCodes.length ? (
                    <div className="space-y-2 rounded-md bg-zinc-100 p-2">
                      {newKeyCodes.map((code) => (
                        <div key={code} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 shadow-sm shadow-zinc-950/5">
                          <span className="min-w-0 truncate font-mono text-sm font-bold text-zinc-950">{code}</span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => copySeatKey(code)}>
                            <Copy className="h-4 w-4" />
                            복사
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-zinc-950">대량 익명 키 발급</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">선택적으로 이름과 연락처를 붙여 넣으면 키 목록을 구분하는 메모로 저장합니다. 실제 전달은 학원이 외부 경로로 진행합니다.</p>
                      </div>
                      <Badge variant="secondary">{bulkInviteRecipients.length || Math.max(1, Number(bulkKeyCount) || 1)}명</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={bulkKeyCount}
                        onChange={(event) => setBulkKeyCount(event.target.value)}
                        className="border-0 bg-white"
                        aria-label="대량 발급 키 수"
                      />
                      <div className="flex h-10 items-center rounded-[8px] bg-white px-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-200">
                        키만 생성
                      </div>
                    </div>
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-md border-0 bg-white p-3 text-xs leading-5 text-zinc-950 outline-none ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:ring-2 focus:ring-black/10"
                      value={bulkInviteText}
                      onChange={(event) => setBulkInviteText(event.target.value)}
                      placeholder={"김학생, 01012345678\n박학생, 01098765432\n메모만 남길 학생"}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={issueBulkClassKeys} disabled={!academyId || !keyClassId || keyManagerLoading || !classes.length}>
                        {keyManagerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        대량 생성
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={loadCounselingCandidatesIntoBulkInvite}>
                        상담 후보 불러오기
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={copyBulkInviteResults} disabled={!bulkInviteResults.length}>
                        <Copy className="h-4 w-4" />
                        결과 복사
                      </Button>
                    </div>
                    {bulkInviteResults.length ? (
                      <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                        {bulkInviteResults.map((seat) => {
                          const meta = seat.invite_metadata || {};
                          return (
                            <div key={seat.id} className="rounded-md bg-white p-2 text-xs ring-1 ring-zinc-200">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-zinc-950">{meta.recipient_name || seat.display_name || seat.seat_number}</p>
                                  <p className="mt-1 truncate text-zinc-500">
                                    {deliveryStatusLabel(seat.delivery_status || meta.delivery_status)} · Key {seat.key_code}
                                  </p>
                                </div>
                                {seat.sms_url ? (
                                  <a className="shrink-0 rounded-md bg-zinc-900 px-2 py-1 font-bold text-white" href={seat.sms_url}>
                                    SMS
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-zinc-950">학생 정보 수집 설정</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">학생이 초대 링크를 수락할 때 확인할 인적사항을 선택합니다. 저장된 기본 정보가 있으면 자동으로 채워집니다.</p>
                      </div>
                      <Button type="button" size="sm" onClick={saveStudentProfileSettings} disabled={profileSettingsLoading || profileSettingsSaving}>
                        {profileSettingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        저장
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {profileSettingsLoading && !studentProfileSettings.fields.length ? (
                        <div className="flex items-center rounded-md bg-white px-3 py-2 text-xs text-zinc-500">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          불러오는 중
                        </div>
                      ) : null}
                      {studentProfileSettings.fields.map((field) => (
                        <div key={field.key} className="rounded-md bg-white px-3 py-2 shadow-sm shadow-zinc-950/5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-zinc-950">{field.label}</p>
                            </div>
                            <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-zinc-600">
                              <input
                                type="checkbox"
                                checked={field.enabled}
                                onChange={(event) => updateStudentProfileField(field.key, { enabled: event.target.checked })}
                              />
                              수집
                            </label>
                          </div>
                          {field.enabled ? (
                            <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-zinc-600">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(event) => updateStudentProfileField(field.key, { required: event.target.checked })}
                                />
                                필수
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={field.real_name}
                                  onChange={(event) => updateStudentProfileField(field.key, { real_name: event.target.checked })}
                                />
                                실명
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {keyManagerLoading && !keySeats.length ? (
                      <div className="flex items-center justify-center rounded-md bg-zinc-50 p-4 text-sm text-zinc-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        불러오는 중
                      </div>
                    ) : null}
                    {!keyManagerLoading && !keySeats.length ? (
                      <div className="rounded-md bg-zinc-50 p-4 text-sm text-zinc-500">발급된 학생 키가 없습니다.</div>
                    ) : null}
                    {keySeats.map((seat) => {
                      const meta = seat.invite_metadata || {};
                      const inviteStatus = seat.delivery_status || meta.delivery_status;
                      const recipientPhone = meta.recipient_phone;
                      return (
                      <div key={seat.id} className="rounded-md bg-zinc-100 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-zinc-950">{meta.recipient_name || seat.display_name || seat.seat_number}</span>
                              <Badge variant={seatKeyStatusVariant(seat)}>{seatKeyStatusLabel(seat)}</Badge>
                              {inviteStatus ? <Badge variant="secondary">{deliveryStatusLabel(inviteStatus)}</Badge> : null}
                            </div>
                            <p className="mt-1 truncate text-xs text-zinc-500">
                              {seat.class_name || "클래스 미배정"} · Key ****{seat.invite_code_preview || "-"}
                            </p>
                            {recipientPhone ? <p className="mt-1 truncate text-xs text-zinc-500">연락처 {recipientPhone}</p> : null}
                            {seat.key_status === "legacy_unassigned" ? (
                              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">클래스가 없는 기존 키입니다. 학생에게 전달하지 말고 클래스 키를 새로 발급하세요.</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => rotateSeatKey(seat)} disabled={keyBusySeatId === seat.id || seat.key_status === "legacy_unassigned"} aria-label="학생 키 회전">
                              {keyBusySeatId === seat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-zinc-950" onClick={() => releaseKeySeat(seat)} disabled={!seat.assigned || keyBusySeatId === seat.id} aria-label="좌석 해제">
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
            {showClassCreator ? (
              <div className="fixed bottom-24 right-6 z-40 max-h-[calc(100vh-160px)] w-[min(460px,calc(100vw-48px))] overflow-y-auto rounded-lg bg-white p-4 text-zinc-950 shadow-2xl shadow-zinc-950/15 ring-1 ring-black/5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-semibold text-zinc-950">클래스 만들기</p>
                  <button type="button" onClick={() => setShowClassCreator(false)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  <Input className="border-0 bg-zinc-100 text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-black/10" placeholder="클래스 이름" value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))} />
                  <Input className="border-0 bg-zinc-100 text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-black/10" placeholder="레벨/설명" value={classForm.description} onChange={(event) => setClassForm((current) => ({ ...current, description: event.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="border-0 bg-zinc-100 text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-black/10" placeholder="과목" value={classForm.subject} onChange={(event) => setClassForm((current) => ({ ...current, subject: event.target.value }))} />
                    <Input className="border-0 bg-zinc-100 text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-black/10" placeholder="학년" value={classForm.grade_level} onChange={(event) => setClassForm((current) => ({ ...current, grade_level: event.target.value }))} />
                  </div>
                  <div className="space-y-3 rounded-[8px] bg-zinc-50 p-3">
                    <div className="text-xs font-black text-zinc-500">일정</div>
                    <Input type="date" value={classForm.routine_date} onChange={(event) => setClassForm((current) => ({ ...current, routine_date: event.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <ClassTimeWheel label="시작" value={classForm.routine_starts_at} options={CLASS_START_TIME_OPTIONS} onChange={updateClassRoutineStartTime} />
                      <ClassTimeWheel
                        label="종료"
                        value={classForm.routine_ends_at}
                        options={classRoutineEndTimeOptions}
                        disabled={!classForm.routine_starts_at}
                        onChange={updateClassRoutineEndTime}
                      />
                    </div>
                    <select
                      className="h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:bg-white focus:ring-2 focus:ring-black/10"
                      value={classForm.routine_recurrence_unit}
                      onChange={(event) => setClassForm((current) => ({ ...current, routine_recurrence_unit: event.target.value as ScheduleRecurrenceUnit, routine_recurrence_interval: "1" }))}
                    >
                      <option value="week">주 단위 반복</option>
                      <option value="none">한 번만</option>
                      <option value="day">일 단위 반복</option>
                      <option value="month">월 단위 반복</option>
                    </select>
                    {classForm.routine_recurrence_unit !== "none" ? (
                      <div className="space-y-3 rounded-[10px] bg-white p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-xs font-semibold text-zinc-600">
                            반복 간격
                            <select
                              className="mt-1 h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:ring-2 focus:ring-black/10"
                              value={classForm.routine_recurrence_interval}
                              onChange={(event) => setClassForm((current) => ({ ...current, routine_recurrence_interval: event.target.value }))}
                            >
                              {(classForm.routine_recurrence_unit === "day" ? dayIntervalOptions : classForm.routine_recurrence_unit === "week" ? weekIntervalOptions : monthIntervalOptions).map((value) => (
                                <option key={value} value={value}>
                                  {classForm.routine_recurrence_unit === "day" ? `${value}일마다` : classForm.routine_recurrence_unit === "week" ? `${value}주마다` : `${value}개월마다`}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs font-semibold text-zinc-600">
                            반복 종료일
                            <Input className="mt-1" type="date" value={classForm.routine_repeat_until} onChange={(event) => setClassForm((current) => ({ ...current, routine_repeat_until: event.target.value }))} />
                          </label>
                        </div>
                        {classForm.routine_recurrence_unit === "week" ? (
                          <div>
                            <p className="mb-2 text-xs font-semibold text-zinc-600">요일</p>
                            <div className="grid grid-cols-7 gap-1.5">
                              {scheduleWeekdays.map((day) => {
                                const active = classRoutineSelectedWeekdays.includes(day.value);
                                return (
                                  <button
                                    key={day.value}
                                    type="button"
                                    onClick={() => toggleClassRoutineWeekday(day.value)}
                                    className={cn("h-8 rounded-[7px] text-xs font-bold transition", active ? "bg-black text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950")}
                                  >
                                    {day.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        {classForm.routine_recurrence_unit === "month" ? (
                          <label className="block text-xs font-semibold text-zinc-600">
                            반복 날짜
                            <select
                              className="mt-1 h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:ring-2 focus:ring-black/10"
                              value={classRoutineSelectedMonthDay}
                              onChange={(event) => setClassForm((current) => ({ ...current, routine_recurrence_month_day: event.target.value }))}
                            >
                              {monthDayOptions.map((value) => (
                                <option key={value} value={value}>{value}일</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <p className="text-xs text-zinc-500">종료일을 비워두면 최대 160개까지 반복 일정을 자동 저장합니다.</p>
                      </div>
                    ) : null}
                  </div>
                  <Button type="button" className="w-full" onClick={submitClass} disabled={classSaving || !classForm.name.trim()}>
                    {classSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {classForm.name.trim() ? "클래스 추가" : "클래스 이름 입력"}
                  </Button>
                </div>
              </div>
            ) : null}
            {!showKeyManager && !showClassCreator ? (
              <>
                <Button
                  type="button"
                  onClick={toggleKeyManager}
                  variant="outline"
                  className="fixed bottom-20 right-6 z-40 hidden h-12 w-12 rounded-full p-0 shadow-2xl shadow-zinc-950/30 sm:inline-flex"
                  aria-label={`남은 학생 키 ${remainingStudentKeyCount}개`}
                  title={`남은 학생 키 ${remainingStudentKeyCount}개`}
                >
                  <span className="font-mono text-base font-black tabular-nums leading-none text-zinc-950">{remainingStudentKeyCount}</span>
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowKeyManager(false);
                    setShowClassCreator(true);
                  }}
                  className="fixed bottom-6 right-6 z-40 hidden h-12 w-12 rounded-full p-0 shadow-2xl shadow-zinc-950/40 sm:inline-flex"
                  aria-label="클래스 만들기"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
