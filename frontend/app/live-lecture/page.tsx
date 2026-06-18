"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";

function LiveLectureContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const classId = searchParams.get("classId");

  return (
    <div className="space-y-6">
      <section className="rounded-[12px] border border-white/10 bg-black/45 p-6">
        <Link href="/academy" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          학원 콘솔
        </Link>
        <div className="mt-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-[10px] border border-white/10 bg-white text-slate-950">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Live Lecture</p>
            <h1 className="mt-1 text-3xl font-black text-white">실시간 강의</h1>
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-white/10 bg-white/[0.045] p-8">
        <div className="max-w-2xl">
          <h2 className="text-xl font-black text-white">강의 세션 준비 중</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            상단 인터랙션 버튼에서 연결된 클래스 일정으로 진입했습니다. 다음 단계에서 이 화면에 화이트보드, 실시간 출석, 강의 자료, 채팅 인터랙션을 붙이면 됩니다.
          </p>
          <div className="mt-5 grid gap-2 rounded-[8px] border border-white/10 bg-black/25 p-3 text-xs font-semibold text-slate-300">
            <div>eventId: {eventId || "없음"}</div>
            <div>classId: {classId || "없음"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LiveLecturePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">실시간 강의 세션을 여는 중입니다...</div>}>
      <LiveLectureContent />
    </Suspense>
  );
}
