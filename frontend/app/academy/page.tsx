"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LineChart,
  PackageCheck,
  Plus,
  ScanText,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile, fetchMe } from "@/lib/auth-api";
import { WORKSPACE_CHANGED_EVENT, getActiveWorkspaceId, readStoredAuthProfile } from "@/lib/auth-client";
import { api, Batch, ProblemSetListItem } from "@/lib/api";
import { formatKstDateTime } from "@/lib/datetime";
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
import { getUsageSummary, UsageSummary } from "@/lib/saas";
import { subjectEngineLabel } from "@/lib/plan-pricing";
import {
  AcademyBilling,
  AcademyClass,
  AcademyLearningStudent,
  LearningAssignment,
  LearningAssignmentReport,
  confirmLearningAssignmentCompletion,
  createLearningAccessGrant,
  createLearningAssignment,
  getAcademyBilling,
  listAcademyClasses,
  listAcademyLearningAssignments,
  listAcademyLearningStudents,
  readLearningAssignmentReport,
} from "@/lib/academyStudent";
import {
  ClassCard,
  ScheduleEvent,
  createClass,
  createScheduleEvent,
  deleteScheduleEvent,
  getStudentManagementDashboard,
  listScheduleEvents,
} from "@/lib/studentManagement";

function resolveActiveAcademyId(profile?: AcademyProfile | null) {
  const activeWorkspaceId = getActiveWorkspaceId();
  if (activeWorkspaceId && activeWorkspaceId !== "student") return activeWorkspaceId;
  return profile?.account_type === "academy" ? profile.id : "";
}

type ProblemPage = { items: unknown[]; total: number; page: number; limit: number; pages: number };
type ProblemStats = { total: number; needs_review: number; tagged: number; untagged: number };
type ProblemFacets = { subjects: string[] };
type SubjectCount = { subject: string; count: number };
type LearningAssignmentSourceMode = "archive" | "manual";

