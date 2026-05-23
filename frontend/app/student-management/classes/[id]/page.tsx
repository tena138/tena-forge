"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, ClipboardCheck, Loader2, RotateCcw, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClassCard, createReviewSet, deleteClass, getClassDetail, updateClass } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

function tone(status?: string) {
  if (status === "completed" || status === "graded" || status === "Active") return "bg-emerald-500/15 text-emerald-100 border-emerald-400/20";
  if (status === "grading" || status === "scheduled") return "bg-violet-500/15 text-violet-100 border-violet-300/20";
  return "bg-slate-500/15 text-slate-200 border-slate-400/20";
}

export default function StudentManagementClassPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<ClassCard | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", subject: "", grade_level: "" });

  useEffect(() => {
    getClassDetail(params.id).then(setData).catch(() => setData(null));
  }, [params.id]);

  async function makeReviewSet() {
    if (!data) return;
    const review = await createReviewSet({ title: `${data.name} 오답 복습 세트`, class_id: data.id, unresolved_only: true });
    setMessage(`복습 세트를 만들었습니다: ${review.name}`);
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

  async function removeClass() {
    if (!data) return;
    const ok = window.confirm(
      `'${data.name}' 클래스를 삭제할까요?\n학생 계정과 기존 채점 기록은 삭제되지 않지만, 이 클래스의 학생 연결과 일정은 제거됩니다.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteClass(data.id);
      router.replace("/student-management");
    } catch {
      setMessage("클래스 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
    }
  }

  if (!data) return <main className="min-h-screen bg-[#07080d] p-8 text-slate-400">클래스를 불러오는 중입니다.</main>;

  return (
    <main className="min-h-screen bg-[#07080d] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <Link href="/student-management" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Student Management
        </Link>
        <header className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Class Profile</p>
              <h1 className="mt-2 text-3xl font-black text-white">{data.name}</h1>
              <p className="mt-2 text-sm text-slate-400">{data.description || [data.subject, data.grade_level].filter(Boolean).join(" · ") || "클래스 설명 없음"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={startEdit}>
                클래스 정보 수정
              </Button>
              <Button onClick={makeReviewSet}>
                <RotateCcw className="h-4 w-4" />
                오답 복습 세트
              </Button>
              <Link href="/student-management">
                <Button variant="outline">채점 입력으로</Button>
              </Link>
              <Button variant="destructive" onClick={removeClass} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                클래스 삭제
              </Button>
            </div>
          </div>
          {editing ? (
            <div className="mt-4 grid gap-2 rounded-lg border border-violet-300/20 bg-violet-500/10 p-3 md:grid-cols-2 xl:grid-cols-4">
              <Input
                placeholder="클래스 이름"
                value={editForm.name}
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
              />
              <Input
                placeholder="레벨/설명"
                value={editForm.description}
                onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
              />
              <Input
                placeholder="과목"
                value={editForm.subject}
                onChange={(event) => setEditForm((current) => ({ ...current, subject: event.target.value }))}
              />
              <Input
                placeholder="학년"
                value={editForm.grade_level}
                onChange={(event) => setEditForm((current) => ({ ...current, grade_level: event.target.value }))}
              />
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
          {message ? <div className="mt-4 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">{message}</div> : null}
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">학생</p><p className="mt-1 text-2xl font-black text-white">{data.student_count}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">예정 세션</p><p className="mt-1 text-2xl font-black text-violet-100">{data.upcoming_count}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">평균 점수</p><p className="mt-1 text-2xl font-black text-emerald-100">{data.average_recent_score == null ? "-" : `${Math.round(data.average_recent_score)}점`}</p></CardContent></Card>
          <Card className="border-white/10 bg-white/[0.035]"><CardContent className="p-4"><p className="text-xs text-slate-500">미해결 오답</p><p className="mt-1 text-2xl font-black text-rose-100">{data.unresolved_wrong_count}</p></CardContent></Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Users className="h-5 w-5" />학생</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.students.map((student) => (
                <Link key={student.id} href={`/student-management/students/${student.id}`} className="rounded-lg border border-white/10 bg-black/20 p-3 hover:border-violet-300/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{student.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{[student.school, student.grade_level].filter(Boolean).join(" · ") || "학생 정보 없음"}</p>
                    </div>
                    <Badge className={cn("border", tone(student.status_chip))}>{student.status_chip}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">오답 {student.unresolved_wrong_count}개 · 최근 {student.recent_score == null ? "-" : `${Math.round(student.recent_score)}점`}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader><CardTitle className="flex items-center gap-2 text-white"><ClipboardCheck className="h-5 w-5" />Paper Sessions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data.paper_sessions || []).map((session) => (
                <div key={session.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white">{session.title}</p>
                    <Badge className={cn("border", tone(session.status))}>{session.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{session.graded_count}/{session.assigned_count}명 채점 · {session.problem_count}문항</p>
                </div>
              ))}
              {!(data.paper_sessions || []).length ? <p className="text-sm text-slate-500">아직 연결된 세션이 없습니다.</p> : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
