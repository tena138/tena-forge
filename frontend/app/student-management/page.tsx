"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GripVertical,
  KeyRound,
  LineChart,
  Loader2,
  Plus,
  RotateCcw,
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
import { readStoredAuthProfile } from "@/lib/auth-client";
import {
  issueLearningStudentKeys,
  listAcademySeats,
  releaseAcademySeat,
  rotateAcademySeatCode,
} from "@/lib/academyStudent";
import type { AcademySeat } from "@/lib/academyStudent";
import { ProblemSetListItem, api } from "@/lib/api";
import {
  ClassCard,
  PaperSessionDetail,
  PaperSessionSummary,
  SessionProblem,
  StudentCard,
  WrongAnswer,
  addStudentToClass,
  createClass,
  createPaperSession,
  createReviewSet,
  createStudent,
  ensureStudentInviteCode,
  getPaperSessionDetail,
  getStudentManagementDashboard,
  listPaperSessions,
  listWrongAnswers,
  savePaperSessionGrade,
  updateClassOrder,
} from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type TabKey = "classes" | "students" | "sessions" | "grading" | "wrong" | "calendar" | "analytics";
type ClassStudentAddMode = "existing" | "new";
type ProblemStatus = "correct" | "wrong" | "unanswered" | "unmarked";
type TrendChartMode = "line" | "bar";
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

const emptyStudentForm = { name: "", school: "", grade_level: "", memo: "", class_id: "" };

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
  };
}

function studentDirectoryText(student: StudentCard) {
  return [student.name, student.school, student.grade_level, student.class_names.join(" ")].filter(Boolean).join(" ").toLowerCase();
}

function studentMetaText(student: StudentCard) {
  return [student.school, student.grade_level, student.class_names.join(", ")].filter(Boolean).join(" · ") || "소속 없음";
}
const trendMetricOptions: Array<{ key: TrendMetricKey; label: string; shortLabel: string; color: string }> = [
  { key: "selected", label: "본인 점수", shortLabel: "본인", color: "#f8fafc" },
  { key: "average", label: "응시자 평균", shortLabel: "평균", color: "#a78bfa" },
  { key: "highest", label: "최고점", shortLabel: "최고", color: "#94a3b8" },
  { key: "lowest", label: "최저점", shortLabel: "최저", color: "#64748b" },
  { key: "q1", label: "Q1", shortLabel: "Q1", color: "#7dd3fc" },
  { key: "q2", label: "중앙값", shortLabel: "중앙", color: "#c4b5fd" },
  { key: "q3", label: "Q3", shortLabel: "Q3", color: "#cbd5e1" },
  { key: "stddev", label: "표준편차", shortLabel: "σ", color: "#475569" },
];
const defaultTrendMetrics: TrendMetricKey[] = ["selected", "average", "q2"];
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

