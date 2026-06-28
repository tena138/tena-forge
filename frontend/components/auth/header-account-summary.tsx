"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";

import { WorkspaceMenuSection } from "@/components/auth/workspace-menu-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AcademyBilling, getAcademyBilling } from "@/lib/academyStudent";
import { AcademyProfile, fetchMe, logout, updateMe } from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, WORKSPACE_CHANGED_EVENT, authHttp, getAccessToken, getActiveWorkspaceId, readStoredAuthProfile, setAccessToken } from "@/lib/auth-client";
import { UsageSummary, getUsageSummary } from "@/lib/saas";
import { cn } from "@/lib/utils";

type PlanTone = "admin" | "trial" | "free" | "basic" | "pro" | "enterprise";

const planStyles: Record<PlanTone, string> = {
  admin: "border-black bg-black text-white",
  trial: "border-black bg-black text-white",
  free: "border-black/10 bg-zinc-100 text-zinc-700",
  basic: "border-black bg-black text-white",
  pro: "border-black bg-black text-white",
  enterprise: "border-black bg-black text-white",
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
  display_name: string;
  bio: string;
};

function profileDisplayName(profile: AcademyProfile) {
  return profile.display_name || profile.academy_name || "";
}

function toProfileDraft(profile: AcademyProfile): ProfileDraft {
  return {
    display_name: profileDisplayName(profile),
    bio: profile.bio || "",
  };
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

function resolveActiveAcademyId(profile?: AcademyProfile | null) {
  const activeWorkspaceId = getActiveWorkspaceId();
  if (activeWorkspaceId && activeWorkspaceId !== "student") return activeWorkspaceId;
  return profile?.account_type === "academy" ? profile.id : "";
}

function defaultStudentSeatLimit(plan?: string | null) {
  const key = String(plan || "").toLowerCase();
  if (key === "basic") return 5;
  if (key === "pro") return 10;
  return 0;
}

function formatUsageNumber(value: number, suffix = "") {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) >= 10_000) {
    return `${new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(safe)}${suffix}`;
  }
  const rounded = safe >= 100 ? Math.round(safe) : Math.round(safe * 10) / 10;
  return `${rounded.toLocaleString("ko-KR")}${suffix}`;
}

function formatUsagePercent(remaining: number, limit: number) {
  const safeLimit = Number.isFinite(limit) ? limit : 0;
  if (safeLimit <= 0) return "0%";
  const safeRemaining = Number.isFinite(remaining) ? remaining : 0;
  const percent = Math.round((Math.max(0, Math.min(safeRemaining, safeLimit)) / safeLimit) * 100);
  return `${percent}%`;
}

function buildUsageRows(summary: UsageSummary | null, billing: AcademyBilling | null, profile: AcademyProfile) {
  const rows: Array<{ label: string; value: string }> = [];

  if (summary) {
    const creditsUsed = summary.extraction_credits_used ?? 0;
    const creditsLimit = summary.monthly_credit_limit || summary.plan?.monthly_ai_tokens || 0;
    const creditsRemaining = summary.extraction_credits_remaining ?? Math.max(creditsLimit - creditsUsed, 0);
    const uploadUsed = summary.uploaded_mb_this_month ?? 0;
    const uploadLimit = summary.monthly_upload_mb_limit || 0;
    const uploadRemaining = Math.max(uploadLimit - uploadUsed, 0);
    const storageUsed = summary.storage_mb_used ?? 0;
    const storageLimit = summary.plan?.storage_quota_mb || 0;
    const storageRemaining = Math.max(storageLimit - storageUsed, 0);

    rows.push({ label: "AI credits", value: formatUsagePercent(creditsRemaining, creditsLimit) });
    rows.push({ label: "업로드", value: formatUsagePercent(uploadRemaining, uploadLimit) });
    rows.push({ label: "보관", value: formatUsagePercent(storageRemaining, storageLimit) });
  }

  if (billing) {
    const activeSeats = billing.active_seats ?? 0;
    const assignedSeats = billing.assigned_seats ?? 0;
    const seatLimit = billing.unlimited_seats ? Math.max(activeSeats, assignedSeats, 1) : billing.included_seats ?? defaultStudentSeatLimit(profile.plan);
    const seatValue = billing.unlimited_seats
      ? `${formatUsageNumber(activeSeats)}명 활성 / 무제한`
      : `${formatUsageNumber(Math.max(seatLimit - activeSeats, 0))} / ${formatUsageNumber(seatLimit)}명 남음`;
    rows.splice(1, 0, { label: "활성 가능 학생", value: seatValue });
  }

  return rows;
}

