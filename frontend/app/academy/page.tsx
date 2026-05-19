"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  ClipboardCheck,
  KeyRound,
  Landmark,
  PackageCheck,
  Plus,
  RefreshCcw,
  ScanText,
  UserMinus,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile } from "@/lib/auth-api";
import { readStoredAuthProfile } from "@/lib/auth-client";
import { api, Batch, ProblemSetListItem } from "@/lib/api";
import {
  AcademyBilling,
  AcademyClass,
  AcademySeat,
  Assignment,
  createAcademyAssignment,
  createAcademyClass,
  createAcademySeats,
  getAcademyBilling,
  listAcademyAssignments,
  listAcademyClasses,
  listAcademySeats,
  releaseAcademySeat,
  rotateAcademySeatCode,
} from "@/lib/academyStudent";

type ProblemPage = { items: unknown[]; total: number; page: number; limit: number; pages: number };
type ProblemStats = { total: number; needs_review: number; tagged: number; untagged: number };
type ProblemFacets = { subjects: string[] };
type SubjectCount = { subject: string; count: number };
type FlowStep = { label: string; href: string; icon: LucideIcon };

const flowSteps: FlowStep[] = [
  { label: "추출", href: "/archive/new", icon: ScanText },
  { label: "검토", href: "/problems/review", icon: ClipboardCheck },
  { label: "보관", href: "/problems", icon: Archive },
  { label: "세트 제작", href: "/problem-sets", icon: PackageCheck },
];

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

function AcademyConsoleHome() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [problemStats, setProblemStats] = useState<ProblemStats>({ total: 0, needs_review: 0, tagged: 0, untagged: 0 });
  const [subjectCounts, setSubjectCounts] = useState<SubjectCount[]>([]);
  const [sets, setSets] = useState<ProblemSetListItem[]>([]);
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

    async function loadConsole() {
      setLoading(true);
      await Promise.all([loadBatches(), loadArchiveAndSets()]);
      if (!cancelled) setLoading(false);
    }

    void loadConsole();
    const batchTimer = window.setInterval(() => void loadBatches(), 4000);
    const archiveTimer = window.setInterval(() => void loadArchiveAndSets(), 30000);

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
      <section className="rounded-[12px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold text-white">제작 콘솔</h1>
          <div className="text-xs text-slate-500">{loading ? "불러오는 중" : lastUpdatedAt ? `실시간 갱신 ${compactTime(lastUpdatedAt)}` : ""}</div>
        </div>
        <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="제작 흐름">
          {flowSteps.map((step, index) => (
            <div key={step.label} className="flex items-center gap-2">
              <Link
                href={step.href}
                className="inline-flex h-10 items-center gap-2 rounded-[7px] border border-white/10 bg-black/20 px-3 text-sm font-semibold text-slate-100 transition hover:border-violet-300/35 hover:bg-violet-400/[0.08]"
              >
                <step.icon className="h-4 w-4 text-violet-200" />
                {step.label}
              </Link>
              {index < flowSteps.length - 1 ? <ArrowRight className="h-4 w-4 text-slate-600" /> : null}
            </div>
          ))}
        </nav>
        {dataError ? <p className="mt-3 text-sm text-red-300">{dataError}</p> : null}
      </section>

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
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [className, setClassName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");

  const academyId = profile?.id || "";

  async function load(id = academyId) {
    if (!id) return;
    const [billingData, seatData, classData, assignmentData] = await Promise.all([
      getAcademyBilling(id),
      listAcademySeats(id),
      listAcademyClasses(id),
      listAcademyAssignments(id),
    ]);
    setBilling(billingData);
    setSeats(seatData);
    setClasses(classData);
    setAssignments(assignmentData);
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
        <p className="mt-2 text-sm leading-6 text-slate-400">Academy OS는 학원 계정 전용 관리 화면입니다.</p>
        <a href="/student" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Student App으로 이동
        </a>
      </div>
    );
  }

  async function addSeats() {
    if (!academyId) return;
    setError("");
    const created = await createAcademySeats(academyId, 1);
    setNewCodes(created.map((seat) => seat.invite_code || "").filter(Boolean));
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
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              좌석은 학원이 소유하는 재사용 가능한 접근 단위이고, 초대 코드는 학생이 좌석을 claim하는 자격 증명입니다. 학생이 퇴원하면 좌석을 해제하고 코드를 회전해 다시 사용할 수 있습니다.
            </p>
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
            {seats.length === 0 && <p className="text-sm text-muted-foreground">아직 좌석이 없습니다. 좌석을 만들면 학생용 초대 코드가 한 번 표시됩니다.</p>}
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
    </div>
  );
}

function AcademyPageContent() {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  if (panel === "operations" || panel === "seats" || panel === "classes") return <AcademyOperationsPanel />;
  return <AcademyConsoleHome />;
}

export default function AcademyPage() {
  return (
    <Suspense fallback={<div className="rounded-[12px] border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">콘솔을 준비하는 중입니다.</div>}>
      <AcademyPageContent />
    </Suspense>
  );
}
