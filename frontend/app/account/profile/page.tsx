"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AcademyProfile, fetchMe, updateMe } from "@/lib/auth-api";
import { authHttp, getAccessToken, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";

export default function AccountProfilePage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const stored = readStoredAuthProfile<AcademyProfile>();
        if (stored && !cancelled) setProfile(stored);
        if (!getAccessToken()) {
          const refreshed = await authHttp.post("/api/auth/refresh");
          setAccessToken(refreshed.data.access_token);
        }
        const me = await fetchMe();
        if (!cancelled) setProfile(me);
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
    if (!profile) return;
    const updated = await updateMe({
      academy_name: profile.academy_name,
      phone: profile.phone,
      address: profile.address,
      business_number: profile.business_number,
    });
    setProfile(updated);
    setNotice("프로필이 저장되었습니다.");
  }

  if (!profile) {
    return (
      <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
        {loading ? "프로필을 불러오는 중..." : error || "프로필 정보가 없습니다."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>프로필 편집</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block text-sm font-semibold">
            이메일
            <Input className="mt-1.5" value={profile.email} disabled />
          </label>
          <label className="block text-sm font-semibold">
            이름 또는 소속명
            <Input className="mt-1.5" value={profile.academy_name} onChange={(event) => setProfile({ ...profile, academy_name: event.target.value })} />
          </label>
          <label className="block text-sm font-semibold">
            사업자등록번호
            <Input className="mt-1.5" value={profile.business_number || ""} onChange={(event) => setProfile({ ...profile, business_number: event.target.value })} />
          </label>
          <label className="block text-sm font-semibold">
            대표 전화
            <Input className="mt-1.5" value={profile.phone || ""} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
          </label>
          <label className="block text-sm font-semibold">
            주소
            <Input className="mt-1.5" value={profile.address || ""} onChange={(event) => setProfile({ ...profile, address: event.target.value })} />
          </label>
          {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</p>}
          <Button onClick={save}>저장</Button>
        </CardContent>
      </Card>
    </div>
  );
}
