"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile, fetchMe, updateMe } from "@/lib/auth-api";
import { authHttp, getAccessToken, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";

type ProfileDraft = {
  academy_name: string;
  business_number: string;
  phone: string;
  address: string;
};

function toDraft(profile: AcademyProfile): ProfileDraft {
  return {
    academy_name: profile.academy_name || "",
    business_number: profile.business_number || "",
    phone: profile.phone || "",
    address: profile.address || "",
  };
}

function normalizeDraft(draft: ProfileDraft) {
  return {
    academy_name: draft.academy_name.trim(),
    business_number: draft.business_number.trim(),
    phone: draft.phone.trim(),
    address: draft.address.trim(),
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
          setError("프로필 정보를 불러오지 못했습니다. 다시 로그인해주세요.");
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
    if (!cleaned.academy_name) {
      setNotice("");
      setError("이름 또는 소속명을 입력해주세요.");
      return;
    }
    if (!isDirty) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const updated = await updateMe({
        academy_name: cleaned.academy_name,
        phone: cleaned.phone || null,
        address: cleaned.address || null,
        business_number: cleaned.business_number || null,
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
      <div className="rounded-lg bg-white p-8 text-sm font-semibold text-zinc-500 shadow-sm">
        {loading ? "프로필을 불러오는 중..." : error || "프로필 정보가 없습니다."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>프로필 편집</CardTitle>
          <p className="text-sm font-medium text-zinc-500">콘솔과 문서에 표시되는 기본 계정 정보를 관리합니다.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-[10px] bg-zinc-100 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">계정</p>
              <p className="mt-1 truncate font-semibold text-zinc-950">{profile.email}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">상태</p>
              <p className="mt-1 font-semibold text-zinc-950">{profile.email_verified ? "이메일 인증 완료" : "이메일 인증 필요"}</p>
            </div>
          </div>

          <label className="block text-sm font-semibold">
            이메일
            <Input className="mt-1.5" value={profile.email} disabled />
          </label>
          <label className="block text-sm font-semibold">
            이름 또는 소속명
            <Input className="mt-1.5" value={draft?.academy_name || ""} onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), academy_name: event.target.value }))} />
          </label>
          <label className="block text-sm font-semibold">
            사업자등록번호
            <Input className="mt-1.5" value={draft?.business_number || ""} onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), business_number: event.target.value }))} />
          </label>
          <label className="block text-sm font-semibold">
            대표 전화
            <Input className="mt-1.5" value={draft?.phone || ""} onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), phone: event.target.value }))} />
          </label>
          <label className="block text-sm font-semibold">
            주소
            <Input className="mt-1.5" value={draft?.address || ""} onChange={(event) => setDraft((current) => ({ ...(current || toDraft(profile)), address: event.target.value }))} />
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
