"use client";

import { useEffect, useState } from "react";
import { Loader2, Radio, Save } from "lucide-react";

import { getLiveInteractionSettings, updateLiveInteractionSettings } from "@/lib/auth-api";

export default function SettingsPage() {
  const [minutes, setMinutes] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getLiveInteractionSettings()
      .then((settings) => {
        if (!active) return;
        setMinutes(settings.live_start_lead_minutes);
        setError("");
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.response?.data?.detail || "설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    const nextMinutes = Math.max(0, Math.min(240, Number(minutes) || 0));
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const settings = await updateLiveInteractionSettings({ live_start_lead_minutes: nextMinutes });
      setMinutes(settings.live_start_lead_minutes);
      setNotice("실시간 수업 시작 노출 시간을 저장했습니다.");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="px-1">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Workspace Settings</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-950">설정</h1>
      </section>

      <section className="rounded-[10px] bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-zinc-950">
              <Radio className="h-4 w-4 text-zinc-500" />
              실시간 수업 인터랙션
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              클래스 일정 시작 몇 분 전부터 담당 강사의 상단 인터랙션 영역에 수업 시작 버튼을 표시할지 정합니다.
            </p>
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
        </div>

        <div className="mt-5 grid gap-3 sm:max-w-sm">
          <label className="text-xs font-black text-zinc-500" htmlFor="live-start-lead-minutes">
            시작 버튼 노출 시간
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              id="live-start-lead-minutes"
              value={minutes}
              min={0}
              max={240}
              type="number"
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="h-11 rounded-[8px] border-0 bg-[#f2f2f2] px-3 text-sm font-bold text-zinc-950 outline-none transition focus:bg-[#f2f2f2] focus:ring-2 focus:ring-black/10"
            />
            <div className="inline-flex h-11 items-center rounded-[8px] bg-[#f2f2f2] px-3 text-sm font-bold text-zinc-500">분 전</div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={loading || saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-black px-4 text-sm font-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </button>
          {notice ? <p className="rounded-[7px] bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-900">{notice}</p> : null}
          {error ? <p className="rounded-[7px] bg-zinc-950 px-3 py-2 text-xs font-bold text-white">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
