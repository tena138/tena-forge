"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  KeyRound,
  Landmark,
  LineChart,
  PackageCheck,
  Plus,
  RefreshCcw,
  ScanText,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile } from "@/lib/auth-api";
import { readStoredAuthProfile } from "@/lib/auth-client";
import { api, Batch, ProblemSetListItem } from "@/lib/api";
import { getUsageSummary, UsageSummary } from "@/lib/saas";
import {
  AcademyBilling,
  AcademyClass,
  AcademySeat,
  Assignment,
  AcademyLearningStudent,
  LearningAssignment,
  LearningAssignmentReport,
  createAcademyAssignment,
  createAcademyClass,
  createLearningAccessGrant,
  createLearningAssignment,
  getAcademyBilling,
  issueLearningStudentKeys,
  listAcademyAssignments,
  listAcademyClasses,
  listAcademyLearningAssignments,
  listAcademyLearningStudents,
  listAcademySeats,
  readLearningAssignmentReport,
  releaseAcademySeat,
  rotateAcademySeatCode,
} from "@/lib/academyStudent";
import {
  ClassCard,
  ScheduleEvent,
  createScheduleEvent,
  deleteScheduleEvent,
  getStudentManagementDashboard,
  listScheduleEvents,
} from "@/lib/studentManagement";

type ProblemPage = { items: unknown[]; total: number; page: number; limit: number; pages: number };
type ProblemStats = { total: number; needs_review: number; tagged: number; untagged: number };
type ProblemFacets = { subjects: string[] };
type SubjectCount = { subject: string; count: number };

function money(value?: number) {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function count(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function compactDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
    <Card className="min-h-[360px] border-white/10 bg-white/[0.035]">
      <CardHeader className="flex-row items-center justify-between gap-3 p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Icon className="h-4 w-4 text-violet-200" />
          {title}
        </CardTitle>
        <Link
          href={action.href}
          className="inline-flex h-8 items-center justify-center rounded-[7px] border border-white/12 bg-white/[0.04] px-3 text-xs font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]"
        >
          {action.label}
        </Link>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">{children}</CardContent>
    </Card>
  );
}

