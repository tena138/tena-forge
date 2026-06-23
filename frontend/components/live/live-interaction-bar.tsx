"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radio } from "lucide-react";

import { LiveInteractionEvent, listUpcomingLiveInteractions } from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, WORKSPACE_CHANGED_EVENT, getActiveWorkspaceId } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function timeLabel(event: LiveInteractionEvent) {
  if (event.minutes_until_start <= 0) return "지금";
  return `${event.minutes_until_start}분 전`;
}

export function LiveInteractionBar() {
  const router = useRouter();
  const [events, setEvents] = useState<LiveInteractionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  async function load() {
    const activeWorkspaceId = getActiveWorkspaceId();
    if (activeWorkspaceId === "student") {
      setEvents([]);
      setReady(true);
      return;
    }
    setLoading(true);
    try {
      const data = await listUpcomingLiveInteractions();
      setEvents((data.events || []).filter((event) => event.minutes_until_start <= 5 || event.status === "ready"));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(AUTH_CHANGED_EVENT, load);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);

  if (!ready) {
    return (
      <div className="inline-flex h-9 min-w-[13rem] items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 text-xs font-bold text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        실시간 확인 중
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="inline-flex h-9 min-w-[13rem] items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.03] px-3 text-xs font-bold text-slate-500">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
        실시간 대기
      </div>
    );
  }

  return (
    <div className="flex max-w-full items-center gap-2 overflow-x-auto">
      {events.slice(0, 3).map((event, index) => (
        <button
          key={event.id}
          type="button"
          onClick={() => router.push(event.live_href)}
          className={cn(
            "inline-flex h-9 max-w-[20rem] shrink-0 items-center gap-2 rounded-[8px] border px-3 text-xs font-black transition",
            index === 0 ? "border-white bg-white text-slate-950 hover:bg-zinc-200" : "border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]"
          )}
          title={`${event.class_name} · ${event.title}`}
        >
          <Radio className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">수업 시작</span>
          <span className={cn("max-w-[9rem] truncate", index === 0 ? "text-slate-700" : "text-slate-300")}>{event.class_name}</span>
          <span className={cn("shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px]", index === 0 ? "bg-black text-white" : "bg-white text-slate-950")}>{timeLabel(event)}</span>
        </button>
      ))}
    </div>
  );
}
