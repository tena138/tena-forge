"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { claimStudentInvite, getStudentInvite, type StudentInvitePreview } from "@/lib/academyStudent";

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
    if (typeof detail === "string") return detail;
  }
  return "초대 링크를 불러오지 못했습니다.";
}

export default function StudentInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = useMemo(() => decodeURIComponent(params.token || ""), [params.token]);
  const [invite, setInvite] = useState<StudentInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setInvite(await getStudentInvite(token));
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(`/student/invite/${encodeURIComponent(token)}`)}`);
        return;
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void load();
  }, [token]);

  async function claim() {
    setClaiming(true);
    setError("");
    try {
      await claimStudentInvite(token);
      router.replace("/student");
    } catch (err) {
      setError(errorMessage(err));
      await load();
    } finally {
      setClaiming(false);
    }
  }

  const canClaim = invite?.status === "pending" || invite?.key_status === "unclaimed";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              학원 초대 연결
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : error && !invite ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-zinc-600">{error}</p>
                <Button onClick={() => void load()}>다시 시도</Button>
              </div>
            ) : invite ? (
              <>
                <div className="space-y-2 text-sm">
                  <p className="text-base font-semibold">
                    {invite.academy_name}의 {invite.student_name || "학생"} 기록을 이 계정에 연결합니다.
                  </p>
                  <p className="text-zinc-600">
                    수락하면 이 계정에 해당 학원이 추가되고 일정, 과제, 공지, 학습 자료가 함께 표시됩니다.
                  </p>
                </div>
                <div className="rounded-[8px] bg-zinc-100 p-4 text-sm">
                  <div className="font-semibold">{invite.academy_name}</div>
                  <div className="mt-1 text-zinc-600">학생: {invite.student_name || "-"}</div>
                  <div className="text-zinc-600">클래스: {invite.class_name || "-"}</div>
                </div>
                {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
                {invite.status === "claimed" ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                    <CheckCircle2 className="h-4 w-4" /> 이미 사용된 초대 링크입니다.
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => router.replace("/student")}>
                    나중에
                  </Button>
                  <Button className="flex-1" disabled={!canClaim || claiming} onClick={() => void claim()}>
                    {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "연결하기"}
                  </Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
