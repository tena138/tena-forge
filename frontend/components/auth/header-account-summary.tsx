"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";

import { WorkspaceMenuSection } from "@/components/auth/workspace-menu-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AcademyProfile, fetchMe, logout, updateMe } from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, authHttp, getAccessToken, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type PlanTone = "admin" | "trial" | "free" | "basic" | "pro" | "enterprise";

const planStyles: Record<PlanTone, string> = {
  admin: "plan-aurora-tone-admin",
  trial: "plan-aurora-tone-trial",
  free: "plan-aurora-tone-free",
  basic: "plan-aurora-tone-basic",
  pro: "plan-aurora-tone-pro",
  enterprise: "plan-aurora-tone-enterprise",
};

const planNames: Record<string, { label: string; tone: PlanTone }> = {
  admin: { label: "Admin", tone: "admin" },
  free: { label: "Free", tone: "free" },
  basic: { label: "Basic", tone: "basic" },
  plus: { label: "Basic", tone: "basic" },
  pro: { label: "Pro", tone: "pro" },
  enterprise: { label: "Enterprise", tone: "enterprise" },
  business: { label: "Enterprise", tone: "enterprise" },
};

type ProfileDraft = {
  academy_name: string;
  business_number: string;
  phone: string;
  address: string;
};

function toProfileDraft(profile: AcademyProfile): ProfileDraft {
  return {
    academy_name: profile.academy_name || "",
    business_number: profile.business_number || "",
    phone: profile.phone || "",
    address: profile.address || "",
  };
}

function cleanOptional(value: string) {
  return value.trim();
}

function formatDateTime(value?: string | null) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isFutureDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function displayPlan(profile: AcademyProfile) {
  const roles = profile.roles || [];
  const isAdmin = String(profile.plan || "").toLowerCase() === "admin" || roles.includes("admin") || roles.includes("super_admin");
  if (isAdmin) {
    return { label: "Admin", tone: "admin" as PlanTone, status: "무제한", statusClass: "text-zinc-600 dark:text-zinc-200" };
  }

  const trialEndsAt = profile.trial_ends_at || profile.plan_expires_at;
  const isTrial = profile.account_type !== "student" && !profile.requires_payment && isFutureDate(trialEndsAt);
  if (isTrial) {
    return { label: "Trial", tone: "trial" as PlanTone, status: "체험 중", statusClass: "text-zinc-600 dark:text-zinc-200" };
  }
  if (profile.requires_payment) {
    return { label: "Trial Expired", tone: "free" as PlanTone, status: "결제 필요", statusClass: "text-zinc-600 dark:text-zinc-200" };
  }
  const normalizedPlan = String(profile.plan || "free").toLowerCase();
  const plan = planNames[normalizedPlan] || { label: normalizedPlan || "Free", tone: "free" as PlanTone };
  if (normalizedPlan === "free") {
    return { ...plan, status: "콘솔 보기", statusClass: "text-zinc-600" };
  }
  return { ...plan, status: profile.is_active ? "활성" : "비활성", statusClass: profile.is_active ? "text-zinc-600" : "text-zinc-600" };
}

function PlanBadge({ label, tone }: { label: string; tone: PlanTone }) {
  return (
    <Badge className={cn("plan-aurora-surface plan-aurora-badge rounded-full border px-2.5 font-black", planStyles[tone])}>
      <span className="plan-aurora__ribbon plan-aurora__ribbon--a" />
      <span className="plan-aurora__ribbon plan-aurora__ribbon--b" />
      <span className="relative z-10">{label}</span>
    </Badge>
  );
}

