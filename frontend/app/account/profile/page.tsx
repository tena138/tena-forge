"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile, fetchMe, updateMe } from "@/lib/auth-api";
import { authHttp, getAccessToken, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";

type ProfileDraft = {
  display_name: string;
  profile_name: string;
  bio: string;
};

function profileDisplayName(profile: AcademyProfile) {
  return profile.display_name || profile.academy_name || "";
}

function toDraft(profile: AcademyProfile): ProfileDraft {
  return {
    display_name: profileDisplayName(profile),
    profile_name: profile.profile_name || "",
    bio: profile.bio || "",
  };
}

function normalizeDraft(draft: ProfileDraft) {
  return {
    display_name: draft.display_name.trim(),
    profile_name: draft.profile_name.trim().replace(/^@+/, "").toLowerCase(),
    bio: draft.bio.trim(),
  };
}

export default function AccountProfilePage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const isDirty = useMemo(() => {
    if (!profile || !draft) return false;
    return JSON.stringify(normalizeDraft(draft)) !== JSON.stringify(normalizeDraft(toDraft(profile)));
  }, [draft, profile]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const stored = readStoredAuthProfile<AcademyProfile>();
        if (stored && !cancelled) {
          setProfile(stored);
          setDraft(toDraft(stored));
        }
        if (!getAccessToken()) {
          const refreshed = await authHttp.post("/api/auth/refresh");
          setAccessToken(refreshed.data.access_token);
        }
        const me = await fetchMe();
        if (!cancelled) {
          setProfile(me);
          setDraft(toDraft(me));
        }
      } catch {
        if (!cancelled && !readStoredAuthProfile<AcademyProfile>()) {
          setError("프로필을 불러오지 못했습니다. 다시 로그인해주세요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!profile || !draft) return;
    const cleaned = normalizeDraft(draft);
    if (!cleaned.display_name) {
      setNotice("");
      setError("사용자 표시 이름을 입력해주세요.");
      return;
    }
    if (!/^[a-z0-9][a-z0-9_]{2,31}$/.test(cleaned.profile_name)) {
      setNotice("");
      setError("공개 프로필 이름은 영문 소문자, 숫자, _로 3-32자여야 합니다.");
      return;
    }
    if (!isDirty) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const updated = await updateMe({
        academy_name: cleaned.display_name,
        display_name: cleaned.display_name,
        profile_name: cleaned.profile_name,
        bio: cleaned.bio || null,
      });
      setProfile(updated);
      setDraft(toDraft(updated));
      setNotice("프로필이 저장되었습니다.");
    } catch {
      setError("프로필을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="rounded-lg bg-white p-8 text-sm font-semibold text-zinc-500">
        {loading ? "프로필을 불러오는 중..." : error || "프로필 정보가 없습니다."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>프로필</CardTitle>
          <p className="text-sm font-medium text-zinc-500">서비스에서 보여줄 이름과 짧은 소개만 관리합니다.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm font-semibold text-zinc-950">
            사용자 표시 이름
            <Input
              className="mt-1.5"
              maxLength={120}
              value={draft?.display_name || ""}
              onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), display_name: event.target.value }))}
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-950">
            공개 프로필 이름
            <div className="mt-1.5 flex h-10 items-center rounded-[8px] bg-zinc-100 px-3 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-black/10">
              <span className="text-sm font-bold text-zinc-500">@</span>
              <input
                className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-semibold text-zinc-950 outline-none"
                maxLength={32}
                value={draft?.profile_name || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), profile_name: event.target.value.replace(/^@+/, "").toLowerCase() }))}
              />
            </div>
            <p className="mt-1.5 text-xs font-medium text-zinc-500">학생 초대에 쓰이는 공개 이름입니다. 로그인 아이디와 별개로 보입니다.</p>
          </label>
          <label className="block text-sm font-semibold text-zinc-950">
            소개글
            <textarea
              className="mt-1.5 min-h-28 w-full resize-none rounded-[8px] border-0 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:bg-white focus:ring-2 focus:ring-black/10"
              maxLength={500}
              placeholder="짧은 소개를 입력해주세요."
              value={draft?.bio || ""}
              onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), bio: event.target.value }))}
            />
          </label>
          {notice && <p className="flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
          {error && <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={!isDirty || saving} onClick={() => {
              setDraft(toDraft(profile));
              setNotice("");
              setError("");
            }}>
              되돌리기
            </Button>
            <Button onClick={save} disabled={!isDirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "저장 중" : isDirty ? "변경사항 저장" : "저장됨"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
