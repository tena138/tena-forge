"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, BarChart3, BookOpenCheck, CheckCircle2, ChevronDown, ChevronRight, Link2, Lock, NotebookTabs, Plus, RotateCcw, UserRound } from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile } from "@/lib/auth-api";
import { readStoredAuthProfile } from "@/lib/auth-client";
import {
  AcademyKeyRequirements,
  LearningArchiveDetail,
  LearningArchiveGrant,
  LearningAssignment,
  LearningProblem,
  LearningStats,
  LearningWrongAnswer,
  StudentAcademyInvite,
  StudentMembership,
  StudentPersonalSet,
  addStudentPersonalSetItem,
  acceptStudentAcademyInvite,
  claimAcademyKey,
  createStudentPersonalSet,
  declineStudentAcademyInvite,
  getAcademyKeyRequirements,
  getLearningStats,
  getLearningToday,
  listStudentAcademyInvites,
  listLearningArchives,
  listLearningWrongAnswers,
  listStudentPersonalSets,
  readLearningArchive,
  readLearningAssignment,
  retryLearningWrongAnswer,
  solveLearningProblem,
  startLearningAssignment,
  submitLearningAssignment,
} from "@/lib/academyStudent";
import { formatLocalDateTime } from "@/lib/datetime";

type TabKey = "today" | "archive" | "wrong" | "stats" | "profile";

const tabs: Array<{ key: TabKey; label: string; icon: typeof BookOpenCheck }> = [
  { key: "today", label: "Today", icon: BookOpenCheck },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "wrong", label: "Wrong Answers", icon: NotebookTabs },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "profile", label: "Profile", icon: UserRound },
];

function formatDate(value?: string | null) {
  if (!value) return "마감 없음";
  return formatLocalDateTime(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }, value);
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function assignmentWorkloadLabel(assignment: LearningAssignment) {
  const snapshot = assignment.content.snapshot;
  if (snapshot.problem_count > 0) return `${snapshot.problem_count}문항`;
  return snapshot.material_scope || "직접 입력 숙제";
}

function assignmentStatusTone(assignment: LearningAssignment): "default" | "good" | "warn" {
  const status = assignment.submission?.status;
  if (status === "completed" || status === "submitted" || status === "late") return "good";
  if (status === "pending_confirmation") return "warn";
  if (assignment.due_at && new Date(assignment.due_at) < new Date()) return "warn";
  return "default";
}

function assignmentStatusLabel(assignment: LearningAssignment) {
  const status = assignment.submission?.status;
  if (status === "completed" || status === "submitted") return "Completed";
  if (status === "late") return "Completed late";
  if (status === "pending_confirmation") return "Waiting teacher";
  if (status === "in_progress") return "In progress";
  return "Assigned";
}

function apiErrorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail && typeof (detail as { message?: unknown }).message === "string") {
    return (detail as { message: string }).message;
  }
  return fallback;
}

type AssignmentProblemPageGroup = {
  key: string;
  label: string;
  problems: LearningProblem[];
};

function learningProblemPageLabel(problem: Pick<LearningProblem, "review_page_number">) {
  return problem.review_page_number ? `p.${problem.review_page_number}` : "페이지 미상";
}

