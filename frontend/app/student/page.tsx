"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, BarChart3, BookOpenCheck, CheckCircle2, KeyRound, Lock, NotebookTabs, Plus, RotateCcw, UserRound } from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile } from "@/lib/auth-api";
import { readStoredAuthProfile } from "@/lib/auth-client";
import {
  LearningArchiveDetail,
  LearningArchiveGrant,
  LearningAssignment,
  LearningStats,
  LearningWrongAnswer,
  StudentMembership,
  StudentPersonalSet,
  activateLearningAcademyKey,
  addStudentPersonalSetItem,
  createStudentPersonalSet,
  getLearningStats,
  getLearningToday,
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
  return new Date(value).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function StatusChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "locked" }) {
  const toneClass = {
    default: "border-violet-300/25 bg-violet-300/10 text-violet-100",
    good: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    warn: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    locked: "border-slate-300/20 bg-slate-300/10 text-slate-200",
  }[tone];
  return <span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold ${toneClass}`}>{children}</span>;
}

export default function StudentAppPage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [tab, setTab] = useState<TabKey>("today");
  const [academyFilter, setAcademyFilter] = useState("all");
  const [academies, setAcademies] = useState<StudentMembership[]>([]);
  const [assignments, setAssignments] = useState<LearningAssignment[]>([]);
  const [archives, setArchives] = useState<LearningArchiveGrant[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<LearningWrongAnswer[]>([]);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [personalSets, setPersonalSets] = useState<StudentPersonalSet[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<LearningAssignment | null>(null);
  const [selectedArchive, setSelectedArchive] = useState<LearningArchiveDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [archiveAnswers, setArchiveAnswers] = useState<Record<string, string>>({});
  const [keyCode, setKeyCode] = useState("");
  const [newSetTitle, setNewSetTitle] = useState("");
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
    const [today, archiveData, wrongData, setData, statsData] = await Promise.all([
      getLearningToday(academyId),
      listLearningArchives(academyId),
      listLearningWrongAnswers({ academyId }),
      listStudentPersonalSets(),
      getLearningStats(academyId),
    ]);
    setAcademies(today.academies);
    setAssignments(today.assignments);
    setArchives(archiveData);
    setWrongAnswers(wrongData);
    setPersonalSets(setData);
    setStats(statsData);
  }

  useEffect(() => {
    setProfile(readStoredAuthProfile<AcademyProfile>());
    load().catch(() => setError("학생 학습 공간을 불러오지 못했습니다."));
  }, []);

  async function applyAcademyFilter(value: string) {
    setAcademyFilter(value);
    await load(value);
  }

  async function activateKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!keyCode.trim()) return;
    await activateLearningAcademyKey(keyCode.trim());
    setKeyCode("");
    setNotice("학원 키가 연결되었습니다. Today와 Archive에 해당 학원 콘텐츠가 표시됩니다.");
    await load();
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

  if (profile?.account_type !== "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] border border-sky-300/20 bg-sky-300/[0.045] p-6 text-center">
        <h1 className="text-xl font-bold text-white">학생 계정 전용 학습 공간입니다</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">학원 계정에서는 Academy OS를 사용하세요.</p>
        <a href="/academy" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Academy OS로 이동
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-20">
      <section className="rounded-[16px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.22),rgba(8,10,16,0.95)_46%)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-200">Student Learning Workspace</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">모든 학원의 과제와 학습 기록을 한 곳에서</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">학생 계정 하나에 여러 학원 키를 연결하고, 학원별 권한이 있는 문제만 풀고 저장합니다.</p>
          </div>
          <select
            className="h-10 rounded-[8px] border border-white/10 bg-black/30 px-3 text-sm text-white"
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
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-3 text-sm">
          {notice && <div className="text-emerald-200">{notice}</div>}
          {error && <div className="text-red-300">{error}</div>}
        </div>
      )}

      <nav className="grid grid-cols-5 gap-2 rounded-[12px] border border-white/10 bg-white/[0.035] p-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex h-12 flex-col items-center justify-center gap-1 rounded-[8px] text-xs font-semibold transition sm:flex-row sm:text-sm ${tab === item.key ? "bg-violet-500 text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`}
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
                <button key={item.id} onClick={() => void openAssignment(item)} className="w-full rounded-[10px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-violet-300/30 hover:bg-violet-300/[0.06]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.academy_name} · {item.content.snapshot.problem_count}문항 · {formatDate(item.due_at)}</div>
                    </div>
                    <StatusChip tone={item.submission?.submitted_at ? "good" : item.due_at && new Date(item.due_at) < new Date() ? "warn" : "default"}>
                      {item.submission?.submitted_at ? "Submitted" : item.submission?.status === "in_progress" ? "In progress" : "Assigned"}
                    </StatusChip>
                  </div>
                  {item.submission?.score !== null && item.submission?.score !== undefined && <div className="mt-2 text-sm text-violet-100">Score {item.submission.score}</div>}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{selectedAssignment ? selectedAssignment.title : "Assignment Solver"}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!selectedAssignment && <p className="text-sm text-muted-foreground">과제를 선택하면 한 화면에서 문제를 풀 수 있습니다.</p>}
              {selectedAssignment?.content.snapshot.problems.map((problem, index) => (
                <div key={problem.id} className="rounded-[10px] border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{index + 1}. {problem.problem_number}번</span>
                    <Badge variant="secondary">{problem.tags?.unit || "단원 미지정"}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{problem.problem_text}</p>
                  {problem.review_page_image_url && <img src={problem.review_page_image_url} alt="" className="mt-3 max-h-56 rounded-[8px] border border-white/10 object-contain" />}
                  <Input className="mt-3" value={answers[problem.id] || ""} onChange={(event) => setAnswers((prev) => ({ ...prev, [problem.id]: event.target.value }))} placeholder="답 입력" />
                  {problem.answer && <p className="mt-2 text-xs text-emerald-200">정답: {problem.answer}</p>}
                  {problem.solution_steps && <p className="mt-1 text-xs leading-5 text-slate-400">{problem.solution_steps}</p>}
                </div>
              ))}
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
                <button key={grant.id} onClick={() => void openArchive(grant)} className="w-full rounded-[10px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-violet-300/30">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white">{grant.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{grant.academy_name} · {grant.problem_count}문항</div>
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
                <div key={problem.id} className="rounded-[10px] border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-semibold text-white">{problem.problem_number}번</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{problem.problem_text}</p>
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
              <div key={item.id} className="rounded-[10px] border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{item.problem?.problem_number || "-"}번 · {item.academy_name}</div>
                    <MathText className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300" value={item.problem?.problem_text || "원문 접근 권한이 없습니다."} />
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
                <div key={unit.unit} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex justify-between text-sm"><span>{unit.unit}</span><span>{percent(unit.wrong_rate)}</span></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "profile" && (
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Add Academy Key</CardTitle></CardHeader>
            <CardContent>
              <form className="flex gap-2" onSubmit={activateKey}>
                <Input value={keyCode} onChange={(event) => setKeyCode(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" />
                <Button type="submit">등록</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Connected Academies / Personal Sets</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {academies.map((academy) => (
                <div key={academy.id} className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-sm">
                  <div className="font-semibold text-white">{academy.academy_name || academy.academy_id}</div>
                  <div className="text-xs text-slate-500">{academy.status}</div>
                </div>
              ))}
              <form className="flex gap-2 pt-2" onSubmit={createSet}>
                <Input value={newSetTitle} onChange={(event) => setNewSetTitle(event.target.value)} placeholder="새 개인 세트 이름" />
                <Button type="submit"><Plus className="h-4 w-4" /> 생성</Button>
              </form>
              {personalSets.map((set) => (
                <div key={set.id} className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <div className="font-semibold text-white">{set.title}</div>
                  <div className="text-xs text-slate-500">{set.item_count}문항 · {set.items.filter((item) => item.locked_reason).length} locked</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