function ClassStudentCard({ student }: { student: StudentCard }) {
  return (
    <Link href={`/student-management/students/${student.id}`} className="flex h-full min-h-[136px] w-[210px] shrink-0 flex-col justify-between rounded-md border border-white/[0.08] bg-white/[0.035] p-3 transition hover:border-violet-300/40 hover:bg-violet-500/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{student.name}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{[student.school, student.grade_level].filter(Boolean).join(" · ") || "학생 정보 미입력"}</p>
        </div>
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

function StudentDirectoryCard({ student, copying, onCopyKey }: { student: StudentCard; copying?: boolean; onCopyKey: (student: StudentCard) => void }) {
  const meta = [student.school, student.grade_level, student.class_names.join(", ")].filter(Boolean).join(" · ") || "학생 정보 미입력";
  const keyLabel = student.invite_code || (student.invite_code_preview ? `****${student.invite_code_preview}` : "키 없음");
  return (
    <article className="group min-w-0 rounded-md border border-white/[0.08] bg-white/[0.03] p-3 transition hover:border-violet-300/35 hover:bg-violet-500/[0.08]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={`/student-management/students/${student.id}`} className="truncate text-sm font-black text-white hover:text-violet-100">
              {student.name}
            </Link>
            <span className="inline-flex max-w-full items-center gap-1 rounded border border-violet-300/20 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet-100">
              <span className="text-slate-400">Key</span>
              <span className="truncate">{keyLabel}</span>
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">{meta}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-slate-400 hover:bg-violet-500/10 hover:text-violet-100"
          onClick={() => onCopyKey(student)}
          disabled={copying}
          aria-label={`${student.name} 학생 키 복사`}
          title="학생 키 복사"
        >
          {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-white/[0.045] px-2 py-2">
          <p className="text-slate-500">최근</p>
          <p className="mt-1 font-bold text-slate-100">{student.recent_score == null ? "-" : `${Math.round(student.recent_score)}점`}</p>
        </div>
        <div className="rounded bg-white/[0.045] px-2 py-2">
          <p className="text-slate-500">오답</p>
          <p className="mt-1 font-bold text-rose-100">{student.unresolved_wrong_count}</p>
        </div>
        <div className="rounded bg-white/[0.045] px-2 py-2">
          <p className="text-slate-500">반</p>
          <p className="mt-1 truncate font-bold text-cyan-100">{student.class_names.length || "-"}</p>
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
  const [mode, setMode] = useState<TrendChartMode>("line");
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
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black/20 dark:shadow-none">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">시험 통계 추이</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">평균, 최고/최저, 분위수를 선택해서 시간 흐름으로 비교합니다.</p>
        </div>
        <div className="flex w-fit rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.035]">
          <button
            type="button"
            aria-label="선 그래프"
            title="선 그래프"
            onClick={() => setMode("line")}
            className={cn("flex h-8 w-8 items-center justify-center rounded text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white", mode === "line" && "bg-violet-100 text-violet-800 dark:bg-violet-500/25 dark:text-white")}
          >
            <LineChart className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="막대 그래프"
            title="막대 그래프"
            onClick={() => setMode("bar")}
            className={cn("flex h-8 w-8 items-center justify-center rounded text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white", mode === "bar" && "bg-violet-100 text-violet-800 dark:bg-violet-500/25 dark:text-white")}
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {trendMetricOptions.map((metric) => {
          const active = selectedMetrics.includes(metric.key);
          return (
            <button
              key={metric.key}
              type="button"
              onClick={() => toggleMetric(metric.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold transition",
                active
                  ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-white/20 dark:bg-white/[0.08] dark:text-white"
                  : "border-slate-200 bg-transparent text-slate-500 hover:text-slate-900 dark:border-white/10 dark:text-slate-500 dark:hover:text-slate-200"
              )}
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-full", metric.key === "selected" && "border border-slate-300 shadow-sm dark:border-white/45")}
                style={{ backgroundColor: active ? metric.color : "rgba(148, 163, 184, 0.35)" }}
              />
              {metric.label}
            </button>
          );
        })}
      </div>

      {points.length ? (
        <div className="mt-4 overflow-x-auto rounded-md border border-white/[0.08] bg-[#070812] p-3 [scrollbar-width:thin]">
          <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="시험 통계 추이 그래프">
            {[100, 75, 50, 25, 0].map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} stroke="rgba(148, 163, 184, 0.16)" />
                  <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="rgb(100, 116, 139)">{tick}</text>
                </g>
              );
            })}
            <line x1={padding.left} x2={padding.left} y1={padding.top} y2={baseline} stroke="rgba(148, 163, 184, 0.22)" />
            <line x1={padding.left} x2={chartWidth - padding.right} y1={baseline} y2={baseline} stroke="rgba(148, 163, 184, 0.22)" />

            {mode === "line" ? visibleMetrics.map((metric) => {
              const linePoints = points
                .map((point, index) => ({ x: xFor(index), y: typeof point[metric.key] === "number" ? yFor(point[metric.key] as number) : null }))
                .filter((point): point is { x: number; y: number } => point.y != null);
              return (
                <g key={metric.key}>
                  {linePoints.length > 1 ? (
                    <polyline points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={metric.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {linePoints.map((point, index) => (
                    <circle key={`${metric.key}-${index}`} cx={point.x} cy={point.y} r="4" fill={metric.color} stroke="#070812" strokeWidth="2" />
                  ))}
                </g>
              );
            }) : null}

            {mode === "bar" ? points.map((point, pointIndex) => {
              const groupWidth = Math.min(78, Math.max(24, visibleMetrics.length * 12));
              const barWidth = Math.max(5, Math.min(10, (groupWidth - visibleMetrics.length * 3) / Math.max(1, visibleMetrics.length)));
              return (
                <g key={point.id}>
                  {visibleMetrics.map((metric, metricIndex) => {
                    const value = point[metric.key];
                    if (typeof value !== "number" || !Number.isFinite(value)) return null;
                    const y = yFor(value);
                    const x = xFor(pointIndex) - groupWidth / 2 + metricIndex * (barWidth + 3);
                    return <rect key={metric.key} x={x} y={y} width={barWidth} height={Math.max(2, baseline - y)} rx="2" fill={metric.color} opacity="0.88" />;
                  })}
                </g>
              );
            }) : null}

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
                  fill={selectedPointId === point.id ? "rgba(139, 92, 246, 0.12)" : "transparent"}
                  stroke={selectedPointId === point.id ? "rgba(167, 139, 250, 0.48)" : "transparent"}
                />
                <text x={xFor(index)} y={chartHeight - 32} textAnchor="middle" fontSize="11" fontWeight="700" fill={selectedPointId === point.id ? "rgb(255, 255, 255)" : "rgb(203, 213, 225)"}>
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
        <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-0">
          <p className="text-slate-500">{selectedPoint ? "선택 평균" : "최근 평균"}</p>
          <p className="mt-1 text-base font-black text-slate-950 dark:text-white">{scoreLabel(summaryPoint?.average)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-0">
          <p className="text-slate-500">{selectedPoint ? "선택 중앙값" : "최근 중앙값"}</p>
          <p className="mt-1 text-base font-black text-amber-700 dark:text-amber-100">{scoreLabel(summaryPoint?.q2)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-0">
          <p className="text-slate-500">{selectedPoint ? "선택 범위" : "최근 범위"}</p>
          <p className="mt-1 text-base font-black text-slate-950 dark:text-slate-100">{summaryPoint ? `${scoreLabel(summaryPoint.lowest)} - ${scoreLabel(summaryPoint.highest)}` : "-"}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-0">
          <p className="text-slate-500">{selectedPoint ? "선택 응시" : "최근 응시"}</p>
          <p className="mt-1 text-base font-black text-cyan-700 dark:text-cyan-100">{summaryPoint ? `${summaryPoint.respondents}/${summaryPoint.assigned}` : "-"}</p>
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
    <div className="border-t border-slate-200 px-4 pb-4 dark:border-white/10">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-violet-300/15 dark:bg-violet-500/[0.06] dark:shadow-none">
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
                        ? "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-300/50 dark:bg-violet-500/25 dark:text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400 dark:hover:text-white"
                    )}
                  >
                    {student.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr]">
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-white/10 dark:bg-white/[0.055]">
                <p className="text-xs font-semibold text-violet-700 dark:text-slate-400">{selectedSessionStat ? "본인 선택 점수" : "본인 최근 점수"}</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <p className="text-4xl font-black tracking-normal text-slate-950 dark:text-white">{scoreLabel(focusedStat?.selectedScore)}</p>
                  <p className="max-w-[220px] truncate text-right text-xs text-slate-500 dark:text-slate-400" title={focusedStat?.detail.title}>
                    {focusedStat ? `${focusedStat.detail.title} · ${formatDate(focusedStat.detail.scheduled_at || focusedStat.detail.created_at)}` : "채점 완료 기록 없음"}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                <p className="text-xs font-semibold text-slate-500">반 평균 대비</p>
                <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{focusedClassDelta == null ? "-" : `${focusedClassDelta >= 0 ? "+" : ""}${focusedClassDelta.toFixed(1)}`}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                <p className="text-xs font-semibold text-slate-500">{selectedSessionStat ? "선택 반 평균" : "최근 반 평균"}</p>
                <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{scoreLabel(focusedStat?.classAverage)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                <p className="text-xs font-semibold text-slate-500">석차</p>
                <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{focusedStat?.rank == null ? "-" : `${focusedStat.rank}/${focusedStat.classGradedCount}`}</p>
              </div>
            </div>

            <ClassTrendChart points={classMetricPoints} selectedPointId={focusedPointId} onSelectPoint={setSelectedStatsId} />

            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.045] dark:ring-0">
                <p className="text-xs text-slate-500">학생 평균</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scoreLabel(selectedAverage)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.045] dark:ring-0">
                <p className="text-xs text-slate-500">반 평균</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scoreLabel(classAverageAcross)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.045] dark:ring-0">
                <p className="text-xs text-slate-500">전체 평균</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{scoreLabel(overallAverageAcross)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.045] dark:ring-0">
                <p className="text-xs text-slate-500">점수 표준편차</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-slate-100">{selectedStdDev == null ? "-" : selectedStdDev.toFixed(1)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.045] dark:ring-0">
                <p className="text-xs text-slate-500">반 평균 대비</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{averageClassDelta == null ? "-" : `${averageClassDelta >= 0 ? "+" : ""}${averageClassDelta.toFixed(1)}`}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/[0.045] dark:ring-0">
                <p className="text-xs text-slate-500">추세</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{trend == null ? "-" : `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}`}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm [scrollbar-width:thin] dark:border-white/10 dark:bg-black/20 dark:shadow-none">
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
                <div key={item.detail.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black/20 dark:shadow-none">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">{item.detail.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedStudent?.name || "학생"} {scoreLabel(item.selectedScore)} · 반 평균 {scoreLabel(item.classAverage)}
                        {item.showOverallAverage ? ` · 전체 평균 ${scoreLabel(item.overallAverage)}` : ""}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0 border", statusTone(item.selectedStatus))}>{item.selectedStatus}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">석차 {item.rank == null ? "-" : `${item.rank}/${item.classGradedCount}`}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">백분위 {item.percentile == null ? "-" : `${item.percentile}`}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">반 σ {item.classStdDev == null ? "-" : item.classStdDev.toFixed(1)}</span>
                    <span className="rounded bg-slate-50 px-2 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-0">전체 n {item.overallGradedCount}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {item.selectedMissed.length ? item.selectedMissed.map((number) => (
                      <span key={number} className="rounded bg-orange-100 px-2 py-1 text-orange-800 dark:bg-orange-500/15 dark:text-orange-100">{number}번</span>
                    )) : <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-100">학생 오답 없음</span>}
                    {item.commonMissed.slice(0, 3).map(([number, count]) => (
                      <span key={`common-${number}`} className="rounded bg-rose-100 px-2 py-1 text-rose-800 dark:bg-rose-500/15 dark:text-rose-100">반 다빈도 {number}번 {count}명</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {bestExam ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
                {selectedStudent?.name || "선택 학생"} 최고 기록은 <span className="font-black text-slate-950 dark:text-white">{bestExam.detail.title}</span>의 <span className="font-black text-violet-700 dark:text-violet-100">{scoreLabel(bestExam.selectedScore)}</span>입니다.
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
        status === "correct" && "border-emerald-300/50 bg-emerald-500/20 text-emerald-100",
        status === "wrong" && "border-orange-300/60 bg-orange-500/25 text-orange-100",
        status === "unanswered" && "border-rose-300/60 bg-rose-500/25 text-rose-100",
        status === "unmarked" && "border-white/10 bg-white/[0.035] text-slate-300 hover:border-violet-300/40"
      )}
      title={[`${label}번`, metadata || subtitle, status].filter(Boolean).join(" · ")}
    >
      {label}
    </button>
  );
}

export default function StudentManagementPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("classes");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [sessions, setSessions] = useState<PaperSessionSummary[]>([]);
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
  const [showClassCreator, setShowClassCreator] = useState(false);
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [addingStudentClassId, setAddingStudentClassId] = useState("");
  const [classStudentMode, setClassStudentMode] = useState<ClassStudentAddMode>("existing");
  const [classStudentSearch, setClassStudentSearch] = useState("");
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState("");
  const [classStudentSavingId, setClassStudentSavingId] = useState("");
  const [copyingStudentKeyId, setCopyingStudentKeyId] = useState("");
  const [academyId, setAcademyId] = useState("");
  const [keySeats, setKeySeats] = useState<AcademySeat[]>([]);
  const [keyClassId, setKeyClassId] = useState("");
  const [keyManagerLoading, setKeyManagerLoading] = useState(false);
  const [keyBusySeatId, setKeyBusySeatId] = useState("");
  const [newKeyCodes, setNewKeyCodes] = useState<string[]>([]);
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
  const classOrderRef = useRef<ClassCard[]>([]);

  const allStudents = useMemo(() => {
    const map = new Map<string, StudentCard>();
    for (const classRow of classes) {
      for (const student of classRow.students || []) {
        const existing = map.get(student.id);
        map.set(student.id, existing ? mergeStudentCard(existing, student) : student);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  useEffect(() => {
    classOrderRef.current = classes;
  }, [classes]);

  useEffect(() => {
    const stored = readStoredAuthProfile<AcademyProfile>();
    setAcademyId(stored?.id || "");
  }, []);

  useEffect(() => {
    setKeyClassId((current) => current || classes[0]?.id || "");
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

  async function copyStudentKey(student: StudentCard) {
    setCopyingStudentKeyId(student.id);
    try {
      const response = await ensureStudentInviteCode(student.id);
      await navigator.clipboard.writeText(response.invite_code);
      setClasses((current) =>
        current.map((classRow) => ({
          ...classRow,
          students: classRow.students.map((item) =>
            item.id === student.id
              ? { ...item, invite_code: response.invite_code, invite_code_preview: response.invite_code_preview || item.invite_code_preview }
              : item
          ),
        }))
      );
      setMessage(`${student.name} 학생 키를 복사했습니다.`);
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

  function toggleKeyManager() {
    setShowKeyManager((current) => {
      const next = !current;
      if (next) {
        setShowClassCreator(false);
        void loadKeyManager();
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
      setMessage(codes[0] ? `학생 키를 발급했습니다: ${codes[0]}` : "학생 키를 발급했습니다.");
      await loadKeyManager();
    } catch (error) {
      setMessage(errorMessage(error, "학생 키를 발급하지 못했습니다."));
    } finally {
      setKeyManagerLoading(false);
    }
  }

  async function copySeatKey(code: string) {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setMessage("학생 키를 복사했습니다.");
  }

  async function rotateSeatKey(seat: AcademySeat) {
    if (!academyId) return;
    setKeyBusySeatId(seat.id);
    try {
      const updated = await rotateAcademySeatCode(academyId, seat.id);
      const code = updated.invite_code || "";
      setNewKeyCodes(code ? [code] : []);
      setMessage(code ? `학생 키를 새로 만들었습니다: ${code}` : "학생 키를 새로 만들었습니다.");
      await loadKeyManager();
    } catch (error) {
      setMessage(errorMessage(error, "학생 키를 새로 만들지 못했습니다."));
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

  function startClassStudentAdd(classRow: ClassCard) {
    const currentIds = classStudentMembershipIds(classRow);
    const hasExistingCandidate = allStudents.some((student) => !currentIds.has(student.id));
    setAddingStudentClassId(classRow.id);
    setClassStudentMode(hasExistingCandidate ? "existing" : "new");
    setClassStudentSearch("");
    setSelectedExistingStudentId("");
    setClassStudentForm({
      name: "",
      school: "",
      grade_level: classRow.grade_level || "",
      memo: "",
      class_id: classRow.id,
    });
  }

  function cancelClassStudentAdd() {
    setAddingStudentClassId("");
    setClassStudentMode("existing");
    setClassStudentSearch("");
    setSelectedExistingStudentId("");
    setClassStudentForm(emptyStudentForm);
  }

  function existingStudentsForClass(classRow: ClassCard) {
    const currentIds = classStudentMembershipIds(classRow);
    const query = classStudentSearch.trim().toLowerCase();
    return allStudents.filter((student) => {
      if (currentIds.has(student.id)) return false;
      return !query || studentDirectoryText(student).includes(query);
    });
  }

  async function submitExistingClassStudent(classRow: ClassCard) {
    if (!selectedExistingStudentId) return;
    setClassStudentSavingId(classRow.id);
    try {
      const selectedStudent = allStudents.find((student) => student.id === selectedExistingStudentId);
      const updated = await addStudentToClass(classRow.id, selectedExistingStudentId);
      setClasses((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      cancelClassStudentAdd();
      setMessage(`${selectedStudent?.name || "선택한 학생"}을(를) ${classRow.name}에 연결했습니다.`);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error, "기존 학생을 클래스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."));
    } finally {
      setClassStudentSavingId("");
    }
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
      cancelClassStudentAdd();
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
    return new Set([...(classRow.student_membership_ids || []), ...classRow.students.map((student) => student.id)]);
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

  const selectedStudent = sessionDetail?.students.find((student) => student.id === selectedStudentId);
  const activeStudentCount = allStudents.filter(
    (student) => student.status === "active" || student.status_chip === "Active" || student.status_chip === "active"
  ).length;
  const scoredStudentCount = allStudents.filter((student) => typeof student.recent_score === "number").length;
  const unresolvedStudentWrongs = allStudents.reduce((total, student) => total + student.unresolved_wrong_count, 0);

  return (
    <main className="min-h-screen bg-transparent px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
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

        {!loading && activeTab === "classes" ? (
          <section className="space-y-3">
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
                  "overflow-visible rounded-none border-0 border-t border-white/10 bg-transparent shadow-none transition",
                  draggingClassId === classRow.id && "bg-violet-500/[0.04]"
                )}
              >
                <CardContent className="p-0">
                  <div className="grid min-h-[168px] grid-cols-[28px_minmax(0,1fr)] lg:grid-cols-[28px_180px_minmax(0,1fr)]">
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
                        "row-span-2 flex h-full min-h-[168px] cursor-grab items-center justify-center border-r border-white/10 text-slate-600 transition hover:bg-white/[0.035] hover:text-violet-100 active:cursor-grabbing lg:row-span-1",
                        draggingClassId === classRow.id && "text-violet-200"
                      )}
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>
                    <aside className="flex flex-col justify-between gap-4 border-b border-white/10 bg-transparent p-4 lg:border-b-0 lg:border-r">
                      <div>
                        <p className="text-3xl font-black tracking-normal text-white">{classRow.name}</p>
                        <p className="mt-2 text-2xl font-black text-slate-200">{classRow.student_count}</p>
                        <p className="text-xs text-slate-500">학생</p>
                        <p className="mt-3 truncate text-xs text-slate-500">{[classRow.subject, classRow.grade_level].filter(Boolean).join(" · ") || classRow.description || "클래스 정보 없음"}</p>
                      </div>
                      <div className="flex gap-2">
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
                        <button
                          type="button"
                          aria-label={`${classRow.name} 인원 추가`}
                          title={`${classRow.name} 인원 추가`}
                          onClick={() => startClassStudentAdd(classRow)}
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-md border transition",
                            addingStudentClassId === classRow.id ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-emerald-300/40 hover:text-white"
                          )}
                        >
                          <UserPlus className="h-5 w-5" />
                        </button>
                      </div>
                    </aside>
                    <div className="col-start-2 flex min-w-0 flex-col gap-3 p-4 lg:col-start-auto">
                      {addingStudentClassId === classRow.id ? (
                        (() => {
                          const existingStudents = existingStudentsForClass(classRow);
                          return (
                            <div className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-3">
                              <div className="mb-3 inline-flex rounded-md border border-white/10 bg-black/20 p-1">
                                {[
                                  ["existing", "기존 학생"] as const,
                                  ["new", "새 학생"] as const,
                                ].map(([mode, label]) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => {
                                      setClassStudentMode(mode);
                                      setSelectedExistingStudentId("");
                                    }}
                                    className={cn(
                                      "rounded px-3 py-1.5 text-xs font-bold transition",
                                      classStudentMode === mode ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
                                    )}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>

                              {classStudentMode === "existing" ? (
                                <div className="space-y-3">
                                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
                                    <Input
                                      placeholder="이름, 학교, 클래스 검색"
                                      value={classStudentSearch}
                                      onChange={(event) => {
                                        setClassStudentSearch(event.target.value);
                                        setSelectedExistingStudentId("");
                                      }}
                                    />
                                    <Select value={selectedExistingStudentId} onChange={(event) => setSelectedExistingStudentId(event.target.value)}>
                                      <option value="">기존 학생 선택</option>
                                      {existingStudents.map((student) => (
                                        <option key={student.id} value={student.id}>
                                          {student.name} · {studentMetaText(student)}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  {!existingStudents.length ? (
                                    <p className="rounded-md border border-dashed border-white/10 px-3 py-2 text-xs text-slate-400">
                                      연결할 기존 학생이 없습니다. 새 학생으로 등록하세요.
                                    </p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" size="sm" onClick={() => submitExistingClassStudent(classRow)} disabled={classStudentSavingId === classRow.id || !selectedExistingStudentId}>
                                      {classStudentSavingId === classRow.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                                      연결
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" onClick={cancelClassStudentAdd}>취소</Button>
                                  </div>
                                </div>
                              ) : (
                                <form
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
                                      생성
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" onClick={cancelClassStudentAdd}>취소</Button>
                                  </div>
                                </form>
                              )}
                            </div>
                          );
                        })()
                      ) : null}
                      {classRow.students.length ? (
                        <div className="flex min-h-[136px] flex-1 items-stretch gap-3 overflow-x-auto pb-1 [scrollbar-color:#2f3543_transparent] [scrollbar-width:thin]">
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
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["전체 학생", allStudents.length],
                ["활성 학생", activeStudentCount],
                ["미해결 오답", unresolvedStudentWrongs],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
                  <p className="text-xs font-semibold text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-black text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.025]">
                <div className="flex flex-col gap-1 border-b border-white/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-black text-white">학생 목록</h2>
                    <p className="mt-1 text-xs text-slate-500">최근 점수 입력 {scoredStudentCount}명</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{allStudents.length}명</span>
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
                    <div className="rounded-lg border border-dashed border-white/[0.1] p-8 text-center text-sm text-slate-500 sm:col-span-2 2xl:col-span-3">
                      아직 등록된 학생이 없습니다.
                    </div>
                  ) : null}
                </div>
              </section>
              <aside className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="mb-4">
                  <h2 className="text-sm font-black text-white">학생 추가</h2>
                  <p className="mt-1 text-xs text-slate-500">필요한 정보만 빠르게 등록합니다.</p>
                </div>
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
              </aside>
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
                    {selectedStudent ? <p className="mt-1 text-sm text-slate-400">{`${selectedStudent.name} · ${sessionDetail?.problem_count || 0}문항`}</p> : null}
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
                    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/15">
                      {(() => {
                        const collapsed = collapsedTextbookGrids[sessionDetail.id] || false;
                        const groups = groupProblemsByPage(sessionDetail.problems);
                        return (
                          <>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-left"
                              onClick={() => setCollapsedTextbookGrids((current) => ({ ...current, [sessionDetail.id]: !collapsed }))}
                            >
                            <span className="flex min-w-0 items-center gap-2">
                              {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
                              <span className="text-sm font-bold text-white">교재 문항</span>
                            </span>
                              <span className="text-xs font-semibold text-slate-500">{groups.length}p · {sessionDetail.problems.length}문항</span>
                            </button>
                            {!collapsed ? (
                              <div className="max-h-[420px] overflow-y-auto p-2">
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                  {groups.map((group) => (
                                    <div key={group.key} className="rounded-lg border border-white/10 bg-white/[0.025] p-2">
                                      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                                        <span className="text-white">{group.label}</span>
                                        <span className="text-slate-500">{group.problems.length}문항</span>
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
                  {sessionsForClass(classRow).slice(0, 6).map((session) => (
                    <div key={session.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-sm font-semibold text-white">{session.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(session.scheduled_at)} · {session.session_type}</p>
                    </div>
                  ))}
                  {!sessionsForClass(classRow).length ? <p className="text-sm text-slate-500">등록된 일정이 없습니다.</p> : null}
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
                    <p className="mt-2 text-sm text-slate-500">{classRow.student_count}명 · 세션 {classSessionCount(classRow)}개</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}
        {activeTab === "classes" ? (
          <>
            {showKeyManager ? (
              <div className="fixed bottom-36 right-6 z-40 w-[min(440px,calc(100vw-48px))] rounded-lg border border-white/10 bg-[#11121a] p-4 shadow-2xl shadow-black/50">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-white">
                      <KeyRound className="h-4 w-4 text-violet-200" />
                      학생 키 관리
                    </p>
                    <p className="mt-1 text-xs text-slate-500">반별 학생 접속 키를 발급하고 좌석을 관리합니다.</p>
                  </div>
                  <button type="button" onClick={() => setShowKeyManager(false)} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="학생 키 관리 닫기">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      className="h-10 min-w-0 rounded-md border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none focus:border-violet-300/50"
                      value={keyClassId}
                      onChange={(event) => setKeyClassId(event.target.value)}
                    >
                      {classes.map((classRow) => (
                        <option key={classRow.id} value={classRow.id}>
                          {classRow.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" onClick={issueClassKey} disabled={!academyId || !keyClassId || keyManagerLoading}>
                      {keyManagerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      키 발급
                    </Button>
                  </div>
                  {newKeyCodes.length ? (
                    <div className="space-y-2 rounded-md border border-violet-300/20 bg-violet-500/10 p-2">
                      {newKeyCodes.map((code) => (
                        <div key={code} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
                          <span className="min-w-0 truncate font-mono text-sm font-bold text-violet-100">{code}</span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => copySeatKey(code)}>
                            <Copy className="h-4 w-4" />
                            복사
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {keyManagerLoading && !keySeats.length ? (
                      <div className="flex items-center justify-center rounded-md border border-dashed border-white/10 p-4 text-sm text-slate-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        불러오는 중
                      </div>
                    ) : null}
                    {!keyManagerLoading && !keySeats.length ? (
                      <div className="rounded-md border border-dashed border-white/10 p-4 text-sm text-slate-500">발급된 학생 키가 없습니다.</div>
                    ) : null}
                    {keySeats.map((seat) => (
                      <div key={seat.id} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-white">{seat.display_name || seat.seat_number}</span>
                              <Badge variant={seat.assigned ? "success" : "secondary"}>{seat.assigned ? "연결됨" : "대기"}</Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {seat.class_name || "반 없음"} · Key ****{seat.invite_code_preview || "-"}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => rotateSeatKey(seat)} disabled={keyBusySeatId === seat.id} aria-label="학생 키 회전">
                              {keyBusySeatId === seat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-rose-100" onClick={() => releaseKeySeat(seat)} disabled={!seat.assigned || keyBusySeatId === seat.id} aria-label="좌석 해제">
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
              onClick={toggleKeyManager}
              variant={showKeyManager ? "default" : "outline"}
              className="fixed bottom-20 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-2xl shadow-violet-950/30"
              aria-label="학생 키 관리"
              title="학생 키 관리"
            >
              <KeyRound className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowKeyManager(false);
                setShowClassCreator((current) => !current);
              }}
              className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-2xl shadow-violet-950/40"
              aria-label="클래스 만들기"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </>
        ) : null}
      </div>
    </main>
  );
}