function BatchLine({ batch, href }: { batch: Batch; href?: string }) {
  const progress = progressPercent(batch);
  const content = (
    <div className="rounded-[8px] border border-white/10 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.055]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{batch.name}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{fileName(batch.problem_pdf_filename)}</div>
        </div>
        {progress !== null ? <span className="shrink-0 text-xs font-semibold text-violet-200">{progress}%</span> : null}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{statusText(batch)}</p>
      {progress !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full bg-violet-400" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[8px] border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">{children}</div>;
}

function ratioPercent(used: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function usageTone(percent: number) {
  if (percent >= 90) return "#f87171";
  if (percent >= 75) return "#fbbf24";
  return "#8b5cf6";
}

function formatUsageNumber(value: number, suffix = "") {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = safe >= 100 ? Math.round(safe) : Math.round(safe * 10) / 10;
  return `${rounded.toLocaleString("ko-KR")}${suffix}`;
}

function subjectEngineLabel(code: string) {
  const labels: Record<string, string> = { math: "수학", korean: "국어" };
  return labels[code] || code;
}

function UsageRing({ label, used, total, value, sub }: { label: string; used: number; total: number; value: string; sub: string }) {
  const percent = ratioPercent(used, total);
  const tone = usageTone(percent);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[10px] border border-white/10 bg-black/20 p-3">
      <div
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${tone} ${percent * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
        }}
      >
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#111018] text-[11px] font-black text-white">{Math.round(percent)}%</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="mt-1 truncate text-sm font-black text-white">{value}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function UsageOverview({ summary, loading, updatedAt }: { summary: UsageSummary | null; loading: boolean; updatedAt: string | null }) {
  const planName = summary?.plan?.name || "Plan";
  const engines = summary ? summary.subscription?.enabled_subject_engines || summary.plan.enabled_subject_engines || ["math"] : ["math"];
  const creditsUsed = summary?.extraction_credits_used ?? 0;
  const creditsLimit = summary?.monthly_credit_limit || summary?.plan?.monthly_ai_tokens || 0;
  const costUsed = summary?.estimated_cost_used_krw ?? 0;
  const costLimit = summary?.monthly_cost_cap_krw || 0;
  const uploadCountUsed = summary?.monthly_uploads_used ?? 0;
  const uploadCountLimit = summary?.plan?.monthly_upload_count || 0;
  const pageUsed = summary?.monthly_pages_used ?? 0;
  const pageLimit = summary?.plan?.monthly_processed_pages || 0;
  const uploadMbUsed = summary?.uploaded_mb_this_month ?? 0;
  const uploadMbLimit = summary?.monthly_upload_mb_limit || 0;
  const storageUsed = summary?.storage_mb_used ?? 0;
  const storageLimit = summary?.plan?.storage_quota_mb || 0;

  return (
    <section className="rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
      <div className="grid gap-4 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-[10px] border border-violet-300/15 bg-violet-500/[0.08] p-4">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">이번 달 사용량</div>
          <div className="mt-2 text-2xl font-black text-white">{planName}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {engines.map((engine) => (
              <span key={engine} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-slate-200">
                {subjectEngineLabel(engine)}
              </span>
            ))}
          </div>
          <div className="mt-6 text-[11px] text-slate-500">{loading ? "불러오는 중" : updatedAt ? compactTime(updatedAt) : ""}</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <UsageRing label="AI credits" used={creditsUsed} total={creditsLimit} value={`${formatUsageNumber(creditsUsed)} / ${formatUsageNumber(creditsLimit)}`} sub={`${formatUsageNumber(Math.max(creditsLimit - creditsUsed, 0))} 남음`} />
          <UsageRing label="처리 예산" used={costUsed} total={costLimit} value={`${money(costUsed)}원 / ${money(costLimit)}원`} sub={`${money(Math.max(costLimit - costUsed, 0))}원 남음`} />
          <UsageRing label="처리 페이지" used={pageUsed} total={pageLimit} value={`${formatUsageNumber(pageUsed, "p")} / ${formatUsageNumber(pageLimit, "p")}`} sub={`${formatUsageNumber(Math.max(pageLimit - pageUsed, 0), "p")} 남음`} />
          <UsageRing label="업로드 횟수" used={uploadCountUsed} total={uploadCountLimit} value={`${formatUsageNumber(uploadCountUsed)} / ${formatUsageNumber(uploadCountLimit)}`} sub={`${formatUsageNumber(Math.max(uploadCountLimit - uploadCountUsed, 0))}회 남음`} />
          <UsageRing label="업로드 용량" used={uploadMbUsed} total={uploadMbLimit} value={`${formatUsageNumber(uploadMbUsed, "MB")} / ${formatUsageNumber(uploadMbLimit, "MB")}`} sub={`${formatUsageNumber(Math.max(uploadMbLimit - uploadMbUsed, 0), "MB")} 남음`} />
          <UsageRing label="보관 용량" used={storageUsed} total={storageLimit} value={`${formatUsageNumber(storageUsed, "MB")} / ${formatUsageNumber(storageLimit, "MB")}`} sub={`${formatUsageNumber(Math.max(storageLimit - storageUsed, 0), "MB")} 남음`} />
        </div>
      </div>
    </section>
  );
}

function AcademyConsoleHome() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [problemStats, setProblemStats] = useState<ProblemStats>({ total: 0, needs_review: 0, tagged: 0, untagged: 0 });
  const [subjectCounts, setSubjectCounts] = useState<SubjectCount[]>([]);
  const [sets, setSets] = useState<ProblemSetListItem[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBatches() {
      try {
        const batchData = await api<Batch[]>("/api/batches");
        if (cancelled) return;
        setBatches(batchData);
        setLastUpdatedAt(new Date().toISOString());
        setDataError("");
      } catch {
        if (!cancelled) {
          setBatches([]);
          setDataError("콘솔 데이터를 불러오지 못했습니다.");
        }
      }
    }

    async function loadArchiveAndSets() {
      try {
        const [stats, facets, setData] = await Promise.all([
          api<ProblemStats>("/api/problems/stats"),
          api<ProblemFacets>("/api/problems/facets"),
          api<ProblemSetListItem[]>("/api/problem-sets"),
        ]);
        const counts = await Promise.all(
          (facets.subjects || []).map(async (subject) => {
            const params = new URLSearchParams({ limit: "1" });
            params.append("subject", subject);
            const page = await api<ProblemPage>(`/api/problems?${params.toString()}`);
            return { subject, count: page.total };
          })
        );
        if (cancelled) return;
        const sortedCounts = counts.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
        const classifiedTotal = sortedCounts.reduce((sum, item) => sum + item.count, 0);
        const uncategorized = Math.max(stats.total - classifiedTotal, 0);
        setProblemStats(stats);
        setSubjectCounts(uncategorized > 0 ? [...sortedCounts, { subject: "과목 미분류", count: uncategorized }] : sortedCounts);
        setSets(setData);
      } catch {
        if (!cancelled) {
          setProblemStats({ total: 0, needs_review: 0, tagged: 0, untagged: 0 });
          setSubjectCounts([]);
          setSets([]);
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
      setLoading(true);
      await Promise.all([loadBatches(), loadArchiveAndSets(), loadUsage()]);
      if (!cancelled) setLoading(false);
    }

    void loadConsole();
    const batchTimer = window.setInterval(() => void loadBatches(), 4000);
    const archiveTimer = window.setInterval(() => {
      void loadArchiveAndSets();
      void loadUsage();
    }, 30000);

    return () => {
      cancelled = true;
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
      <UsageOverview summary={usageSummary} loading={loading} updatedAt={lastUpdatedAt} />
      {dataError ? <p className="rounded-[8px] border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{dataError}</p> : null}

      <section className="grid gap-4 xl:grid-cols-4">
        <StageCard title="추출" icon={ScanText} action={{ href: "/archive/new", label: "새 추출" }}>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">현재 추출 중</div>
            <div className="space-y-2">
              {processingBatches.length ? processingBatches.map((batch) => <BatchLine key={batch.id} batch={batch} />) : <EmptyState>진행 중인 배치가 없습니다.</EmptyState>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">추출 대기</div>
            <div className="space-y-2">
              {pendingBatches.length ? pendingBatches.map((batch) => <BatchLine key={batch.id} batch={batch} />) : <EmptyState>대기 중인 배치가 없습니다.</EmptyState>}
            </div>
          </div>
        </StageCard>

        <StageCard title="검토" icon={ClipboardCheck} action={{ href: "/problems/review", label: "검토 열기" }}>
          <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-slate-500">검토 대기 문항</div>
            <div className="mt-1 text-2xl font-semibold text-white">{count(problemStats.needs_review)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">검토 대기 배치</div>
            <div className="space-y-2">
              {reviewBatches.length ? (
                reviewBatches.map((batch) => (
                  <Link
                    key={batch.id}
                    href={`/problems/review?batch_id=${batch.id}`}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.055]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{batch.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{compactDate(batch.created_at)}</div>
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
            <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-500">전체</div>
              <div className="mt-1 text-lg font-semibold text-white">{count(problemStats.total)}</div>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-500">태그</div>
              <div className="mt-1 text-lg font-semibold text-white">{count(problemStats.tagged)}</div>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-500">미분류</div>
              <div className="mt-1 text-lg font-semibold text-white">{count(problemStats.untagged)}</div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">과목별 문항 수</div>
            <div className="space-y-2">
              {subjectCounts.length ? (
                subjectCounts.map((item) => (
                  <div key={item.subject} className="rounded-[8px] border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-white">{item.subject}</span>
                      <span className="text-sm font-semibold text-violet-200">{count(item.count)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full rounded-full bg-violet-400" style={{ width: `${problemStats.total ? Math.max(4, (item.count / problemStats.total) * 100) : 0}%` }} />
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
          <div className="rounded-[8px] border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-slate-500">제작된 세트</div>
            <div className="mt-1 text-2xl font-semibold text-white">{count(sets.length)}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-400">최근 세트</div>
            <div className="space-y-2">
              {recentSets.length ? (
                recentSets.map((set) => (
                  <Link
                    key={set.id}
                    href={`/problem-sets/${set.id}`}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.055]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{set.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{compactDate(set.created_at)}</div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-violet-200">{count(set.item_count)}</span>
                  </Link>
                ))
              ) : (
                <EmptyState>아직 제작된 세트가 없습니다.</EmptyState>
              )}
            </div>
          </div>
          <Link
            href="/problem-sets"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[7px] border border-violet-400/40 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <PackageCheck className="h-4 w-4" />
            세트 제작
          </Link>
        </StageCard>
      </section>
    </div>
  );
}

function AcademyOperationsPanel() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [billing, setBilling] = useState<AcademyBilling | null>(null);
  const [seats, setSeats] = useState<AcademySeat[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [problemSets, setProblemSets] = useState<ProblemSetListItem[]>([]);
  const [learningStudents, setLearningStudents] = useState<AcademyLearningStudent[]>([]);
  const [learningAssignments, setLearningAssignments] = useState<LearningAssignment[]>([]);
  const [learningReport, setLearningReport] = useState<LearningAssignmentReport | null>(null);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [className, setClassName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [learningAssignmentTitle, setLearningAssignmentTitle] = useState("");
  const [selectedProblemSetId, setSelectedProblemSetId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const academyId = profile?.id || "";

  async function load(id = academyId) {
    if (!id) return;
    const [billingData, seatData, classData, assignmentData, setData, studentData, learningAssignmentData] = await Promise.all([
      getAcademyBilling(id),
      listAcademySeats(id),
      listAcademyClasses(id),
      listAcademyAssignments(id),
      api<ProblemSetListItem[]>("/api/problem-sets"),
      listAcademyLearningStudents(id),
      listAcademyLearningAssignments(id),
    ]);
    setBilling(billingData);
    setSeats(seatData);
    setClasses(classData);
    setAssignments(assignmentData);
    setProblemSets(setData);
    setLearningStudents(studentData);
    setLearningAssignments(learningAssignmentData);
    if (!selectedProblemSetId && setData[0]) setSelectedProblemSetId(setData[0].id);
    if (!selectedGroupId && classData[0]) setSelectedGroupId(classData[0].id);
    if (!selectedStudentId && studentData[0]) setSelectedStudentId(studentData[0].student_user_id);
  }

  useEffect(() => {
    const stored = readStoredAuthProfile<AcademyProfile>();
    setProfile(stored);
    if (stored?.id) load(stored.id).catch(() => setError("학원 운영 정보를 불러오지 못했습니다."));
  }, []);

  const assigned = useMemo(() => seats.filter((seat) => seat.assigned).length, [seats]);

  if (profile?.account_type === "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] border border-sky-300/20 bg-sky-300/[0.045] p-6 text-center">
        <h1 className="text-xl font-bold text-white">학생 계정에서는 Student App을 사용합니다</h1>
        <a href="/student" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Student App으로 이동
        </a>
      </div>
    );
  }

  async function addSeats() {
    if (!academyId) return;
    setError("");
    const created = await issueLearningStudentKeys(academyId, { count: 1 });
    setNewCodes(created.keys.map((seat) => seat.key_code || "").filter(Boolean));
    setNotice("좌석을 만들었습니다. 초대 코드는 지금 한 번만 전체 표시됩니다.");
    await load();
  }

  async function rotateCode(seat: AcademySeat) {
    if (!academyId) return;
    const updated = await rotateAcademySeatCode(academyId, seat.id);
    setNewCodes([updated.invite_code || ""].filter(Boolean));
    setNotice("초대 코드를 재발급했습니다. 새 코드는 지금 한 번만 복사할 수 있습니다.");
    await load();
  }

  async function releaseSeat(seat: AcademySeat) {
    if (!academyId || !window.confirm("이 학생의 학원 접근 권한을 종료하고 좌석을 재사용 가능하게 만들까요?")) return;
    const updated = await releaseAcademySeat(academyId, seat.id, "released_by_academy");
    setNewCodes([updated.invite_code || ""].filter(Boolean));
    setNotice("좌석을 해제했고 기본 보안 정책에 따라 초대 코드를 회전했습니다.");
    await load();
  }

  async function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!academyId || !className.trim()) return;
    await createAcademyClass(academyId, { name: className.trim() });
    setClassName("");
    await load();
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!academyId || !assignmentTitle.trim()) return;
    const target = classes[0] ? [{ target_type: "class", target_id: classes[0].id }] : [{ target_type: "academy", target_id: academyId }];
    await createAcademyAssignment(academyId, {
      title: assignmentTitle.trim(),
      description: "Tena Forge 학원 운영 화면에서 생성한 과제입니다.",
      assignment_type: "homework",
      submission_mode: "completion",
      targets: target,
      contents: [{ content_type: "text", text_content: "학원 자료를 확인하고 풀이를 제출하세요." }],
    });
    setAssignmentTitle("");
    await load();
  }

  async function submitLearningAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!academyId || !learningAssignmentTitle.trim()) return;
    const sourceId = selectedProblemSetId || problemSets[0]?.id;
    if (!sourceId) {
      setError("먼저 문제 세트를 만들어 주세요.");
      return;
    }
    const created = await createLearningAssignment(academyId, {
      title: learningAssignmentTitle.trim(),
      description: "아카이브 문제 세트를 기반으로 생성한 학생 풀이 과제입니다.",
      source_type: "problemSet",
      source_id: sourceId,
      group_ids: selectedGroupId ? [selectedGroupId] : [],
      student_ids: selectedGroupId ? [] : selectedStudentId ? [selectedStudentId] : [],
      status: "published",
    });
    setLearningAssignmentTitle("");
    setNotice("학생 풀이 과제를 배포했습니다. 학생 Today 화면에 표시됩니다.");
    setLearningReport(await readLearningAssignmentReport(academyId, created.id));
    await load();
  }

  async function grantSelectedArchiveAccess() {
    if (!academyId) return;
    const sourceId = selectedProblemSetId || problemSets[0]?.id;
    if (!sourceId) {
      setError("권한을 부여할 문제 세트가 없습니다.");
      return;
    }
    await createLearningAccessGrant(academyId, {
      source_type: "problemSet",
      source_id: sourceId,
      group_id: selectedGroupId || null,
      student_id: selectedGroupId ? null : selectedStudentId || null,
      can_solve_freely: true,
      can_save_to_my_archive: true,
      can_see_answer_immediately: false,
      can_see_solution: false,
    });
    setNotice("아카이브 접근 권한을 부여했습니다. 학생 Archive 화면에서 확인할 수 있습니다.");
    await load();
  }

  async function openLearningReport(assignment: LearningAssignment) {
    if (!academyId) return;
    setLearningReport(await readLearningAssignmentReport(academyId, assignment.id));
  }

  if (!profile) {
    return <div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-6">로그인이 필요합니다.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[16px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.22),rgba(8,10,16,0.92)_42%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-200">Academy Operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">학생 좌석, 과제, 클래스 운영</h1>
          </div>
          <Button onClick={addSeats}>
            <Plus className="h-4 w-4" /> 좌석 추가
          </Button>
        </div>
      </section>

      {(notice || error || newCodes.length > 0) && (
        <div className="rounded-[12px] border border-violet-300/20 bg-violet-400/[0.08] p-4 text-sm">
          {notice && <div className="text-violet-100">{notice}</div>}
          {error && <div className="text-red-300">{error}</div>}
          {newCodes.map((code) => (
            <div key={code} className="mt-2 flex items-center justify-between rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 font-mono">
              {code}
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(code)}>복사</Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>현재 플랜</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{billing?.plan?.name || "Tutor"}</div>
            <p className="mt-1 text-sm text-muted-foreground">예상 월 {money(billing?.estimated_monthly_bill)}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>포함 좌석</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{billing?.included_seats ?? 5}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>활성 좌석</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{seats.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>배정 좌석</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{assigned}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> 좌석 / 키 관리</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {seats.map((seat) => (
              <div key={seat.id} className="grid gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{seat.display_name || seat.seat_number}</span>
                    <Badge variant={seat.assigned ? "default" : "secondary"}>{seat.assigned ? "배정됨" : "미배정"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    코드 미리보기: ****{seat.invite_code_preview} · 학생: {seat.assigned_student_user_id || "-"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => rotateCode(seat)}><RefreshCcw className="h-4 w-4" /> 코드 회전</Button>
                  <Button variant="outline" size="sm" disabled={!seat.assigned} onClick={() => releaseSeat(seat)}><UserMinus className="h-4 w-4" /> 해제</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> 클래스 / 과제 빠른 생성</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={submitClass}>
              <Input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="예: 고1 내신반" />
              <Button type="submit">생성</Button>
            </form>
            <div className="space-y-2">
              {classes.map((row) => <div key={row.id} className="rounded-[8px] border border-white/10 px-3 py-2 text-sm">{row.name}</div>)}
            </div>
            <form className="flex gap-2" onSubmit={submitAssignment}>
              <Input value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="과제 제목" />
              <Button type="submit">과제</Button>
            </form>
            <div className="space-y-2">
              {assignments.slice(0, 5).map((row) => <div key={row.id} className="rounded-[8px] border border-white/10 px-3 py-2 text-sm">{row.title}</div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> 학생 관리</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {learningStudents.length === 0 && <p className="text-sm text-muted-foreground">아직 연결된 학생이 없습니다. 학생 키를 발급하고 학생 계정에서 등록하게 하세요.</p>}
            {learningStudents.map((student) => (
              <div key={student.id} className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{student.student_name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {student.groups.map((group) => group.name).join(", ") || "그룹 없음"} · 오답 {student.unresolved_wrong_answer_count}
                    </div>
                  </div>
                  <Badge variant={student.key_status === "active" ? "default" : "secondary"}>{student.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div className="rounded-[8px] border border-white/10 bg-black/20 p-2">제출 {student.recent_assignment_completion}</div>
                  <div className="rounded-[8px] border border-white/10 bg-black/20 p-2">정답률 {student.recent_correct_rate === null ? "-" : `${Math.round(student.recent_correct_rate * 100)}%`}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" /> 학습 과제 / 접근 권한</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-3">
              <select className="h-10 rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white" value={selectedProblemSetId} onChange={(event) => setSelectedProblemSetId(event.target.value)}>
                <option value="">문제 세트 선택</option>
                {problemSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
              </select>
              <select className="h-10 rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                <option value="">개별 학생</option>
                {classes.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select className="h-10 rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white" value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} disabled={Boolean(selectedGroupId)}>
                <option value="">학생 선택</option>
                {learningStudents.map((student) => <option key={student.student_user_id} value={student.student_user_id}>{student.student_name}</option>)}
              </select>
            </div>

            <form className="grid gap-2 md:grid-cols-[1fr_auto_auto]" onSubmit={submitLearningAssignment}>
              <Input value={learningAssignmentTitle} onChange={(event) => setLearningAssignmentTitle(event.target.value)} placeholder="학생 풀이 과제 제목" />
              <Button type="submit"><BookOpenCheck className="h-4 w-4" /> 배포</Button>
              <Button type="button" variant="outline" onClick={grantSelectedArchiveAccess}><ShieldCheck className="h-4 w-4" /> 접근 권한</Button>
            </form>

            <div className="space-y-2">
              {learningAssignments.slice(0, 6).map((assignment) => (
                <button key={assignment.id} onClick={() => openLearningReport(assignment)} className="w-full rounded-[10px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-violet-300/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{assignment.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{assignment.content.snapshot.problem_count}문항 · {assignment.status}</div>
                    </div>
                    <LineChart className="h-4 w-4 text-violet-200" />
                  </div>
                </button>
              ))}
            </div>

            {learningReport && (
              <div className="rounded-[10px] border border-violet-300/20 bg-violet-300/[0.06] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{learningReport.assignment.title}</div>
                    <div className="mt-1 text-xs text-slate-400">대상 {learningReport.summary.target_count} · 제출 {learningReport.summary.submitted_count} · 평균 {learningReport.summary.average_score ?? "-"}</div>
                  </div>
                  <Badge variant="secondary">{Math.round(learningReport.summary.completion_rate * 100)}%</Badge>
                </div>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {learningReport.students.map((student) => (
                    <div key={student.student_id} className="flex items-center justify-between rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm">
                      <span>{student.student_name}</span>
                      <span className="text-slate-400">{student.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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

function academyWeekTitle(value: Date) {
  const end = academyAddDays(value, 6);
  const format = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });
  return `${format.format(value)} - ${format.format(end)}`;
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
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [weekStart, setWeekStart] = useState(() => academyStartOfWeek(new Date()));
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
    repeat_weeks: "1",
    description: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [dashboard, schedule] = await Promise.all([getStudentManagementDashboard(), listScheduleEvents()]);
      setClasses(dashboard.classes);
      setEvents(schedule);
      setForm((current) => ({ ...current, class_id: current.class_id || dashboard.classes[0]?.id || "" }));
      setError("");
    } catch {
      setError("시간표를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setProfile(readStoredAuthProfile<AcademyProfile>());
    void load();
  }, []);

  const classById = useMemo(() => new Map(classes.map((classRow) => [classRow.id, classRow])), [classes]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => academyAddDays(weekStart, index)), [weekStart]);
  const weekEvents = useMemo(() => {
    const start = weekStart.getTime();
    const end = academyAddDays(weekStart, 7).getTime();
    return events
      .filter((event) => {
        const time = new Date(event.starts_at).getTime();
        return time >= start && time < end;
      })
      .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
  }, [events, weekStart]);
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, ScheduleEvent[]> = {};
    for (const event of weekEvents) {
      const key = academyDateKey(event.starts_at);
      grouped[key] = [...(grouped[key] || []), event];
    }
    return grouped;
  }, [weekEvents]);
  const upcomingEvents = useMemo(
    () => [...events].filter((event) => new Date(event.starts_at).getTime() >= Date.now()).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()).slice(0, 8),
    [events]
  );

  if (profile?.account_type === "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] border border-sky-300/20 bg-sky-300/[0.045] p-6 text-center">
        <h1 className="text-xl font-bold text-white">학생 계정에서는 Student App을 사용합니다.</h1>
        <a href="/student" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Student App
        </a>
      </div>
    );
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.class_id || !form.title.trim() || !form.date || !form.starts_at) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const repeatWeeks = Math.max(1, Math.min(52, Number(form.repeat_weeks) || 1));
      for (let index = 0; index < repeatWeeks; index += 1) {
        const eventDate = academyDateKey(academyAddDays(new Date(`${form.date}T00:00:00`), index * 7));
        await createScheduleEvent({
          class_id: form.class_id,
          title: form.title.trim(),
          description: form.description.trim() || null,
          event_type: form.event_type,
          starts_at: `${eventDate}T${form.starts_at}:00`,
          ends_at: form.ends_at ? `${eventDate}T${form.ends_at}:00` : null,
        });
      }
      setNotice("저장됨");
      setForm((current) => ({ ...current, title: "", description: "" }));
      await load();
    } catch {
      setError("일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
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
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">클래스</p>
            <p className="mt-1 text-2xl font-black text-white">{classes.length}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.035]">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">학생</p>
            <p className="mt-1 text-2xl font-black text-white">{classes.reduce((sum, classRow) => sum + classRow.student_count, 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.035]">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">이번 주 일정</p>
            <p className="mt-1 text-2xl font-black text-violet-100">{weekEvents.length}</p>
          </CardContent>
        </Card>
      </section>

      {(notice || error) ? (
        <div className="rounded-[10px] border border-violet-300/20 bg-violet-500/10 px-4 py-3 text-sm">
          {notice ? <span className="text-violet-100">{notice}</span> : null}
          {error ? <span className="text-red-300">{error}</span> : null}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-white">
                <CalendarDays className="h-5 w-5 text-violet-200" />
                클래스 시간표
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" size="icon" variant="outline" onClick={() => setWeekStart((current) => academyAddDays(current, -7))} aria-label="이전 주">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-36 text-center text-sm font-black text-white">{academyWeekTitle(weekStart)}</div>
                <Button type="button" size="icon" variant="outline" onClick={() => setWeekStart((current) => academyAddDays(current, 7))} aria-label="다음 주">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center text-slate-500">불러오는 중</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="grid min-w-[980px] grid-cols-7 border-l border-t border-white/10">
                  {weekDays.map((day) => {
                    const key = academyDateKey(day);
                    const dayEvents = eventsByDate[key] || [];
                    return (
                      <div key={key} className="min-h-[520px] border-b border-r border-white/10 bg-black/10">
                        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#11121a]/95 px-3 py-2">
                          <p className="text-xs text-slate-500">{new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(day)}</p>
                          <p className="text-sm font-black text-white">{new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(day)}</p>
                        </div>
                        <div className="space-y-2 p-2">
                          {dayEvents.map((event) => {
                            const classRow = classById.get(event.class_id);
                            return (
                              <div key={event.id} className="rounded-md border border-violet-300/20 bg-violet-500/15 p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-black text-white">{event.title}</p>
                                    <p className="mt-1 text-[11px] text-violet-100">{academyTimeLabel(event.starts_at)}{event.ends_at ? ` - ${academyTimeLabel(event.ends_at)}` : ""}</p>
                                  </div>
                                  <button type="button" onClick={() => removeEvent(event.id)} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-red-200" aria-label="삭제">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1">
                                  <Badge className="border border-white/10 bg-white/[0.06] text-[10px] text-slate-200">{classRow?.name || "클래스"}</Badge>
                                  <Badge className="border border-white/10 bg-black/20 text-[10px] text-slate-300">{academyEventTypeLabel(event.event_type)}</Badge>
                                  {classRow ? <span className="text-[10px] text-slate-500">{classRow.student_count}명</span> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Plus className="h-5 w-5 text-violet-200" />
                일정 추가
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={submitSchedule}>
                <select className="h-10 w-full rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white" value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))}>
                  <option value="">클래스</option>
                  {classes.map((classRow) => <option key={classRow.id} value={classRow.id}>{classRow.name}</option>)}
                </select>
                <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="일정명" />
                <select className="h-10 w-full rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white" value={form.event_type} onChange={(event) => setForm((current) => ({ ...current, event_type: event.target.value }))}>
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
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input type="number" min="1" max="52" value={form.repeat_weeks} onChange={(event) => setForm((current) => ({ ...current, repeat_weeks: event.target.value }))} />
                  <div className="flex items-center rounded-[8px] border border-white/10 bg-white/[0.035] px-3 text-sm text-slate-400">주 반복</div>
                </div>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="메모"
                  className="min-h-24 w-full resize-none rounded-[8px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-300/50"
                />
                <Button type="submit" className="w-full" disabled={saving || !form.class_id || !form.title.trim()}>
                  {saving ? "저장 중" : "저장"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Clock className="h-5 w-5 text-violet-200" />
                예정 일정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.map((event) => {
                const classRow = classById.get(event.class_id);
                return (
                  <div key={event.id} className="rounded-[8px] border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{event.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{compactDate(event.starts_at)} · {classRow?.name || "클래스"}</p>
                      </div>
                      <Badge className="border border-white/10 bg-white/[0.06] text-slate-200">{academyEventTypeLabel(event.event_type)}</Badge>
                    </div>
                  </div>
                );
              })}
              {!upcomingEvents.length ? <div className="rounded-[8px] border border-dashed border-white/10 p-4 text-sm text-slate-500">예정 일정 없음</div> : null}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="h-5 w-5 text-violet-200" />
                클래스
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {classes.map((classRow) => (
                <div key={classRow.id} className="flex items-center justify-between rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <span className="font-semibold text-white">{classRow.name}</span>
                  <span className="text-slate-500">{classRow.student_count}명</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function AcademyPageContent() {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  if (panel === "operations" || panel === "seats" || panel === "classes") return <AcademySchedulePanel />;
  return <AcademyConsoleHome />;
}

export default function AcademyPage() {
  return (
    <Suspense fallback={<div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">콘솔을 준비하는 중입니다.</div>}>
      <AcademyPageContent />
    </Suspense>
  );
}