export function HeaderAccountSummary() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
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
        if (!cancelled && !readStoredAuthProfile<AcademyProfile>()) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function onAuthChanged() {
      const stored = readStoredAuthProfile<AcademyProfile>();
      setProfile(stored);
      if (stored) loadProfile();
    }

    loadProfile();
    window.addEventListener("focus", loadProfile);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadProfile);
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, []);

  if (!profile) {
    if (loading) {
      return <div className="h-9 w-44 animate-pulse rounded-[8px] border border-white/10 bg-white/[0.06]" aria-label="계정 정보 로딩" />;
    }
    return (
      <Link href="/login">
        <Button size="sm" variant="outline">로그인</Button>
      </Link>
    );
  }

  const currentProfile = profile;
  const plan = displayPlan(currentProfile);
  const initials = (currentProfile.academy_name || currentProfile.email).slice(0, 1).toUpperCase();

  function openProfileEditor() {
    setDraft(toProfileDraft(currentProfile));
    setNotice("");
    setError("");
    setOpen(false);
    setProfileOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.academy_name.trim()) {
      setError("이름 또는 소속명을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateMe({
        academy_name: draft.academy_name.trim(),
        business_number: cleanOptional(draft.business_number),
        phone: cleanOptional(draft.phone),
        address: cleanOptional(draft.address),
      });
      setProfile(updated);
      setDraft(toProfileDraft(updated));
      setNotice("프로필이 저장되었습니다.");
    } catch {
      setError("프로필을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <Dialog
      open={profileOpen}
      onOpenChange={(value) => {
        setProfileOpen(value);
        if (value) {
          setDraft(toProfileDraft(currentProfile));
          setNotice("");
          setError("");
        }
      }}
    >
      <div className="relative">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 rounded-[8px] border border-transparent bg-transparent px-2.5 py-1.5 text-left shadow-none transition-all hover:border-transparent hover:bg-transparent hover:shadow-none"
          onClick={() => setOpen((value) => !value)}
          aria-label="계정 메뉴"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-zinc-500 text-sm font-bold text-white">
            {initials}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[160px] truncate text-sm font-semibold text-foreground">{currentProfile.academy_name}</span>
            <span className="block max-w-[180px] truncate text-xs text-muted-foreground">{currentProfile.email}</span>
          </span>
          <PlanBadge label={plan.label} tone={plan.tone} />
        </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,28rem)] rounded-[10px] border border-white/10 bg-[#090b12] p-2 text-sm shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
          <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{currentProfile.academy_name}</div>
                <div className="truncate text-xs text-muted-foreground">{currentProfile.email}</div>
              </div>
              <PlanBadge label={plan.label} tone={plan.tone} />
            </div>
            <div className="mt-3 rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">구독 플랜</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm font-bold">{plan.label}</span>
                <span className={`text-xs font-semibold ${plan.statusClass}`}>{plan.status}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              {currentProfile.email_verified ? "이메일 인증 완료" : "이메일 인증 필요"}
            </div>
          </div>

          <WorkspaceMenuSection onClose={() => setOpen(false)} />

          <div className="mt-2 grid gap-1">
            <button type="button" className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-left text-slate-300 hover:bg-white/[0.07] hover:text-white" onClick={openProfileEditor}>
              <UserRound className="h-4 w-4" />
              프로필
            </button>
            <Link href="/account/security" className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-slate-300 hover:bg-white/[0.07] hover:text-white" onClick={() => setOpen(false)}>
              <Settings className="h-4 w-4" />
              보안 설정
            </Link>
            <button type="button" className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-left text-zinc-600 hover:bg-zinc-50" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </div>
        </div>
      )}

      <DialogContent className="max-w-lg p-0">
        <form onSubmit={saveProfile}>
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-bold">프로필</h2>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="rounded-lg border bg-accent/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{currentProfile.email}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{currentProfile.email_verified ? "이메일 인증 완료" : "이메일 인증 필요"}</div>
                </div>
                <PlanBadge label={plan.label} tone={plan.tone} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border bg-card/80 px-3 py-2">
                  <div className="font-semibold text-muted-foreground">가입 플랜</div>
                  <div className="mt-1 font-bold">{plan.label}</div>
                </div>
                <div className="rounded-md border bg-card/80 px-3 py-2">
                  <div className="font-semibold text-muted-foreground">계정 상태</div>
                  <div className={`mt-1 font-bold ${plan.statusClass}`}>{plan.status}</div>
                </div>
              </div>
            </div>

            <label className="block text-sm font-semibold">
              이메일
              <Input className="mt-1.5" value={currentProfile.email} disabled />
            </label>
            <label className="block text-sm font-semibold">
              이름 또는 소속명
              <Input
                className="mt-1.5"
                value={draft?.academy_name || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toProfileDraft(currentProfile)), academy_name: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-semibold">
              사업자등록번호
              <Input
                className="mt-1.5"
                value={draft?.business_number || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toProfileDraft(currentProfile)), business_number: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-semibold">
              대표 전화
              <Input
                className="mt-1.5"
                value={draft?.phone || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toProfileDraft(currentProfile)), phone: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-semibold">
              주소
              <Input
                className="mt-1.5"
                value={draft?.address || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toProfileDraft(currentProfile)), address: event.target.value }))}
              />
            </label>

            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div>
                <div className="font-semibold">가입일</div>
                <div className="mt-1">{formatDateTime(currentProfile.created_at)}</div>
              </div>
              <div>
                <div className="font-semibold">최근 로그인</div>
                <div className="mt-1">{formatDateTime(currentProfile.last_login_at)}</div>
              </div>
            </div>

            {notice && <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">{notice}</p>}
            {error && <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </div>
    </Dialog>
  );
}