function AccountUsageSummary({
  summary,
  billing,
  profile,
  loading,
}: {
  summary: UsageSummary | null;
  billing: AcademyBilling | null;
  profile: AcademyProfile;
  loading: boolean;
}) {
  const rows = buildUsageRows(summary, billing, profile);
  if (!loading && rows.length === 0) return null;

  return (
    <div className="mt-3 rounded-[7px] bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase text-muted-foreground">사용량</div>
      {rows.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-zinc-500">{row.label}</span>
              <span className="text-right font-bold text-zinc-950">{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs font-semibold text-zinc-500">사용량 불러오는 중</div>
      )}
    </div>
  );
}

function PlanBadge({ label, tone, compact = false }: { label: string; tone: PlanTone; compact?: boolean }) {
  return (
    <Badge
      className={cn(
        "rounded-full border font-black leading-none shadow-none",
        compact ? "h-6 px-2 text-[11px]" : "px-2.5 text-xs",
        planStyles[tone]
      )}
    >
      <span>{label}</span>
    </Badge>
  );
}

export function HeaderAccountSummary({
  variant = "header",
  collapsed = false,
}: {
  variant?: "header" | "sidebar";
  collapsed?: boolean;
} = {}) {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [billingSummary, setBillingSummary] = useState<AcademyBilling | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

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

  useEffect(() => {
    if (!profile || (!open && !profileOpen)) return;
    let cancelled = false;

    async function loadAccountUsage() {
      setUsageLoading(true);
      const academyId = resolveActiveAcademyId(profile);
      const [usageResult, billingResult] = await Promise.allSettled([
        getUsageSummary(),
        academyId ? getAcademyBilling(academyId) : Promise.resolve(null),
      ]);

      if (cancelled) return;
      setUsageSummary(usageResult.status === "fulfilled" ? usageResult.value : null);
      setBillingSummary(billingResult.status === "fulfilled" ? billingResult.value : null);
      setUsageLoading(false);
    }

    void loadAccountUsage();
    const handleWorkspaceChange = () => {
      void loadAccountUsage();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
    };
  }, [open, profile, profileOpen]);

  if (!profile) {
    if (loading) {
      return <div className="h-9 w-44 animate-pulse rounded-[8px] bg-zinc-100" aria-label="계정 정보 로딩" />;
    }
    return (
      <Link href="/login">
        <Button size="sm" variant="outline">로그인</Button>
      </Link>
    );
  }

  const sidebar = variant === "sidebar";
  const currentProfile = profile;
  const plan = displayPlan(currentProfile);
  const accountName = profileDisplayName(currentProfile) || currentProfile.email || "Tena Forge";
  const accountEmail = currentProfile.email || "";
  const initials = accountName.slice(0, 1).toUpperCase() || "T";

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
    if (!draft.display_name.trim()) {
      setError("사용자 표시 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateMe({
        academy_name: draft.display_name.trim(),
        display_name: draft.display_name.trim(),
        bio: draft.bio.trim() || null,
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

  const accountButtonClassName = sidebar
    ? collapsed
      ? "group mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-transparent p-0 text-zinc-500 transition-all hover:border-black/10 hover:bg-zinc-200 hover:text-zinc-950"
      : "group flex h-11 w-full min-w-0 items-center gap-2 rounded-full border border-transparent bg-transparent px-2 text-left text-zinc-600 transition-all hover:border-black/10 hover:bg-zinc-200 hover:text-zinc-950"
    : "flex min-w-0 items-center gap-1.5 rounded-[8px] border border-transparent bg-transparent px-1 py-1 text-left shadow-none transition-all hover:border-transparent hover:bg-zinc-100 hover:shadow-none sm:gap-2.5 sm:px-2.5 sm:py-1.5";
  const menuClassName = sidebar
    ? cn(
        "fixed bottom-4 z-[2100] max-h-[calc(100vh-2rem)] w-[min(92vw,28rem)] overflow-y-auto rounded-[10px] bg-white p-2 text-sm text-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.16)] [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]",
        collapsed ? "left-[4.25rem]" : "left-[10.25rem]"
      )
    : "fixed left-4 right-4 top-[11rem] z-[80] mt-0 max-h-[calc(100vh-12rem)] w-auto overflow-y-auto rounded-[10px] bg-white p-2 text-sm text-zinc-950 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[calc(100vh-5.5rem)] sm:w-[min(92vw,28rem)]";

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
      <div className={cn("relative", sidebar && "w-full")}>
        <button
          type="button"
          className={accountButtonClassName}
          onClick={() => setOpen((value) => !value)}
          aria-label="계정 메뉴"
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-black font-bold text-white",
              sidebar ? "h-8 w-8 text-sm" : "h-7 w-7 text-xs sm:h-8 sm:w-8 sm:text-sm"
            )}
          >
            {initials}
          </span>
          {sidebar ? (
            !collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-zinc-700 group-hover:text-zinc-950">{accountName}</span>
                <span className="block truncate text-[11px] font-medium text-zinc-500">{plan.label}</span>
              </span>
            )
          ) : (
            <>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-[160px] truncate text-sm font-semibold text-foreground">{accountName}</span>
                <span className="block max-w-[180px] truncate text-xs text-muted-foreground">{accountEmail}</span>
              </span>
              <PlanBadge label={plan.label} tone={plan.tone} compact />
            </>
          )}
        </button>

      {open && (
        <div className={menuClassName}>
          <div className="rounded-[8px] bg-zinc-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{accountName}</div>
                <div className="truncate text-xs text-muted-foreground">{accountEmail}</div>
              </div>
              <PlanBadge label={plan.label} tone={plan.tone} />
            </div>
            <AccountUsageSummary summary={usageSummary} billing={billingSummary} profile={currentProfile} loading={usageLoading} />
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              {currentProfile.email_verified ? "이메일 인증 완료" : "이메일 인증 필요"}
            </div>
          </div>

          <WorkspaceMenuSection onClose={() => setOpen(false)} />

          <div className="mt-2 grid gap-1">
            <button type="button" className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950" onClick={openProfileEditor}>
              <UserRound className="h-4 w-4" />
              프로필
            </button>
            <button type="button" className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-left text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </div>
        </div>
      )}

      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-hidden border-0 bg-white p-0">
        <form onSubmit={saveProfile} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="shrink-0 bg-zinc-100 px-5 py-4">
            <h2 className="text-lg font-bold">프로필</h2>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]">
            <label className="block text-sm font-semibold text-zinc-950">
              사용자 표시 이름
              <Input
                className="mt-1.5"
                maxLength={120}
                value={draft?.display_name || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toProfileDraft(currentProfile)), display_name: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-semibold text-zinc-950">
              소개글
              <textarea
                className="mt-1.5 min-h-28 w-full resize-none rounded-[8px] border-0 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:bg-white focus:ring-2 focus:ring-black/10"
                maxLength={500}
                placeholder="짧은 소개를 입력해주세요."
                value={draft?.bio || ""}
                onChange={(event) => setDraft((current) => ({ ...(current || toProfileDraft(currentProfile)), bio: event.target.value }))}
              />
            </label>

            {notice && <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">{notice}</p>}
            {error && <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">{error}</p>}
          </div>

          <div className="flex shrink-0 justify-end gap-2 bg-zinc-50 px-5 py-4">
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