function money(value?: number) {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function count(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

function percentLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function learningSubmissionStatusLabel(status: string) {
  if (status === "completed" || status === "submitted") return "완료";
  if (status === "late") return "지각 완료";
  if (status === "pending_confirmation") return "확인 대기";
  if (status === "in_progress") return "진행 중";
  if (status === "missing") return "미제출";
  if (status === "not_started") return "대기";
  return status;
}

function compactDate(value: string) {
  return formatKstDateTime(value, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function learningAssignmentWorkloadLabel(assignment: LearningAssignment) {
  const snapshot = assignment.content.snapshot;
  if (snapshot.problem_count > 0) return `${snapshot.problem_count}문항`;
  return snapshot.material_scope || "직접 입력 숙제";
}

function fileName(value: string | null) {
  if (!value) return "-";
  return value.split(/[\\/]/).pop() || value;
}

function progressPercent(batch: Batch) {
  if (batch.status === "done") return 100;
  if (typeof batch.progress_percent !== "number") return null;
  return Math.min(100, Math.max(0, Math.round(batch.progress_percent)));
}

function statusText(batch: Batch) {
  if (batch.progress_message) return batch.progress_message;
  if (batch.status === "pending") return "처리 대기 중";
  if (batch.status === "processing") return "문항 추출 중";
  if (batch.status === "error") return batch.failure_reason || "처리 실패";
  return "추출 완료";
}

function StageCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Card className="min-h-[360px] bg-white shadow-[0_14px_38px_rgba(0,0,0,0.04)]">
      <CardHeader className="flex-row items-center justify-between gap-3 p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-zinc-950">
          <Icon className="h-4 w-4 text-zinc-700" />
          {title}
        </CardTitle>
        <Link
          href={action.href}
          aria-label={action.label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] bg-zinc-100 text-zinc-700 transition hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function BatchLine({ batch, href }: { batch: Batch; href?: string }) {
  const progress = progressPercent(batch);
  const content = (
    <div className="rounded-[8px] bg-zinc-100 p-3 transition hover:bg-zinc-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-950">{batch.name}</div>
          <div className="mt-1 truncate text-xs text-zinc-500">{fileName(batch.problem_pdf_filename)}</div>
        </div>
        {progress !== null ? <span className="shrink-0 text-xs font-semibold text-zinc-700">{progress}%</span> : null}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-600">{statusText(batch)}</p>
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-black" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[8px] bg-zinc-100 px-3 py-4 text-sm font-semibold text-zinc-500">{children}</div>;
}

function remainingPercent(used: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, ((total - used) / total) * 100));
}

function remainingTone(percent: number) {
  if (percent <= 10) return "#737373";
  if (percent <= 25) return "#525252";
  return "#111111";
}

function formatUsageNumber(value: number, suffix = "") {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) >= 10_000) {
    const compact = new Intl.NumberFormat("ko-KR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safe);
    return `${compact}${suffix}`;
  }
  const rounded = safe >= 100 ? Math.round(safe) : Math.round(safe * 10) / 10;
  return `${rounded.toLocaleString("ko-KR")}${suffix}`;
}

function formatCapacityMb(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  if (safe >= 1024 * 1024) return formatUsageNumber(safe / (1024 * 1024), "TB");
  if (safe >= 1024) return formatUsageNumber(safe / 1024, "GB");
  return formatUsageNumber(safe, "MB");
}

function planNameFallback(plan?: string | null) {
  const labels: Record<string, string> = {
    free: "Free",
    basic: "Basic",
    pro: "Pro",
    enterprise: "Enterprise",
  };
  return labels[String(plan || "").toLowerCase()] || "Plan";
}

function planAuroraToneClass(plan?: string | null, name?: string | null) {
  const key = `${plan || ""} ${name || ""}`.toLowerCase();
  if (key.includes("enterprise") || key.includes("business")) return "plan-aurora-tone-enterprise";
  if (key.includes("pro")) return "plan-aurora-tone-pro";
  if (key.includes("basic") || key.includes("plus")) return "plan-aurora-tone-basic";
  if (key.includes("free")) return "plan-aurora-tone-free";
  return "plan-aurora-tone-trial";
}

function defaultStudentSeatLimit(plan?: string | null) {
  const key = String(plan || "").toLowerCase();
  if (key === "basic") return 5;
  if (key === "pro") return 10;
  return 0;
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function UsageRing({ label, used, total, ratio }: { label: string; used: number; total: number; ratio: string }) {
  const percent = remainingPercent(used, total);
  const tone = remainingTone(percent);
  return (
    <div className="grid min-h-[9rem] min-w-0 place-items-center rounded-[10px] bg-card/65 p-3 text-center shadow-none">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div
        className="relative mt-2 grid aspect-square w-full max-w-[6.75rem] place-items-center overflow-visible rounded-full p-[7px]"
        style={{
          background: `conic-gradient(${tone} ${percent * 3.6}deg, rgb(229 229 229) 0deg)`,
        }}
      >
        <div className="h-full w-full rounded-full bg-card" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center overflow-visible text-center">
          <span className="whitespace-nowrap text-lg font-black leading-none text-foreground">{Math.round(percent)}%</span>
          <span className="mt-1 max-w-[5.6rem] truncate whitespace-nowrap text-[10px] font-bold leading-none text-zinc-700 drop-shadow-[0_1px_5px_rgba(255,255,255,0.85)] dark:text-zinc-200 dark:drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)]">
            {ratio}
          </span>
        </div>
      </div>
    </div>
  );
}

function UsageOverview({
  summary,
  profile,
  billing,
}: {
  summary: UsageSummary | null;
  profile: AcademyProfile | null;
  billing: AcademyBilling | null;
}) {
  const planName = summary?.plan?.name || planNameFallback(profile?.plan);
  const planToneClass = planAuroraToneClass(summary?.plan?.code || profile?.plan, planName);
  const engines = summary ? summary.subscription?.enabled_subject_engines || summary.plan.enabled_subject_engines || ["math"] : ["math"];
  const subscription = summary?.subscription;
  const normalizedPlan = String(summary?.plan?.code || profile?.plan || "").toLowerCase();
  const hasAssignedPlan = !["", "free", "plan"].includes(normalizedPlan) || !["", "Free", "Trial", "Plan"].includes(planName);
  const remainingDays = daysUntil(profile?.trial_ends_at || profile?.plan_expires_at || null);
  const isTrial = subscription?.status === "trialing" || Boolean(profile?.plan_expires_at && profile?.plan && profile.plan !== "free");
  const planStatus = isTrial && remainingDays !== null ? `무료 체험 ${Math.max(remainingDays, 0)}일 남음` : subscription?.status === "active" || hasAssignedPlan ? "사용 중" : "플랜 미등록";
  const creditsUsed = summary?.extraction_credits_used ?? 0;
  const creditsLimit = summary?.monthly_credit_limit || summary?.plan?.monthly_ai_tokens || 0;
  const activeSeats = billing?.active_seats ?? 0;
  const assignedSeats = billing?.assigned_seats ?? 0;
  const seatLimit = billing?.unlimited_seats
    ? Math.max(activeSeats, assignedSeats, 1)
    : billing?.included_seats ?? defaultStudentSeatLimit(profile?.plan);
  const uploadMbUsed = summary?.uploaded_mb_this_month ?? 0;
  const uploadMbLimit = summary?.monthly_upload_mb_limit || 0;
  const storageUsed = summary?.storage_mb_used ?? 0;
  const storageLimit = summary?.plan?.storage_quota_mb || 0;
  const creditsRemaining = Math.max(creditsLimit - creditsUsed, 0);
  const uploadMbRemaining = Math.max(uploadMbLimit - uploadMbUsed, 0);
  const storageRemaining = Math.max(storageLimit - storageUsed, 0);

  return (
    <section className="rounded-[12px] bg-card/70 p-4 shadow-none">
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Link
          href="/billing"
          aria-label="결제 및 플랜 관리로 이동"
          className={`plan-aurora-surface plan-aurora-card ${planToneClass} group rounded-[10px] p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/60`}
        >
          <span className="plan-aurora__ribbon plan-aurora__ribbon--a" />
          <span className="plan-aurora__ribbon plan-aurora__ribbon--b" />
          <div className="relative z-10 text-2xl font-black text-foreground">{planName}</div>
          <div className={`plan-aurora-surface plan-aurora-badge ${planToneClass} relative z-10 mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-black backdrop-blur`}>
            <span className="plan-aurora__ribbon plan-aurora__ribbon--a" />
            <span className="plan-aurora__ribbon plan-aurora__ribbon--b" />
            <span className="relative z-10">{planStatus}</span>
          </div>
          <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
            {engines.map((engine) => (
              <span key={engine} className="rounded-full bg-background/70 px-2 py-1 text-[11px] font-semibold text-foreground shadow-none backdrop-blur">
                {subjectEngineLabel(engine)}
              </span>
            ))}
          </div>
        </Link>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UsageRing label="AI credits" used={creditsUsed} total={creditsLimit} ratio={`${formatUsageNumber(creditsRemaining)}/${formatUsageNumber(creditsLimit)}`} />
          <UsageRing
            label={"\ud65c\uc131 \uac00\ub2a5 \ud559\uc0dd"}
            used={billing?.unlimited_seats ? 0 : activeSeats}
            total={billing?.unlimited_seats ? 0 : seatLimit}
            ratio={billing?.unlimited_seats ? `${formatUsageNumber(activeSeats)}/무제한` : `${formatUsageNumber(Math.max(seatLimit - activeSeats, 0))}/${formatUsageNumber(seatLimit)}`}
          />
          <UsageRing label="업로드 용량" used={uploadMbUsed} total={uploadMbLimit} ratio={`${formatCapacityMb(uploadMbRemaining)}/${formatCapacityMb(uploadMbLimit)}`} />
          <UsageRing label="보관 용량" used={storageUsed} total={storageLimit} ratio={`${formatCapacityMb(storageRemaining)}/${formatCapacityMb(storageLimit)}`} />
        </div>
      </div>
    </section>
  );
}

function AcademyConsoleHome() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [problemStats, setProblemStats] = useState<ProblemStats>({ total: 0, needs_review: 0, tagged: 0, untagged: 0 });
  const [subjectCounts, setSubjectCounts] = useState<SubjectCount[]>([]);
  const [sets, setSets] = useState<ProblemSetListItem[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [billingSummary, setBillingSummary] = useState<AcademyBilling | null>(null);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const storedProfile = readStoredAuthProfile<AcademyProfile>();
    setProfile(storedProfile);

    async function loadBilling(profileId?: string | null) {
      if (!profileId) {
        if (!cancelled) setBillingSummary(null);
        return;
      }
      try {
        const billingData = await getAcademyBilling(profileId);
        if (!cancelled) setBillingSummary(billingData);
      } catch {
        if (!cancelled) setBillingSummary(null);
      }
    }

    async function loadProfile() {
      try {
        const freshProfile = await fetchMe();
        if (!cancelled) setProfile(freshProfile);
        await loadBilling(resolveActiveAcademyId(freshProfile));
      } catch {
        if (!cancelled && !storedProfile) setProfile(null);
        await loadBilling(resolveActiveAcademyId(storedProfile));
      }
    }

    async function loadBatches() {
      try {
        const batchData = await api<Batch[]>("/api/batches");
        if (cancelled) return;
        setBatches(batchData);
        setDataError("");
      } catch {
        if (!cancelled) {
          setDataError("콘솔 데이터를 불러오지 못했습니다.");
        }
      }
    }

    async function loadArchiveAndSets() {
      try {
        const [statsResult, facetsResult, setResult] = await Promise.allSettled([
          api<ProblemStats>("/api/problems/stats"),
          api<ProblemFacets>("/api/problems/facets"),
          api<ProblemSetListItem[]>("/api/problem-sets"),
        ]);

        const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
        const facets = facetsResult.status === "fulfilled" ? facetsResult.value : null;
        let nextSubjectCounts: SubjectCount[] | null = null;

        if (stats && facets) {
          const countResults = await Promise.allSettled(
            (facets.subjects || []).map(async (subject) => {
              const params = new URLSearchParams({ limit: "1" });
              params.append("subject", subject);
              const page = await api<ProblemPage>(`/api/problems?${params.toString()}`);
              return { subject, count: page.total };
            })
          );
          if (cancelled) return;
          if (countResults.every((result) => result.status === "fulfilled")) {
            const counts = countResults.map((result) => result.value);
            const sortedCounts = counts.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
            const classifiedTotal = sortedCounts.reduce((sum, item) => sum + item.count, 0);
            const uncategorized = Math.max(stats.total - classifiedTotal, 0);
            nextSubjectCounts = uncategorized > 0 ? [...sortedCounts, { subject: "과목 미분류", count: uncategorized }] : sortedCounts;
          }
        }

        if (cancelled) return;
        if (stats) setProblemStats(stats);
        if (nextSubjectCounts) setSubjectCounts(nextSubjectCounts);
        if (setResult.status === "fulfilled") setSets(setResult.value);
        if (statsResult.status === "rejected" && facetsResult.status === "rejected" && setResult.status === "rejected") {
          setDataError("콘솔 데이터를 불러오지 못했습니다.");
        } else {
          setDataError("");
        }
      } catch {
        if (!cancelled) {
          setDataError("콘솔 데이터를 불러오지 못했습니다.");
        }
      }
    }

    async function loadUsage() {
      try {
        const summary = await getUsageSummary();
        if (!cancelled) setUsageSummary(summary);
      } catch {
        if (!cancelled) setUsageSummary(null);
      }
    }

    async function loadConsole() {
      await Promise.all([loadProfile(), loadBatches(), loadArchiveAndSets()]);
      await loadUsage();
    }

    void loadConsole();
    const handleWorkspaceChange = () => {
      const currentProfile = readStoredAuthProfile<AcademyProfile>();
      void loadBilling(resolveActiveAcademyId(currentProfile));
      void loadBatches();
      void loadArchiveAndSets();
      void loadUsage();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
    const batchTimer = window.setInterval(() => void loadBatches(), 4000);
    const archiveTimer = window.setInterval(() => {
      void loadArchiveAndSets();
      void loadUsage();
    }, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
      window.clearInterval(batchTimer);
      window.clearInterval(archiveTimer);
    };
  }, []);

  const processingBatches = useMemo(() => batches.filter((batch) => batch.status === "processing"), [batches]);
  const pendingBatches = useMemo(() => batches.filter((batch) => batch.status === "pending"), [batches]);
  const reviewBatches = useMemo(
    () => batches.filter((batch) => batch.review_count > 0).sort((a, b) => b.review_count - a.review_count),
    [batches]
  );
  const recentSets = useMemo(() => sets.slice(0, 5), [sets]);

  return (
    <div className="space-y-5">
      <UsageOverview summary={usageSummary} profile={profile} billing={billingSummary} />
      {dataError ? <p className="rounded-[8px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">{dataError}</p> : null}

      <section className="grid gap-4 xl:grid-cols-4">
        <StageCard title="추출" icon={ScanText} action={{ href: "/archive/new", label: "새 추출" }}>
          <div>
            <div className="mb-2 text-xs font-semibold text-zinc-600">현재 추출 중</div>
            <div className="space-y-2">
              {processingBatches.length ? processingBatches.map((batch) => <BatchLine key={batch.id} batch={batch} />) : <EmptyState>진행 중인 배치가 없습니다.</EmptyState>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-zinc-600">추출 대기</div>
            <div className="space-y-2">
              {pendingBatches.length ? pendingBatches.map((batch) => <BatchLine key={batch.id} batch={batch} />) : <EmptyState>대기 중인 배치가 없습니다.</EmptyState>}
            </div>
          </div>
        </StageCard>

        <StageCard title="문항 확인" icon={Archive} action={{ href: "/problems?needs_review=true", label: "문항 보기" }}>
          <div className="rounded-[8px] bg-zinc-100 p-3">
            <div className="text-xs font-semibold text-zinc-500">검토 대기 문항</div>
            <div className="mt-1 text-2xl font-black text-zinc-950">{count(problemStats.needs_review)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-zinc-600">검토 대기 배치</div>
            <div className="space-y-2">
              {reviewBatches.length ? (
                reviewBatches.map((batch) => (
                  <Link
                    key={batch.id}
                    href={`/problems?batch_id=${batch.id}&needs_review=true`}
                    className="flex items-center justify-between gap-3 rounded-[8px] bg-zinc-100 p-3 transition hover:bg-zinc-200"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-950">{batch.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{compactDate(batch.created_at)}</div>
                    </div>
                    <Badge variant="warning" className="shrink-0">검토 {count(batch.review_count)}</Badge>
                  </Link>
                ))
              ) : (
                <EmptyState>검토 대기 중인 배치가 없습니다.</EmptyState>
              )}
            </div>
          </div>
        </StageCard>

        <StageCard title="보관" icon={Archive} action={{ href: "/problems", label: "문항 보기" }}>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[8px] bg-zinc-100 p-3">
              <div className="text-xs font-semibold text-zinc-500">전체</div>
              <div className="mt-1 text-lg font-black text-zinc-950">{count(problemStats.total)}</div>
            </div>
            <div className="rounded-[8px] bg-zinc-100 p-3">
              <div className="text-xs font-semibold text-zinc-500">태그</div>
              <div className="mt-1 text-lg font-black text-zinc-950">{count(problemStats.tagged)}</div>
            </div>
            <div className="rounded-[8px] bg-zinc-100 p-3">
              <div className="text-xs font-semibold text-zinc-500">미분류</div>
              <div className="mt-1 text-lg font-black text-zinc-950">{count(problemStats.untagged)}</div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-zinc-600">과목별 문항 수</div>
            <div className="space-y-2">
              {subjectCounts.length ? (
                subjectCounts.map((item) => (
                  <div key={item.subject} className="rounded-[8px] bg-zinc-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-zinc-950">{item.subject}</span>
                      <span className="text-sm font-semibold text-zinc-700">{count(item.count)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-black" style={{ width: `${problemStats.total ? Math.max(4, (item.count / problemStats.total) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState>아직 과목 태그가 없습니다.</EmptyState>
              )}
            </div>
          </div>
        </StageCard>

        <StageCard title="세트 제작" icon={PackageCheck} action={{ href: "/problem-sets", label: "세트 열기" }}>
          <div className="rounded-[8px] bg-zinc-100 p-3">
            <div className="text-xs font-semibold text-zinc-500">제작된 세트</div>
            <div className="mt-1 text-2xl font-black text-zinc-950">{count(sets.length)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-zinc-600">최근 세트</div>
            <div className="space-y-2">
              {recentSets.length ? (
                recentSets.map((set) => (
                  <Link
                    key={set.id}
                    href={`/problem-sets/${set.id}`}
                    className="flex items-center justify-between gap-3 rounded-[8px] bg-zinc-100 p-3 transition hover:bg-zinc-200"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-950">{set.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{compactDate(set.created_at)}</div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-zinc-700">{count(set.item_count)}</span>
                  </Link>
                ))
              ) : (
                <EmptyState>아직 제작된 세트가 없습니다.</EmptyState>
              )}
            </div>
          </div>
        </StageCard>
      </section>
    </div>
  );
}

function AcademyOperationsPanel() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [problemSets, setProblemSets] = useState<ProblemSetListItem[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [learningStudents, setLearningStudents] = useState<AcademyLearningStudent[]>([]);
  const [learningAssignments, setLearningAssignments] = useState<LearningAssignment[]>([]);
  const [learningReport, setLearningReport] = useState<LearningAssignmentReport | null>(null);
  const [confirmingLearningStudentId, setConfirmingLearningStudentId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [learningAssignmentTitle, setLearningAssignmentTitle] = useState("");
  const [learningAssignmentDueAt, setLearningAssignmentDueAt] = useState("");
  const [learningAssignmentSourceMode, setLearningAssignmentSourceMode] = useState<LearningAssignmentSourceMode>(
    searchParams.get("source_type") === "manual" ? "manual" : "archive"
  );
  const [manualMaterialTitle, setManualMaterialTitle] = useState("");
  const [manualMaterialScope, setManualMaterialScope] = useState("");
  const [selectedLearningSourceType, setSelectedLearningSourceType] = useState<"problemSet" | "archive">(
    searchParams.get("source_type") === "archive" || searchParams.get("source_type") === "batch" ? "archive" : "problemSet"
  );
  const [selectedProblemSetId, setSelectedProblemSetId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState(
    searchParams.get("source_type") === "archive" || searchParams.get("source_type") === "batch" ? searchParams.get("source_id") || "" : ""
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const academyId = activeWorkspaceId && activeWorkspaceId !== "student" ? activeWorkspaceId : resolveActiveAcademyId(profile);

  async function load(id = academyId) {
    if (!id) return;
    const [classResult, setResult, batchResult, studentResult, learningAssignmentResult] = await Promise.allSettled([
      listAcademyClasses(id),
      api<ProblemSetListItem[]>("/api/problem-sets"),
      api<Batch[]>("/api/batches"),
      listAcademyLearningStudents(id),
      listAcademyLearningAssignments(id),
    ]);
    const classData = classResult.status === "fulfilled" ? classResult.value : null;
    const setData = setResult.status === "fulfilled" ? setResult.value : null;
    const batchData = batchResult.status === "fulfilled" ? batchResult.value : null;
    const studentData = studentResult.status === "fulfilled" ? studentResult.value : null;
    const learningAssignmentData = learningAssignmentResult.status === "fulfilled" ? learningAssignmentResult.value : null;
    if (classData) setClasses(classData);
    if (setData) setProblemSets(setData);
    if (batchData) setBatches(batchData);
    if (studentData) setLearningStudents(studentData);
    if (learningAssignmentData) setLearningAssignments(learningAssignmentData);
    if (!selectedProblemSetId && setData?.[0]) {
      setSelectedProblemSetId(setData[0].id);
      if (learningAssignmentSourceMode === "archive" && selectedLearningSourceType === "problemSet" && !learningAssignmentTitle.trim()) setLearningAssignmentTitle(setData[0].name);
    }
    if (!selectedBatchId && batchData) {
      const requestedSourceId = searchParams.get("source_id");
      const requestedBatch = requestedSourceId ? batchData.find((batch) => batch.id === requestedSourceId) : null;
      const fallbackBatch = batchData.find((batch) => batch.status === "done" && batch.problem_count > 0);
      const nextBatch = requestedBatch || fallbackBatch;
      if (nextBatch) setSelectedBatchId(nextBatch.id);
      if (learningAssignmentSourceMode === "archive" && nextBatch && selectedLearningSourceType === "archive" && !learningAssignmentTitle.trim()) setLearningAssignmentTitle(nextBatch.name);
    }
    setError((current) => current === "학원 운영 정보를 불러오지 못했습니다." ? "" : current);
  }

  useEffect(() => {
    const stored = readStoredAuthProfile<AcademyProfile>();
    setProfile(stored);
    const syncWorkspace = () => {
      const currentProfile = readStoredAuthProfile<AcademyProfile>();
      setProfile(currentProfile);
      setActiveWorkspaceIdState(getActiveWorkspaceId());
      const id = resolveActiveAcademyId(currentProfile);
      if (id) void load(id);
    };
    syncWorkspace();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, syncWorkspace);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, syncWorkspace);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial academy load runs once; mutations call load explicitly.
  }, []);

  const assignableBatches = useMemo(() => batches.filter((batch) => batch.status === "done" && batch.problem_count > 0), [batches]);
  const archiveAssignmentSources = useMemo(
    () => [
      ...problemSets.map((set) => ({
        value: `problemSet:${set.id}`,
        sourceType: "problemSet" as const,
        sourceId: set.id,
        title: set.name,
        detail: `${set.item_count}문항`,
      })),
      ...assignableBatches.map((batch) => ({
        value: `archive:${batch.id}`,
        sourceType: "archive" as const,
        sourceId: batch.id,
        title: batch.name,
        detail: `${batch.problem_count}문항`,
      })),
    ],
    [assignableBatches, problemSets]
  );
  const selectedProblemSet = useMemo(() => problemSets.find((set) => set.id === selectedProblemSetId) || null, [problemSets, selectedProblemSetId]);
  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) || null, [batches, selectedBatchId]);
  const selectedArchiveSourceValue = selectedLearningSourceType === "archive" ? `archive:${selectedBatchId}` : `problemSet:${selectedProblemSetId}`;
  const selectedLearningSourceId = learningAssignmentSourceMode === "manual" ? "" : selectedLearningSourceType === "archive" ? selectedBatchId : selectedProblemSetId;
  const learningTargetCount = selectedGroupIds.length + selectedStudentIds.length;
  const manualLearningSourceReady = Boolean(manualMaterialTitle.trim() && manualMaterialScope.trim());
  const canPublishLearningAssignment = Boolean(
    academyId &&
    learningAssignmentTitle.trim() &&
    learningTargetCount > 0 &&
    (learningAssignmentSourceMode === "manual" ? manualLearningSourceReady : selectedLearningSourceId)
  );
  const selectedGroupNames = useMemo(
    () => classes.filter((group) => selectedGroupIds.includes(group.id)).map((group) => group.name),
    [classes, selectedGroupIds]
  );
  const selectedStudentNames = useMemo(
    () => learningStudents.filter((student) => selectedStudentIds.includes(student.student_user_id)).map((student) => student.student_name),
    [learningStudents, selectedStudentIds]
  );
  const visibleLearningStudents = useMemo(() => {
    if (!selectedGroupIds.length) return learningStudents;
    const selectedGroupStudents = learningStudents.filter((student) => student.groups.some((group) => selectedGroupIds.includes(group.id)));
    const visibleIds = new Set(selectedGroupStudents.map((student) => student.student_user_id));
    const selectedOtherStudents = learningStudents.filter(
      (student) => selectedStudentIds.includes(student.student_user_id) && !visibleIds.has(student.student_user_id)
    );
    return [...selectedGroupStudents, ...selectedOtherStudents];
  }, [learningStudents, selectedGroupIds, selectedStudentIds]);
  if (!academyId && profile?.account_type === "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] border border-zinc-300/20 bg-zinc-300/[0.045] p-6 text-center">
        <h1 className="text-xl font-bold text-white">학생 계정에서는 Student App을 사용합니다</h1>
        <a href="/student" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Student App으로 이동
        </a>
      </div>
    );
  }

  function selectArchiveLearningSource(value: string) {
    const [sourceType, sourceId] = value.split(":");
    if (sourceType === "archive") {
      setSelectedLearningSourceType("archive");
      setSelectedBatchId(sourceId || "");
    } else {
      setSelectedLearningSourceType("problemSet");
      setSelectedProblemSetId(sourceId || "");
    }
    const source = archiveAssignmentSources.find((item) => item.value === value);
    if (!learningAssignmentTitle.trim() && source) setLearningAssignmentTitle(source.title);
  }

  function updateManualMaterialTitle(value: string) {
    setManualMaterialTitle(value);
    if (!learningAssignmentTitle.trim()) setLearningAssignmentTitle(value);
  }

  function updateManualMaterialScope(value: string) {
    setManualMaterialScope(value);
  }

  function assignmentDueAtIso() {
    if (!learningAssignmentDueAt) return null;
    return new Date(`${learningAssignmentDueAt}T23:59:00+09:00`).toISOString();
  }

  async function submitLearningAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!academyId || !learningAssignmentTitle.trim()) return;
    const isManualSource = learningAssignmentSourceMode === "manual";
    const sourceId = isManualSource ? `manual-${Date.now()}` : selectedLearningSourceId || (selectedLearningSourceType === "archive" ? assignableBatches[0]?.id : problemSets[0]?.id);
    if (!sourceId) {
      setError("먼저 배포할 아카이브 자료를 선택해주세요.");
      return;
    }
    if (isManualSource && (!manualMaterialTitle.trim() || !manualMaterialScope.trim())) {
      setError("교재·인강 이름과 분량을 모두 입력해주세요.");
      return;
    }
    if (!learningTargetCount) {
      setError("과제를 받을 반 또는 학생을 선택해주세요.");
      return;
    }
    const created = await createLearningAssignment(academyId, {
      title: learningAssignmentTitle.trim(),
      description: isManualSource
        ? `교재·인강: ${manualMaterialTitle.trim()}\n분량: ${manualMaterialScope.trim()}`
        : "아카이브 자료를 기반으로 생성한 학생 풀이 과제입니다.",
      source_type: isManualSource ? "manual" : selectedLearningSourceType,
      source_id: sourceId,
      manual_material_title: isManualSource ? manualMaterialTitle.trim() : null,
      manual_material_scope: isManualSource ? manualMaterialScope.trim() : null,
      group_ids: selectedGroupIds,
      student_ids: selectedStudentIds,
      due_at: assignmentDueAtIso(),
      status: "published",
    });
    setLearningAssignmentTitle("");
    setLearningAssignmentDueAt("");
    if (isManualSource) {
      setManualMaterialTitle("");
      setManualMaterialScope("");
    }
    setNotice("학생 풀이 과제를 배포했습니다. 학생 Today 화면에 표시됩니다.");
    setLearningReport(await readLearningAssignmentReport(academyId, created.id));
    await load();
  }

  async function grantSelectedArchiveAccess() {
    if (!academyId) return;
    setError("");
    if (learningAssignmentSourceMode === "manual") {
      setError("직접 입력 숙제에는 접근 권한을 부여할 아카이브 자료가 없습니다.");
      return;
    }
    const sourceId = selectedLearningSourceId || (selectedLearningSourceType === "archive" ? assignableBatches[0]?.id : problemSets[0]?.id);
    if (!sourceId) {
      setError("권한을 부여할 문항 세트 또는 배치를 선택해주세요.");
      return;
    }
    if (!learningTargetCount) {
      setError("접근 권한을 받을 반 또는 학생을 선택해주세요.");
      return;
    }
    const commonPayload = {
      source_type: selectedLearningSourceType,
      source_id: sourceId,
      can_solve_freely: true,
      can_save_to_my_archive: true,
      can_see_answer_immediately: false,
      can_see_solution: false,
    };
    await Promise.all([
      ...selectedGroupIds.map((groupId) => createLearningAccessGrant(academyId, { ...commonPayload, group_id: groupId, student_id: null })),
      ...selectedStudentIds.map((studentId) => createLearningAccessGrant(academyId, { ...commonPayload, group_id: null, student_id: studentId })),
    ]);
    setNotice("아카이브 접근 권한을 부여했습니다. 학생 Archive 화면에서 확인할 수 있습니다.");
    await load();
  }

  async function openLearningReport(assignment: LearningAssignment) {
    if (!academyId) return;
    setLearningReport(await readLearningAssignmentReport(academyId, assignment.id));
  }

  async function confirmLearningCompletion(studentId: string) {
    if (!academyId || !learningReport) return;
    const key = `${learningReport.assignment.id}:${studentId}`;
    setConfirmingLearningStudentId(key);
    try {
      await confirmLearningAssignmentCompletion(academyId, learningReport.assignment.id, studentId);
      setLearningReport(await readLearningAssignmentReport(academyId, learningReport.assignment.id));
      setNotice("학생 완료 체크를 최종 완료로 확정했습니다.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "과제 완료 확정에 실패했습니다.");
    } finally {
      setConfirmingLearningStudentId("");
    }
  }

  if (!profile) {
    return <div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-6">로그인이 필요합니다.</div>;
  }

  return (
    <div className="space-y-6">
      {(notice || error) && (
        <div className="rounded-[12px] border border-zinc-300/20 bg-zinc-400/[0.08] p-4 text-sm">
          {notice && <div className="text-zinc-100">{notice}</div>}
          {error && <div className="text-zinc-300">{error}</div>}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" /> 새 과제 배포</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                    {[
                      { value: "archive", label: "아카이브 자료" },
                      { value: "manual", label: "교재·인강 직접 입력" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLearningAssignmentSourceMode(option.value as LearningAssignmentSourceMode)}
                        className={`h-11 rounded-[8px] border px-3 text-sm font-bold transition ${
                          learningAssignmentSourceMode === option.value
                            ? "border-zinc-300/60 bg-zinc-500 text-white shadow-[0_12px_30px_rgba(124,58,237,0.22)]"
                            : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {learningAssignmentSourceMode === "archive" ? (
                    <select
                      className="h-11 w-full rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white"
                      value={selectedArchiveSourceValue}
                      onChange={(event) => selectArchiveLearningSource(event.target.value)}
                    >
                      <option value="">아카이브 자료 선택</option>
                      {archiveAssignmentSources.map((source) => (
                        <option key={source.value} value={source.value}>{source.title} · {source.detail}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <Input
                        value={manualMaterialTitle}
                        onChange={(event) => updateManualMaterialTitle(event.target.value)}
                        placeholder="교재 또는 인강 이름"
                      />
                      <Input
                        value={manualMaterialScope}
                        onChange={(event) => updateManualMaterialScope(event.target.value)}
                        placeholder="분량 예: p.32-39, 3강, 1~20번"
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-bold text-white">반 선택</div>
                    <div className="flex max-h-44 flex-wrap gap-2 overflow-auto rounded-[8px] border border-white/10 bg-black/20 p-2">
                      {classes.length ? classes.map((group) => {
                        const selected = selectedGroupIds.includes(group.id);
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => setSelectedGroupIds((current) => toggleId(current, group.id))}
                            className={`rounded-[7px] border px-3 py-2 text-sm font-semibold transition ${
                              selected ? "border-zinc-300/60 bg-zinc-500/80 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20"
                            }`}
                          >
                            {group.name}
                          </button>
                        );
                      }) : <span className="p-2 text-sm text-muted-foreground">등록된 반이 없습니다.</span>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-white">{selectedGroupIds.length ? "선택한 반 학생" : "학생 선택"}</span>
                      {selectedGroupIds.length ? <span className="text-xs font-semibold text-slate-500">{visibleLearningStudents.length}명</span> : null}
                    </div>
                    <div className="flex max-h-44 flex-wrap gap-2 overflow-auto rounded-[8px] border border-white/10 bg-black/20 p-2">
                      {visibleLearningStudents.length ? visibleLearningStudents.map((student) => {
                        const selected = selectedStudentIds.includes(student.student_user_id);
                        return (
                          <button
                            key={student.student_user_id}
                            type="button"
                            onClick={() => setSelectedStudentIds((current) => toggleId(current, student.student_user_id))}
                            className={`min-w-[8rem] rounded-[7px] border px-3 py-2 text-left text-sm font-semibold transition ${
                              selected ? "border-zinc-300/60 bg-zinc-500/75 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20"
                            }`}
                          >
                            <span className="block truncate">{student.student_name}</span>
                            <span className="mt-1 block truncate text-[11px] font-medium text-slate-500">
                              {student.groups.map((group) => group.name).join(", ") || "반 없음"}
                            </span>
                          </button>
                        );
                      }) : (
                        <span className="p-2 text-sm text-muted-foreground">
                          {selectedGroupIds.length ? "선택한 반에 연결된 학생이 없습니다." : "등록된 학생이 없습니다."}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-300">
                  <span className="font-bold text-white">선택 대상 {learningTargetCount}개</span>
                  <span className="ml-2 text-slate-500">
                    {[...selectedGroupNames, ...selectedStudentNames].join(", ") || "반 또는 학생을 선택해주세요."}
                  </span>
                </div>

                <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]" onSubmit={submitLearningAssignment}>
                  <Input value={learningAssignmentTitle} onChange={(event) => setLearningAssignmentTitle(event.target.value)} placeholder="학생 풀이 과제 제목" />
                  <Input type="date" value={learningAssignmentDueAt} onChange={(event) => setLearningAssignmentDueAt(event.target.value)} />
                  <Button type="submit" disabled={!canPublishLearningAssignment}>
                    <BookOpenCheck className="h-4 w-4" />
                    즉시 배포
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> 접근 권한</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-muted-foreground">과제 없이 아카이브 자료만 열람·자유풀이할 수 있게 할 때 사용합니다. 직접 입력 숙제에는 적용되지 않습니다.</p>
                <Button type="button" variant="outline" onClick={grantSelectedArchiveAccess} disabled={learningAssignmentSourceMode === "manual" || !selectedLearningSourceId || !learningTargetCount}>
                  <ShieldCheck className="h-4 w-4" />
                  접근 권한 부여
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LineChart className="h-5 w-5" /> 과제 현황</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {learningAssignments.length ? learningAssignments.map((assignment) => (
                  <button key={assignment.id} onClick={() => openLearningReport(assignment)} className="w-full rounded-[10px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-zinc-300/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{assignment.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {learningAssignmentWorkloadLabel(assignment)} · {assignment.status}{assignment.due_at ? ` · 마감 ${compactDate(assignment.due_at)}` : ""}
                        </div>
                      </div>
                      <LineChart className="h-4 w-4 shrink-0 text-zinc-200" />
                    </div>
                  </button>
                )) : <p className="text-sm text-muted-foreground">아직 배포한 학습 과제가 없습니다.</p>}
              </CardContent>
            </Card>

            {learningReport ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> 제출 리포트</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="font-semibold text-white">{learningReport.assignment.title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      대상 {learningReport.summary.target_count} · 완료 {learningReport.summary.submitted_count} · 확인 대기 {learningReport.summary.pending_confirmation_count || 0} · 미제출 {learningReport.summary.missing_count}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-slate-500">완료율</p>
                      <p className="mt-1 text-xl font-black text-white">{percentLabel(learningReport.summary.completion_rate)}</p>
                    </div>
                    <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-slate-500">평균</p>
                      <p className="mt-1 text-xl font-black text-white">{learningReport.summary.average_score ?? "-"}</p>
                    </div>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {learningReport.students.map((student) => (
                      <div key={student.student_id} className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{student.student_name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={student.status === "pending_confirmation" ? "text-zinc-200" : "text-slate-400"}>{learningSubmissionStatusLabel(student.status)}</span>
                          {student.status === "pending_confirmation" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => confirmLearningCompletion(student.student_id)}
                              disabled={confirmingLearningStudentId === `${learningReport.assignment.id}:${student.student_id}`}
                            >
                              확정
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground">과제를 선택하면 제출 현황이 여기에 표시됩니다.</CardContent>
              </Card>
            )}
          </div>
        </div>
    </div>
  );
}

function academyDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function academyAddDays(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function academyStartOfWeek(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function academyStartOfMonthGrid(value: Date) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  return academyStartOfWeek(firstDay);
}

function academyMonthDays(value: Date) {
  const start = academyStartOfMonthGrid(value);
  return Array.from({ length: 42 }, (_, index) => academyAddDays(start, index));
}

function academyScheduleRange(value: Date) {
  const days = academyMonthDays(value);
  return {
    start_date: academyDateKey(days[0] || academyStartOfMonthGrid(value)),
    end_date: academyDateKey(days[days.length - 1] || value),
  };
}

function academyMonthTitle(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(value);
}

function academyTimeLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function academyEventTypeLabel(value: string) {
  const labels: Record<string, string> = {
    class: "수업",
    homework: "과제",
    test: "시험",
    review: "복습",
    mock_exam: "모의고사",
    other: "기타",
  };
  return labels[value] || value;
}

function AcademySchedulePanel() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    class_id: "",
    title: "",
    event_type: "class",
    date: academyDateKey(new Date()),
    starts_at: "16:00",
    ends_at: "18:00",
    recurrence_unit: "none" as ScheduleRecurrenceUnit,
    recurrence_interval: "1",
    recurrence_weekdays: [] as number[],
    recurrence_month_day: "",
    repeat_until: "",
    description: "",
  });

  const load = useCallback(async function load() {
    setLoading(true);
    try {
      const dashboard = await getStudentManagementDashboard();
      setClasses(dashboard.classes);
      setForm((current) => ({ ...current, class_id: current.class_id || dashboard.classes[0]?.id || "" }));
      try {
        const schedule = await listScheduleEvents(academyScheduleRange(monthCursor));
        setEvents(schedule);
        setError("");
      } catch {
        const fallbackSchedule = dashboard.classes.flatMap((classRow) => classRow.schedule_events || []);
        setEvents(fallbackSchedule);
        setError("시간표를 불러오지 못했습니다. 클래스 정보에 포함된 일정만 표시합니다.");
      }
    } catch {
      setError("시간표를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [monthCursor]);

  useEffect(() => {
    const syncWorkspace = () => {
      setProfile(readStoredAuthProfile<AcademyProfile>());
      setActiveWorkspaceIdState(getActiveWorkspaceId());
    };
    syncWorkspace();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, syncWorkspace);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, syncWorkspace);
    };
  }, []);

  useEffect(() => {
    void load();
  }, [activeWorkspaceId, load]);

  const classById = useMemo(() => new Map(classes.map((classRow) => [classRow.id, classRow])), [classes]);
  const monthDays = useMemo(() => academyMonthDays(monthCursor), [monthCursor]);
  const monthEvents = useMemo(() => {
    const start = monthDays[0]?.getTime() || academyStartOfMonthGrid(monthCursor).getTime();
    const end = academyAddDays(monthDays[monthDays.length - 1] || monthCursor, 1).getTime();
    return events
      .filter((event) => {
        const time = new Date(event.starts_at).getTime();
        return time >= start && time < end;
      })
      .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
  }, [events, monthCursor, monthDays]);
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, ScheduleEvent[]> = {};
    for (const event of monthEvents) {
      const key = academyDateKey(event.starts_at);
      grouped[key] = [...(grouped[key] || []), event];
    }
    return grouped;
  }, [monthEvents]);
  const studentCount = useMemo(() => classes.reduce((sum, classRow) => sum + classRow.student_count, 0), [classes]);
  const academyStartDateTime = `${form.date}T${form.starts_at || "00:00"}`;
  const academySelectedWeekdays = form.recurrence_weekdays.length ? form.recurrence_weekdays : [defaultWeekdayFromDateTime(academyStartDateTime)];
  const academySelectedMonthDay = Number(form.recurrence_month_day) || defaultMonthDayFromDateTime(academyStartDateTime);

  useEffect(() => {
    if (!classes.length) return;
    setForm((current) => {
      if (current.class_id && classes.some((classRow) => classRow.id === current.class_id)) return current;
      return { ...current, class_id: classes[0].id };
    });
  }, [classes]);

  const academyModeActive = Boolean(activeWorkspaceId && activeWorkspaceId !== "student") || profile?.account_type === "academy";

  if (!academyModeActive && profile?.account_type === "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] border border-zinc-300/20 bg-zinc-300/[0.045] p-6 text-center">
        <h1 className="text-xl font-bold text-white">학생 계정에서는 Student App을 사용합니다.</h1>
        <a href="/student" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Student App
        </a>
      </div>
    );
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scheduleTitle = form.title.trim();
    if (!scheduleTitle) {
      setError("일정명을 입력해주세요.");
      return;
    }
    if (!form.date || !form.starts_at) {
      setError("일정 날짜와 시작 시간을 입력해주세요.");
      return;
    }
    setSaving(true);
    setNotice("");
    setError("");
    try {
      let targetClassId = classes.some((classRow) => classRow.id === form.class_id) ? form.class_id : "";
      let autoCreatedClass = false;
      if (!targetClassId) {
        const createdClass = await createClass({ name: scheduleTitle });
        targetClassId = createdClass.id;
        autoCreatedClass = true;
        setClasses((current) => [createdClass, ...current.filter((classRow) => classRow.id !== createdClass.id)]);
      }
      const startDateTime = `${form.date}T${form.starts_at}:00`;
      const endOffset = form.ends_at ? new Date(`${form.date}T${form.ends_at}:00`).getTime() - new Date(startDateTime).getTime() : null;
      const starts = buildRecurringDateTimes(startDateTime, {
        unit: form.recurrence_unit,
        interval: Number(form.recurrence_interval) || 1,
        weekdays: academySelectedWeekdays,
        monthDay: academySelectedMonthDay,
        until: form.repeat_until,
        maxOccurrences: 160,
      });
      for (const start of starts) {
        const end = endOffset && endOffset > 0 ? localDateTimeInputValue(new Date(new Date(start).getTime() + endOffset)) : null;
        await createScheduleEvent({
          class_id: targetClassId,
          title: scheduleTitle,
          description: form.description.trim() || null,
          event_type: form.event_type,
          starts_at: start,
          ends_at: end,
        });
      }
      if (autoCreatedClass) {
        setNotice(starts.length > 1 ? `클래스 "${scheduleTitle}" 생성, ${starts.length}개 일정 저장됨` : `클래스 "${scheduleTitle}" 생성 및 일정 저장됨`);
      } else {
        setNotice(starts.length > 1 ? `${starts.length}개 일정 저장됨` : "저장됨");
      }
      setForm((current) => ({ ...current, class_id: targetClassId, title: "", description: "" }));
      setFormOpen(false);
      await load();
    } catch {
      setError("일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAcademyRecurrenceWeekday(day: number) {
    setForm((current) => {
      const base = current.recurrence_weekdays.length ? current.recurrence_weekdays : [defaultWeekdayFromDateTime(`${current.date}T${current.starts_at || "00:00"}`)];
      return {
        ...current,
        recurrence_weekdays: base.includes(day) ? base.filter((item) => item !== day) : [...base, day].sort((left, right) => left - right),
      };
    });
  }

  async function removeEvent(eventId: string) {
    setError("");
    try {
      await deleteScheduleEvent(eventId);
      setEvents((current) => current.filter((event) => event.id !== eventId));
    } catch {
      setError("일정을 삭제하지 못했습니다.");
    }
  }

  return (
    <div className="relative space-y-4">
      {(notice || error) ? (
        <div className="rounded-[10px] bg-zinc-100 px-4 py-3 text-sm font-semibold">
          {notice ? <span className="text-zinc-800">{notice}</span> : null}
          {error ? <span className="text-zinc-700">{error}</span> : null}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <Card className="bg-white shadow-[0_14px_38px_rgba(0,0,0,0.04)]">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-zinc-950">
                <CalendarDays className="h-5 w-5 text-zinc-700" />
                클래스 시간표
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" size="icon" variant="outline" onClick={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="이전 달">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-36 text-center text-sm font-black text-zinc-950">{academyMonthTitle(monthCursor)}</div>
                <Button type="button" size="icon" variant="outline" onClick={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="다음 달">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex min-h-[560px] items-center justify-center text-zinc-500">불러오는 중</div>
            ) : (
              <>
              <div className="overflow-hidden rounded-[10px] bg-zinc-100">
              <div>
                <div className="grid grid-cols-7 bg-zinc-100">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <div key={day} className="px-2 py-2 text-xs font-bold text-zinc-500">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-zinc-200">
                  {monthDays.map((day) => {
                    const key = academyDateKey(day);
                    const dayEvents = eventsByDate[key] || [];
                    const inMonth = day.getMonth() === monthCursor.getMonth();
                    const isToday = key === academyDateKey(new Date());
                    return (
                      <div key={key} className={`min-h-[118px] p-2 ${inMonth ? "bg-white" : "bg-zinc-50 text-zinc-400"}`}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className={`grid h-6 min-w-6 place-items-center rounded-full text-xs font-black ${isToday ? "bg-black text-white" : inMonth ? "text-zinc-950" : "text-zinc-400"}`}>
                            {day.getDate()}
                          </span>
                          {dayEvents.length ? <span className="hidden text-[10px] font-bold text-zinc-500 sm:inline">{dayEvents.length}</span> : null}
                        </div>
                        <div className="space-y-1.5">
                          {dayEvents.slice(0, 3).map((event) => {
                            const classRow = classById.get(event.class_id);
                            return (
                              <div key={event.id} className="group relative rounded-[6px] bg-zinc-100 px-1.5 py-1.5 sm:px-2">
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-[10px] font-black text-zinc-950 sm:text-[11px]">{event.title}</p>
                                    <p className="hidden truncate text-[10px] text-zinc-600 sm:block">{academyTimeLabel(event.starts_at)} · {classRow?.name || "클래스"}</p>
                                  </div>
                                  <button type="button" onClick={() => removeEvent(event.id)} className="absolute right-1 top-1 hidden rounded p-0.5 text-zinc-400 opacity-0 transition hover:bg-white hover:text-zinc-950 group-hover:opacity-100 sm:block" aria-label="삭제">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 ? <div className="rounded-[6px] bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">+{dayEvents.length - 3}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
              {monthEvents.length ? (
                <div className="mt-3 space-y-2 sm:hidden">
                  {monthEvents.slice(0, 6).map((event) => {
                    const classRow = classById.get(event.class_id);
                    return (
                      <div key={event.id} className="rounded-[8px] bg-zinc-100 px-3 py-2 text-sm">
                        <p className="truncate font-black text-zinc-950">{event.title}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-zinc-600">{academyTimeLabel(event.starts_at)} · {classRow?.name || "클래스"}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-3">
          <Card className="bg-white shadow-[0_14px_38px_rgba(0,0,0,0.04)]">
            <CardContent className="grid grid-cols-3 gap-2 p-3 xl:grid-cols-1">
              <div className="rounded-[8px] bg-zinc-100 p-3">
                <p className="text-[11px] font-semibold text-zinc-500">클래스</p>
                <p className="mt-1 text-xl font-black text-zinc-950">{classes.length}</p>
              </div>
              <div className="rounded-[8px] bg-zinc-100 p-3">
                <p className="text-[11px] font-semibold text-zinc-500">학생</p>
                <p className="mt-1 text-xl font-black text-zinc-950">{studentCount}</p>
              </div>
              <div className="rounded-[8px] bg-zinc-100 p-3">
                <p className="text-[11px] font-semibold text-zinc-500">이번 달</p>
                <p className="mt-1 text-xl font-black text-zinc-950">{monthEvents.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-[0_14px_38px_rgba(0,0,0,0.04)]">
            <CardContent className="space-y-2 p-3">
              {classes.map((classRow) => (
                <div key={classRow.id} className="flex items-center justify-between rounded-[8px] bg-zinc-100 px-3 py-2 text-sm">
                  <span className="truncate font-semibold text-zinc-950">{classRow.name}</span>
                  <span className="text-zinc-500">{classRow.student_count}명</span>
                </div>
              ))}
              {!classes.length ? <div className="rounded-[8px] bg-zinc-100 p-3 text-sm font-semibold text-zinc-500">클래스 없음</div> : null}
            </CardContent>
          </Card>
        </aside>
      </section>

      <button
        type="button"
        onClick={() => {
          setForm((current) => {
            if (current.class_id || !classes[0]?.id) return current;
            return { ...current, class_id: classes[0].id };
          });
          setFormOpen(true);
        }}
        className="fixed bottom-6 right-6 z-[80] inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition hover:bg-zinc-800"
        aria-label="일정 추가"
      >
        <Plus className="h-5 w-5" />
      </button>

      {formOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-end bg-black/35 p-4 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-sm rounded-[12px] bg-white p-4 text-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-black text-zinc-950">일정 추가</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="grid h-8 w-8 place-items-center rounded-[7px] bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 hover:text-zinc-950" aria-label="닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitSchedule}>
              <select className="h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:bg-white focus:ring-2 focus:ring-black/10" value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))}>
                <option value="">클래스</option>
                {classes.map((classRow) => <option key={classRow.id} value={classRow.id}>{classRow.name}</option>)}
              </select>
              {!classes.length ? <p className="text-xs font-semibold text-zinc-500">클래스가 없으면 일정명과 같은 이름의 클래스가 자동 생성됩니다.</p> : null}
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="일정명" />
              <select className="h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:bg-white focus:ring-2 focus:ring-black/10" value={form.event_type} onChange={(event) => setForm((current) => ({ ...current, event_type: event.target.value }))}>
                <option value="class">수업</option>
                <option value="homework">과제</option>
                <option value="test">시험</option>
                <option value="review">복습</option>
                <option value="mock_exam">모의고사</option>
                <option value="other">기타</option>
              </select>
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="time" value={form.starts_at} onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))} />
                <Input type="time" value={form.ends_at} onChange={(event) => setForm((current) => ({ ...current, ends_at: event.target.value }))} />
              </div>
              <select
                className="h-10 w-full rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:bg-white focus:ring-2 focus:ring-black/10"
                value={form.recurrence_unit}
                onChange={(event) => setForm((current) => ({ ...current, recurrence_unit: event.target.value as ScheduleRecurrenceUnit, recurrence_interval: "1" }))}
              >
                <option value="none">한 번만</option>
                <option value="day">일 단위 반복</option>
                <option value="week">주 단위 반복</option>
                <option value="month">월 단위 반복</option>
              </select>
              {form.recurrence_unit !== "none" ? (
                <div className="space-y-3 rounded-[10px] bg-zinc-50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-semibold text-zinc-600">
                      반복 간격
                      <select className="mt-1 h-10 w-full rounded-[8px] border-0 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:ring-2 focus:ring-black/10" value={form.recurrence_interval} onChange={(event) => setForm((current) => ({ ...current, recurrence_interval: event.target.value }))}>
                        {(form.recurrence_unit === "day" ? dayIntervalOptions : form.recurrence_unit === "week" ? weekIntervalOptions : monthIntervalOptions).map((value) => (
                          <option key={value} value={value}>
                            {form.recurrence_unit === "day" ? `${value}일마다` : form.recurrence_unit === "week" ? `${value}주마다` : `${value}개월마다`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-zinc-600">
                      반복 종료일
                      <Input className="mt-1" type="date" value={form.repeat_until} onChange={(event) => setForm((current) => ({ ...current, repeat_until: event.target.value }))} />
                    </label>
                  </div>
                  {form.recurrence_unit === "week" ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-zinc-600">요일</p>
                      <div className="grid grid-cols-7 gap-1.5">
                        {scheduleWeekdays.map((day) => {
                          const active = academySelectedWeekdays.includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleAcademyRecurrenceWeekday(day.value)}
                              className={`h-8 rounded-[7px] text-xs font-bold transition ${active ? "bg-black text-white" : "bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {form.recurrence_unit === "month" ? (
                    <label className="block text-xs font-semibold text-zinc-600">
                      반복 날짜
                      <select className="mt-1 h-10 w-full rounded-[8px] border-0 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:ring-2 focus:ring-black/10" value={academySelectedMonthDay} onChange={(event) => setForm((current) => ({ ...current, recurrence_month_day: event.target.value }))}>
                        {monthDayOptions.map((value) => <option key={value} value={value}>{value}일</option>)}
                      </select>
                    </label>
                  ) : null}
                  <p className="text-xs text-zinc-500">종료일을 비워두면 최대 160개까지 반복 일정을 자동 저장합니다.</p>
                </div>
              ) : null}
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="메모"
                className="min-h-24 w-full resize-none rounded-[8px] border-0 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:bg-white focus:ring-2 focus:ring-black/10"
              />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "저장 중" : "저장"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AcademyPageContent() {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  if (panel === "seats" || panel === "classes" || panel === "assignments" || searchParams.get("tab") === "assignments") return <AcademyOperationsPanel />;
  if (panel === "operations") return <AcademySchedulePanel />;
  return <AcademyConsoleHome />;
}

export default function AcademyPage() {
  return (
    <Suspense fallback={<div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">콘솔을 준비하는 중입니다.</div>}>
      <AcademyPageContent />
    </Suspense>
  );
}
