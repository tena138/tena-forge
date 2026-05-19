"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, GraduationCap, KeyRound, NotebookPen, Plus, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile } from "@/lib/auth-api";
import { readStoredAuthProfile } from "@/lib/auth-client";
import {
  Assignment,
  StudentMembership,
  StudentQuota,
  WrongAnswerItem,
  claimAcademyKey,
  createWrongAnswer,
  exportWrongAnswers,
  getStudentQuotas,
  listStudentAcademies,
  listStudentAssignments,
  listWrongAnswers,
  startTest,
  submitAssignment,
} from "@/lib/academyStudent";

export default function StudentAppPage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [academies, setAcademies] = useState<StudentMembership[]>([]);
  const [quota, setQuota] = useState<StudentQuota | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswerItem[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [wrongText, setWrongText] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [academyData, quotaData, assignmentData, wrongData] = await Promise.all([
      listStudentAcademies(),
      getStudentQuotas(),
      listStudentAssignments(),
      listWrongAnswers(),
    ]);
    setAcademies(academyData);
    setQuota(quotaData);
    setAssignments(assignmentData);
    setWrongAnswers(wrongData);
  }

  useEffect(() => {
    setProfile(readStoredAuthProfile<AcademyProfile>());
    load().catch(() => setError("학생 앱 정보를 불러오지 못했습니다."));
  }, []);

  if (profile?.account_type !== "student") {
    return (
      <div className="mx-auto max-w-xl rounded-[14px] border border-sky-300/20 bg-sky-300/[0.045] p-6 text-center">
        <h1 className="text-xl font-bold text-white">학원 계정에서는 Academy OS를 사용합니다</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Student App은 학생 계정 전용 학습 화면입니다.</p>
        <a href="/academy" className="mt-5 inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.09]">
          Academy OS로 이동
        </a>
      </div>
    );
  }

  async function submitKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteCode.trim()) return;
    setError("");
    await claimAcademyKey(inviteCode.trim());
    setInviteCode("");
    setNotice("학원 키가 등록되었습니다. 이제 학원 과제, 자료, 일정이 학생 앱에 표시됩니다.");
    await load();
  }

  async function addWrongAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wrongText.trim()) return;
    await createWrongAnswer({
      source_type: "manual_entry",
      extracted_problem_text: wrongText.trim(),
      visibility: "private",
      tags: ["manual"],
    });
    setWrongText("");
    setNotice("개인 오답노트에 추가했습니다. 기본값은 비공개입니다.");
    await load();
  }

  async function completeAssignment(assignment: Assignment) {
    if (assignment.assignment_type === "test") {
      await startTest(assignment.id);
      setNotice("테스트 세션을 시작했습니다. 제한 시간이 있으면 서버에서 만료 시각을 기록합니다.");
    } else {
      await submitAssignment(assignment.id, [{ item_index: 0, answer_text: "completed" }]);
      setNotice("과제를 제출했습니다.");
    }
  }

  async function exportSelected() {
    const selected = wrongAnswers.slice(0, 3).map((item) => item.id);
    if (!selected.length) return;
    const result = await exportWrongAnswers(selected);
    setNotice(`${result.export_id} 내보내기 기록을 만들었습니다. 모든 학생용 PDF는 워터마크가 전제됩니다.`);
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[16px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),rgba(8,10,16,0.94)_44%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-200">Student Learning App</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">개인 학습 공간 + 학원 연결 기능</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              학생은 학원 키 없이도 개인 캘린더와 개인 오답노트를 사용할 수 있습니다. 학원 키를 등록하면 해당 학원의 과제, 테스트, 자료, 일정, 추가 사용량이 더해집니다.
            </p>
          </div>
          <Badge className="w-fit bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25">Personal + Academy contexts</Badge>
        </div>
      </section>

      {(notice || error) && (
        <div className="rounded-[12px] border border-white/10 bg-white/[0.045] p-4 text-sm">
          {notice && <div className="text-emerald-200">{notice}</div>}
          {error && <div className="text-red-300">{error}</div>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {(["upload", "extraction", "export"] as const).map((key) => (
          <Card key={key}>
            <CardHeader><CardTitle>{key === "upload" ? "오늘 업로드" : key === "extraction" ? "오늘 추출" : "오늘 내보내기"}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{quota?.remaining[key] ?? 0} / {quota?.total[key] ?? 5}</div>
              <p className="mt-1 text-sm text-muted-foreground">사용 {quota?.used[key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> 학원 키 등록</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={submitKey}>
              <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" />
              <Button type="submit">등록</Button>
            </form>
            <div className="space-y-2">
              <div className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-sm">
                <div className="font-semibold">Personal</div>
                <div className="text-xs text-muted-foreground">개인 캘린더와 개인 오답노트는 학원에 공개되지 않습니다.</div>
              </div>
              {academies.map((academy) => (
                <div key={academy.id} className="rounded-[8px] border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-2 text-sm">
                  <div className="font-semibold">{academy.academy_name || academy.academy_id}</div>
                  <div className="text-xs text-muted-foreground">활성 멤버십 · 좌석 {academy.academy_seat_id.slice(0, 8)}</div>
                </div>
              ))}
            </div>
            <div className="rounded-[8px] border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
              PDF 개인 업로드는 서버 정책상 1페이지 단위로 제한해야 합니다. 이 화면은 학생 앱의 quota와 접근권 기반을 표시합니다.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> 과제 / 테스트</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {assignments.length === 0 && <p className="text-sm text-muted-foreground">아직 연결된 학원 과제가 없습니다.</p>}
            {assignments.map((assignment) => (
              <div key={assignment.id} className="grid gap-3 rounded-[10px] border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{assignment.title}</span>
                    <Badge variant="secondary">{assignment.assignment_type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">제출 방식 {assignment.submission_mode} · 마감 {assignment.due_at ? new Date(assignment.due_at).toLocaleString("ko-KR") : "없음"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => completeAssignment(assignment)}>
                  {assignment.assignment_type === "test" ? "테스트 시작" : "완료 제출"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5" /> 개인 오답노트</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={addWrongAnswer}>
              <Input value={wrongText} onChange={(event) => setWrongText(event.target.value)} placeholder="오답으로 남길 문항 또는 메모" />
              <Button type="submit"><Plus className="h-4 w-4" /> 추가</Button>
            </form>
            <div className="space-y-2">
              {wrongAnswers.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-sm">
                  <div className="line-clamp-2">{item.extracted_problem_text || "내용 없음"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.visibility} · {item.subject || "과목 미지정"}</div>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={exportSelected} disabled={!wrongAnswers.length}>
              <Upload className="h-4 w-4" /> 선택 오답 워터마크 PDF 기록 생성
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> 캘린더 / 알림</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>학생 캘린더는 개인 일정과 학원 일정, 클래스 일정, 과제/테스트 마감을 병합해서 보여주는 구조로 연결되어 있습니다.</p>
            <p>개인 일정은 personal_private 가시성으로 저장되며 학원 스태프 API에서 조회되지 않습니다.</p>
            <p>학원별 알림은 과제 생성, 테스트 시작, 자료 공유, 오답 복습 예정 등의 이벤트에서 확장할 수 있습니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