function groupLearningProblemsByPage(problems: LearningProblem[]): AssignmentProblemPageGroup[] {
  const groups = new Map<string, AssignmentProblemPageGroup>();
  for (const problem of problems) {
    const key = problem.review_page_number ? String(problem.review_page_number) : "unknown";
    const group = groups.get(key) || { key, label: learningProblemPageLabel(problem), problems: [] };
    group.problems.push(problem);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function StatusChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "locked" }) {
  const toneClass = {
    default: "bg-zinc-100 text-zinc-700",
    good: "bg-zinc-100 text-zinc-700",
    warn: "bg-zinc-100 text-zinc-700",
    locked: "bg-zinc-200 text-zinc-700",
  }[tone];
  return <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

export default function StudentAppPage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [tab, setTab] = useState<TabKey>("today");
  const [academyFilter, setAcademyFilter] = useState("all");
  const [academies, setAcademies] = useState<StudentMembership[]>([]);
  const [academyInvites, setAcademyInvites] = useState<StudentAcademyInvite[]>([]);
  const [assignments, setAssignments] = useState<LearningAssignment[]>([]);
  const [archives, setArchives] = useState<LearningArchiveGrant[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<LearningWrongAnswer[]>([]);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [personalSets, setPersonalSets] = useState<StudentPersonalSet[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<LearningAssignment | null>(null);
  const [selectedArchive, setSelectedArchive] = useState<LearningArchiveDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [archiveAnswers, setArchiveAnswers] = useState<Record<string, string>>({});
  const [collapsedAssignmentPages, setCollapsedAssignmentPages] = useState<Record<string, boolean>>({});
  const [newSetTitle, setNewSetTitle] = useState("");
  const [academyKeyCode, setAcademyKeyCode] = useState("");
  const [academyKeyRequirements, setAcademyKeyRequirements] = useState<AcademyKeyRequirements | null>(null);
  const [academyKeyProfile, setAcademyKeyProfile] = useState<Record<string, string>>({});
  const [academyKeyBusy, setAcademyKeyBusy] = useState<"check" | "claim" | "">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredAssignments = useMemo(
    () => assignments.filter((item) => academyFilter === "all" || item.academy_id === academyFilter),
    [assignments, academyFilter]
  );
  const filteredArchives = useMemo(
    () => archives.filter((item) => academyFilter === "all" || item.academy_id === academyFilter),
    [archives, academyFilter]
  );
  const filteredWrong = useMemo(
    () => wrongAnswers.filter((item) => academyFilter === "all" || item.academy_id === academyFilter),
    [wrongAnswers, academyFilter]
  );

  async function load(filter = academyFilter) {
    const academyId = filter === "all" ? undefined : filter;
    const [today, archiveData, wrongData, setData, statsData, inviteData] = await Promise.all([
      getLearningToday(academyId),
      listLearningArchives(academyId),
      listLearningWrongAnswers({ academyId }),
      listStudentPersonalSets(),
      getLearningStats(academyId),
      listStudentAcademyInvites(),
    ]);
    setAcademies(today.academies);
    setAssignments(today.assignments);
    setArchives(archiveData);
    setWrongAnswers(wrongData);
    setPersonalSets(setData);
    setStats(statsData);
    setAcademyInvites(inviteData);
  }

  useEffect(() => {
    setProfile(readStoredAuthProfile<AcademyProfile>());
    load().catch(() => setError("학생 학습 공간을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!selectedAssignment) {
      setCollapsedAssignmentPages({});
      return;
    }
    const problems = selectedAssignment.content.snapshot.problems;
    const next: Record<string, boolean> = {};
    groupLearningProblemsByPage(problems).forEach((group, index) => {
      next[group.key] = problems.length > 40 && index > 0;
    });
    setCollapsedAssignmentPages(next);
  }, [selectedAssignment]);

  async function applyAcademyFilter(value: string) {
    setAcademyFilter(value);
    await load(value);
  }

  async function openAssignment(item: LearningAssignment) {
    const detail = await readLearningAssignment(item.id);
    await startLearningAssignment(item.id);
    setSelectedAssignment(detail);
    setAnswers({});
    setTab("today");
  }

  async function submitSelectedAssignment() {
    if (!selectedAssignment) return;
    const payload = selectedAssignment.content.snapshot.problems.map((problem) => ({ problem_id: problem.id, answer: answers[problem.id] || "" }));
    const result = await submitLearningAssignment(selectedAssignment.id, payload);
    setNotice(`제출 완료: ${result.correct_count}/${result.total_count} 정답`);
    setSelectedAssignment(await readLearningAssignment(selectedAssignment.id));
    await load();
  }

  async function openArchive(grant: LearningArchiveGrant) {
    if (grant.locked_reason) return;
    const detail = await readLearningArchive(grant.id);
    setSelectedArchive(detail);
    setArchiveAnswers({});
  }

  async function solveArchiveProblem(problemId: string, grantId: string) {
    const answer = archiveAnswers[problemId] || "";
    const result = await solveLearningProblem(problemId, { answer, source_access_grant_id: grantId });
    setNotice(result && typeof result === "object" ? "풀이 기록을 저장했습니다." : "풀이 기록을 저장했습니다.");
    await load();
  }

  async function saveProblemToSet(problemId: string, grantId: string) {
    let target = personalSets[0];
    if (!target) {
      target = await createStudentPersonalSet({ title: "My Review Set" });
    }
    await addStudentPersonalSetItem(target.id, { problem_id: problemId, source_access_grant_id: grantId });
    setNotice("개인 세트에 추가했습니다. 접근 권한이 만료되면 잠금 상태로 표시됩니다.");
    await load();
  }

  async function createSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSetTitle.trim()) return;
    await createStudentPersonalSet({ title: newSetTitle.trim() });
    setNewSetTitle("");
    await load();
  }

  async function retryWrong(item: LearningWrongAnswer) {
    const answer = window.prompt("다시 풀이한 답을 입력하세요.") || "";
    if (!answer.trim()) return;
    await retryLearningWrongAnswer(item.id, { answer });
    setNotice("오답 재시도 기록을 저장했습니다.");
    await load();
  }

  async function acceptAcademyInvite(invite: StudentAcademyInvite) {
    setNotice("");
    setError("");
    try {
      await acceptStudentAcademyInvite(invite.id);
      await load();
      setNotice(`${invite.academy_name} 초대를 수락했습니다.`);
    } catch {
      setError("초대를 수락하지 못했습니다. 이미 처리된 초대인지 확인해 주세요.");
    }
  }

  async function declineAcademyInvite(invite: StudentAcademyInvite) {
    setNotice("");
    setError("");
    try {
      await declineStudentAcademyInvite(invite.id);
      await load();
      setNotice(`${invite.academy_name} 초대를 거절했습니다.`);
    } catch {
      setError("초대를 거절하지 못했습니다.");
    }
  }

  async function checkAcademyKey() {
    const code = academyKeyCode.trim().toUpperCase();
    if (!code) {
      setError("학원 키를 입력해 주세요.");
      return;
    }
    setNotice("");
    setError("");
    setAcademyKeyBusy("check");
    try {
      const requirements = await getAcademyKeyRequirements(code);
      const nextProfile: Record<string, string> = {};
      for (const field of requirements.fields.filter((item) => item.enabled)) {
        nextProfile[field.key] = field.key === "name" ? profile?.academy_name || profile?.display_name || "" : "";
      }
      setAcademyKeyCode(code);
      setAcademyKeyRequirements(requirements);
      setAcademyKeyProfile(nextProfile);
      setNotice(`${requirements.academy_name}${requirements.class_name ? ` · ${requirements.class_name}` : ""} 키를 확인했습니다.`);
    } catch (err) {
      setAcademyKeyRequirements(null);
      setAcademyKeyProfile({});
      setError(apiErrorMessage(err, "학원 키를 확인하지 못했습니다."));
    } finally {
      setAcademyKeyBusy("");
    }
  }

  async function claimCheckedAcademyKey() {
    const code = academyKeyCode.trim().toUpperCase();
    const requirements = academyKeyRequirements;
    if (!requirements) {
      await checkAcademyKey();
      return;
    }
    const missing = requirements.fields.filter((field) => field.enabled && field.required && !academyKeyProfile[field.key]?.trim());
    if (missing.length) {
      setError(`${missing.map((field) => field.label).join(", ")}을 입력해 주세요.`);
      return;
    }
    setNotice("");
    setError("");
    setAcademyKeyBusy("claim");
    try {
      await claimAcademyKey(code, academyKeyProfile);
      setAcademyKeyCode("");
      setAcademyKeyRequirements(null);
      setAcademyKeyProfile({});
      setAcademyFilter("all");
      await load("all");
      setNotice("학원 키가 등록되었습니다.");
      setTab("today");
    } catch (err) {
      setError(apiErrorMessage(err, "학원 키를 등록하지 못했습니다."));
    } finally {
      setAcademyKeyBusy("");
    }
  }

  if (profile?.account_type !== "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-zinc-950">학생 계정 전용 학습 공간입니다</h1>
        <a href="/academy" className="mt-5 inline-flex h-10 items-center rounded-[8px] bg-black px-4 text-sm font-semibold text-white transition hover:bg-zinc-800">
          Academy로 이동
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-20">
      <section className="rounded-[16px] bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-500">Student Learning Workspace</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">모든 학원의 과제와 학습 기록을 한 곳에서</h1>
          </div>
          <select
            className="h-10 rounded-[8px] border-0 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 outline-none transition focus:ring-2 focus:ring-black/10"
            value={academyFilter}
            onChange={(event) => void applyAcademyFilter(event.target.value)}
          >
            <option value="all">All academies</option>
            {academies.map((academy) => (
              <option key={academy.id} value={academy.academy_id}>{academy.academy_name || academy.academy_id}</option>
            ))}
          </select>
        </div>
      </section>

      {(notice || error) && (
        <div className="rounded-[10px] bg-white p-3 text-sm">
          {notice && <div className="font-semibold text-zinc-700">{notice}</div>}
          {error && <div className="font-semibold text-zinc-700">{error}</div>}
        </div>
      )}

      <nav className="grid grid-cols-5 gap-2 rounded-[12px] bg-white p-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex h-12 flex-col items-center justify-center gap-1 rounded-[8px] text-xs font-semibold transition sm:flex-row sm:text-sm ${tab === item.key ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "today" && (
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader><CardTitle>Today</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {filteredAssignments.length === 0 && <p className="text-sm text-muted-foreground">표시할 과제가 없습니다.</p>}
              {filteredAssignments.map((item) => (
                <button key={item.id} onClick={() => void openAssignment(item)} className="w-full rounded-[10px] bg-zinc-50 p-3 text-left transition hover:bg-zinc-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-zinc-950">{item.title}</div>
                      <div className="mt-1 text-xs font-medium text-zinc-500">{item.academy_name} · {assignmentWorkloadLabel(item)} · {formatDate(item.due_at)}</div>
                    </div>
                    <StatusChip tone={assignmentStatusTone(item)}>
                      {assignmentStatusLabel(item)}
                    </StatusChip>
                  </div>
                  {item.submission?.score !== null && item.submission?.score !== undefined && <div className="mt-2 text-sm font-semibold text-zinc-700">Score {item.submission.score}</div>}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{selectedAssignment ? selectedAssignment.title : "Assignment Solver"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!selectedAssignment && <p className="text-sm text-muted-foreground">과제를 선택하면 한 화면에서 문제를 풀 수 있습니다.</p>}
              {selectedAssignment && selectedAssignment.content.snapshot.problem_count === 0 ? (
                <div className="rounded-[10px] bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-950">{selectedAssignment.content.snapshot.material_title || selectedAssignment.title}</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-600">{selectedAssignment.content.snapshot.material_scope || selectedAssignment.description || "등록된 분량을 확인하세요."}</div>
                </div>
              ) : null}
              {selectedAssignment && selectedAssignment.content.snapshot.problem_count > 0 ? (
                <div className="space-y-2">
                  {groupLearningProblemsByPage(selectedAssignment.content.snapshot.problems).map((group) => {
                    const collapsed = collapsedAssignmentPages[group.key] || false;
                    return (
                      <div key={group.key} className="overflow-hidden rounded-[10px] bg-zinc-50">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2 text-left transition hover:bg-zinc-100"
                          onClick={() => setCollapsedAssignmentPages((current) => ({ ...current, [group.key]: !collapsed }))}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
                            <span className="text-sm font-bold text-zinc-950">{group.label}</span>
                          </span>
                          <span className="text-xs font-semibold text-zinc-500">{group.problems.length}문항</span>
                        </button>
                        {!collapsed ? (
                          <div className="space-y-3 p-3">
                            {group.problems.map((problem) => (
                              <div key={problem.id} className="rounded-[8px] bg-white p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <span className="text-sm font-semibold text-zinc-950">{problem.problem_number}번</span>
                                  <Badge variant="secondary">{problem.tags?.unit || "단원 미지정"}</Badge>
                                </div>
                                <MathText className="text-sm leading-6 text-zinc-800" value={problem.problem_text} />
                                {problem.review_page_image_url && <img src={problem.review_page_image_url} alt="" className="mt-3 max-h-56 rounded-[8px] border border-zinc-200 object-contain" />}
                                <Input className="mt-3" value={answers[problem.id] || ""} onChange={(event) => setAnswers((prev) => ({ ...prev, [problem.id]: event.target.value }))} placeholder="답 입력" />
                                {problem.answer && <p className="mt-2 text-xs font-semibold text-zinc-600">정답: {problem.answer}</p>}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {selectedAssignment && <Button className="w-full" onClick={submitSelectedAssignment}><CheckCircle2 className="h-4 w-4" /> 제출</Button>}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "archive" && (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader><CardTitle>Accessible Archives</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {filteredArchives.map((grant) => (
                <button key={grant.id} onClick={() => void openArchive(grant)} className="w-full rounded-[10px] bg-zinc-50 p-3 text-left transition hover:bg-zinc-100">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-zinc-950">{grant.title}</div>
                      <div className="mt-1 text-xs font-medium text-zinc-500">{grant.academy_name} · {grant.problem_count}문항</div>
                    </div>
                    {grant.locked_reason ? <StatusChip tone="locked"><Lock className="mr-1 h-3 w-3" />Locked</StatusChip> : <StatusChip>Open</StatusChip>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{selectedArchive?.title || "Archive Problems"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!selectedArchive && <p className="text-sm text-muted-foreground">권한이 부여된 아카이브를 선택하세요.</p>}
              {selectedArchive?.problems.map((problem) => (
                <div key={problem.id} className="rounded-[10px] bg-zinc-50 p-3">
                  <div className="text-sm font-semibold text-zinc-950">{problem.problem_number}번</div>
                  <MathText className="mt-2 text-sm leading-6 text-zinc-800" value={problem.problem_text} />
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input value={archiveAnswers[problem.id] || ""} onChange={(event) => setArchiveAnswers((prev) => ({ ...prev, [problem.id]: event.target.value }))} placeholder="답 입력" />
                    <Button variant="outline" onClick={() => void solveArchiveProblem(problem.id, selectedArchive.grant.id)}>풀이 저장</Button>
                    <Button variant="outline" disabled={!selectedArchive.grant.can_save_to_my_archive} onClick={() => void saveProblemToSet(problem.id, selectedArchive.grant.id)}>세트 저장</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "wrong" && (
        <Card>
          <CardHeader><CardTitle>Wrong Answers</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {filteredWrong.length === 0 && <p className="text-sm text-muted-foreground">아직 오답 기록이 없습니다.</p>}
            {filteredWrong.map((item) => (
              <div key={item.id} className="rounded-[10px] bg-zinc-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-zinc-950">{item.problem?.problem_number || "-"}번 · {item.academy_name}</div>
                    <MathText className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-700" value={item.problem?.problem_text || "원문 접근 권한이 없습니다."} />
                  </div>
                  <StatusChip tone={item.resolved_status === "mastered" ? "good" : "warn"}>{item.resolved_status}</StatusChip>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void retryWrong(item)}><RotateCcw className="h-4 w-4" /> 다시 풀기</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "stats" && (
        <div className="grid gap-4 lg:grid-cols-4">
          <Card><CardHeader><CardTitle>완료율</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{percent(stats?.completion_rate)}</CardContent></Card>
          <Card><CardHeader><CardTitle>정답률</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{percent(stats?.correct_rate)}</CardContent></Card>
          <Card><CardHeader><CardTitle>풀이 수</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.solved_problem_count || 0}</CardContent></Card>
          <Card><CardHeader><CardTitle>미해결 오답</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats?.unresolved_wrong_count || 0}</CardContent></Card>
          <Card className="lg:col-span-4">
            <CardHeader><CardTitle>Weak Units</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {stats?.weak_units.map((unit) => (
                <div key={unit.unit} className="rounded-[8px] bg-zinc-50 p-3">
                  <div className="flex justify-between text-sm"><span>{unit.unit}</span><span>{percent(unit.wrong_rate)}</span></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "profile" && (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> 학원 키 추가</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={academyKeyCode}
                    onChange={(event) => {
                      setAcademyKeyCode(event.target.value.toUpperCase());
                      setAcademyKeyRequirements(null);
                    }}
                    placeholder="예: 624N-AG8G-YAGY"
                  />
                  <Button type="button" onClick={() => void checkAcademyKey()} disabled={academyKeyBusy === "check"}>
                    {academyKeyBusy === "check" ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    확인
                  </Button>
                </div>
                {academyKeyRequirements ? (
                  <div className="rounded-[10px] bg-zinc-50 p-3">
                    <div className="font-semibold text-zinc-950">{academyKeyRequirements.academy_name}</div>
                    <div className="mt-1 text-xs font-medium text-zinc-500">{academyKeyRequirements.class_name || "클래스"}</div>
                    <div className="mt-3 space-y-2">
                      {academyKeyRequirements.fields.filter((field) => field.enabled).map((field) => (
                        <Input
                          key={field.key}
                          value={academyKeyProfile[field.key] || ""}
                          onChange={(event) => setAcademyKeyProfile((current) => ({ ...current, [field.key]: event.target.value }))}
                          placeholder={`${field.label}${field.required ? " *" : ""}`}
                        />
                      ))}
                    </div>
                    <Button type="button" className="mt-3 w-full" onClick={() => void claimCheckedAcademyKey()} disabled={academyKeyBusy === "claim"}>
                      {academyKeyBusy === "claim" ? <RotateCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      이 학원 연결하기
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-zinc-600">학원에서 받은 키를 입력하면 클래스 일정과 자료가 이 계정에 연결됩니다.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> 받은 앱 초대</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {academyInvites.map((invite) => (
                    <div key={invite.id} className="rounded-[10px] bg-zinc-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-zinc-950">{invite.academy_name}</div>
                          <div className="mt-1 text-xs font-medium text-zinc-500">
                            {[invite.class_name, invite.student_name].filter(Boolean).join(" · ") || "학생 초대"}
                          </div>
                        </div>
                        <StatusChip>pending</StatusChip>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => void acceptAcademyInvite(invite)}>
                          <CheckCircle2 className="h-4 w-4" />
                          수락
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void declineAcademyInvite(invite)}>
                          거절
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!academyInvites.length ? <p className="text-sm font-medium text-zinc-600">받은 앱 초대가 없습니다.</p> : null}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Connected Academies / Personal Sets</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {academies.map((academy) => (
                <div key={academy.id} className="rounded-[8px] bg-zinc-50 px-3 py-2 text-sm">
                  <div className="font-semibold text-zinc-950">{academy.academy_name || academy.academy_id}</div>
                  <div className="text-xs font-medium text-zinc-500">{academy.status}</div>
                </div>
              ))}
              <form className="flex gap-2 pt-2" onSubmit={createSet}>
                <Input value={newSetTitle} onChange={(event) => setNewSetTitle(event.target.value)} placeholder="새 개인 세트 이름" />
                <Button type="submit"><Plus className="h-4 w-4" /> 생성</Button>
              </form>
              {personalSets.map((set) => (
                <div key={set.id} className="rounded-[8px] bg-zinc-50 px-3 py-2 text-sm">
                  <div className="font-semibold text-zinc-950">{set.title}</div>
                  <div className="text-xs font-medium text-zinc-500">{set.item_count}문항 · {set.items.filter((item) => item.locked_reason).length} locked</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
