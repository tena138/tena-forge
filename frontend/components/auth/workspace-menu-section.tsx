"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, KeyRound, Loader2, ShieldCheck, UserPlus, Users, X } from "lucide-react";

import {
  StaffInviteCode,
  StaffMember,
  StaffPermissionPayload,
  StaffSeatStatus,
  WorkspacePermissions,
  WorkspaceSummary,
  claimStaffInviteCode,
  createWorkspaceStaffInviteCode,
  listWorkspaceStaff,
  listWorkspaceStaffInviteCodes,
  listWorkspaces,
  removeWorkspaceStaff,
  revokeWorkspaceStaffInviteCode,
  updateWorkspaceStaff,
} from "@/lib/auth-api";
import { AUTH_CHANGED_EVENT, WORKSPACE_CHANGED_EVENT, getActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type PermissionKey = Exclude<keyof WorkspacePermissions, "can_manage_billing">;

const permissionOptions: { key: PermissionKey; label: string }[] = [
  { key: "can_manage_materials", label: "자료/문제" },
  { key: "can_manage_assignments", label: "클래스/과제" },
  { key: "can_manage_students", label: "학생관리" },
  { key: "can_manage_seats", label: "학생 좌석" },
  { key: "can_manage_schedule", label: "일정/상담" },
  { key: "can_manage_coagent", label: "Co-Agent" },
];

function workspaceKey(item: WorkspaceSummary) {
  return item.type === "student" ? "student" : item.id;
}

function roleLabel(role: string) {
  if (role === "owner") return "소유자";
  if (role === "student") return "학생 앱";
  if (role === "teacher") return "강사";
  if (role === "assistant") return "보조 강사";
  if (role === "admin") return "관리자";
  return role;
}

function seatText(status?: StaffSeatStatus | null) {
  if (!status) return "좌석 정보 없음";
  return `${status.active_staff}명 활성 · ${status.pending_invites}개 초대 · ${status.available_staff_seats}명 남음`;
}

function defaultInvitePermissions(): Record<PermissionKey, boolean> {
  return {
    can_manage_materials: true,
    can_manage_assignments: true,
    can_manage_students: true,
    can_manage_seats: false,
    can_manage_schedule: true,
    can_manage_coagent: false,
  };
}

export function WorkspaceMenuSection({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [claimNotice, setClaimNotice] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listWorkspaces();
      const stored = getActiveWorkspaceId();
      const fallback = data.items[0] ? workspaceKey(data.items[0]) : null;
      const nextActive = stored || data.active_workspace_id || fallback;
      setItems(data.items);
      setActiveId(nextActive || null);
      if (!stored && nextActive) setActiveWorkspaceId(nextActive);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "워크스페이스 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const sync = () => {
      setActiveId(getActiveWorkspaceId());
      load();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, sync);
    };
  }, []);

  const activeWorkspace = useMemo(() => items.find((item) => workspaceKey(item) === activeId) || null, [activeId, items]);
  const ownerWorkspace = activeWorkspace?.type === "academy" && activeWorkspace.role === "owner" ? activeWorkspace : null;

  function switchWorkspace(item: WorkspaceSummary) {
    const next = workspaceKey(item);
    setActiveWorkspaceId(next);
    setActiveId(next);
    setStaffOpen(false);
    onClose?.();
    router.push(item.type === "student" ? "/student" : "/academy");
    router.refresh();
  }

  async function submitClaim() {
    const code = claimCode.trim();
    if (!code) return;
    setClaiming(true);
    setError("");
    setClaimNotice("");
    try {
      const result = await claimStaffInviteCode(code);
      const next = workspaceKey(result.workspace);
      setActiveWorkspaceId(next);
      setActiveId(next);
      setClaimCode("");
      setClaimNotice(`${result.workspace.name} 워크스페이스에 합류했습니다.`);
      await load();
      router.push("/academy");
      router.refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "초대 코드를 확인하지 못했습니다.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <section className="mt-2 rounded-[8px] border border-white/10 bg-white/[0.045] p-2">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">내 워크스페이스</div>
          <div className="text-xs text-muted-foreground">학생 앱과 학원 콘솔 전환</div>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>

      <div className="grid gap-1">
        {items.map((item) => {
          const key = workspaceKey(item);
          const selected = key === activeId;
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchWorkspace(item)}
              className={cn(
                "flex min-w-0 items-center justify-between gap-3 rounded-[7px] px-3 py-2 text-left transition",
                selected ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{item.name}</span>
                <span className={cn("block truncate text-xs", selected ? "text-slate-600" : "text-muted-foreground")}>{roleLabel(item.role)}</span>
              </span>
              {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid gap-2 rounded-[7px] border border-white/10 bg-black/20 p-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <KeyRound className="h-3.5 w-3.5" />
          강사 초대 코드
        </div>
        <div className="flex gap-2">
          <input
            value={claimCode}
            onChange={(event) => setClaimCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitClaim();
            }}
            placeholder="TF-XXXX-XXXX-XXXX"
            className="h-9 min-w-0 flex-1 rounded-[7px] border border-white/10 bg-black/30 px-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-white/40"
          />
          <button
            type="button"
            onClick={submitClaim}
            disabled={claiming || !claimCode.trim()}
            className="inline-flex h-9 items-center justify-center rounded-[7px] bg-white px-3 text-xs font-black text-slate-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "입력"}
          </button>
        </div>
        {claimNotice ? <p className="text-xs font-semibold text-slate-200">{claimNotice}</p> : null}
        {error ? <p className="text-xs font-semibold text-zinc-300">{error}</p> : null}
      </div>

      {ownerWorkspace ? (
        <div className="mt-2 rounded-[7px] border border-white/10 bg-black/20 p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-300">강사 좌석</div>
              <div className="mt-1 text-xs text-muted-foreground">{seatText(ownerWorkspace.seat_status)}</div>
            </div>
            <button
              type="button"
              onClick={() => setStaffOpen((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-white/10 px-2.5 text-xs font-black text-slate-200 transition hover:bg-white/[0.07] hover:text-white"
            >
              <Users className="h-3.5 w-3.5" />
              관리
            </button>
          </div>
          {staffOpen ? <StaffManager academyId={ownerWorkspace.id} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function StaffManager({ academyId }: { academyId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [inviteCodes, setInviteCodes] = useState<StaffInviteCode[]>([]);
  const [seatStatus, setSeatStatus] = useState<StaffSeatStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [newCode, setNewCode] = useState("");
  const [inviteRole, setInviteRole] = useState("teacher");
  const [inviteDays, setInviteDays] = useState(7);
  const [invitePermissions, setInvitePermissions] = useState<Record<PermissionKey, boolean>>(defaultInvitePermissions);

  async function loadStaff() {
    setLoading(true);
    setError("");
    try {
      const [staffData, inviteData] = await Promise.all([listWorkspaceStaff(academyId), listWorkspaceStaffInviteCodes(academyId)]);
      setStaff(staffData.staff);
      setInviteCodes(inviteData.invite_codes);
      setSeatStatus(inviteData.seat_status || staffData.seat_status);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "강사 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, [academyId]);

  async function createInvite() {
    setSavingKey("invite");
    setError("");
    setNewCode("");
    try {
      const payload: StaffPermissionPayload & { expires_in_days: number } = {
        role: inviteRole,
        expires_in_days: inviteDays,
        ...invitePermissions,
      };
      const created = await createWorkspaceStaffInviteCode(academyId, payload);
      setNewCode(created.code || "");
      await loadStaff();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "초대 코드를 만들지 못했습니다.");
    } finally {
      setSavingKey("");
    }
  }

  async function updateMember(member: StaffMember, payload: StaffPermissionPayload) {
    setSavingKey(member.user_id);
    setError("");
    try {
      await updateWorkspaceStaff(academyId, member.user_id, payload);
      await loadStaff();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "강사 권한을 저장하지 못했습니다.");
    } finally {
      setSavingKey("");
    }
  }

  async function removeMember(member: StaffMember) {
    setSavingKey(member.user_id);
    setError("");
    try {
      await removeWorkspaceStaff(academyId, member.user_id);
      await loadStaff();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "강사를 비활성화하지 못했습니다.");
    } finally {
      setSavingKey("");
    }
  }

  async function revokeInvite(code: StaffInviteCode) {
    setSavingKey(code.id);
    setError("");
    try {
      await revokeWorkspaceStaffInviteCode(academyId, code.id);
      await loadStaff();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "초대 코드를 회수하지 못했습니다.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <div className="mt-3 max-h-[70vh] overflow-y-auto rounded-[7px] border border-white/10 bg-[#06070b] p-2">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <div className="text-xs font-black text-white">강사 관리</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{seatText(seatStatus)}</div>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>

      <div className="mt-3 grid gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <UserPlus className="h-3.5 w-3.5" />
          새 초대 코드
        </div>
        <div className="grid gap-2">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="h-9 rounded-[7px] border border-white/10 bg-black/30 px-2 text-xs font-semibold text-white outline-none focus:border-white/40">
              <option value="teacher">강사</option>
              <option value="assistant">보조 강사</option>
            </select>
            <input value={inviteDays} min={1} max={30} type="number" onChange={(event) => setInviteDays(Number(event.target.value) || 7)} className="h-9 rounded-[7px] border border-white/10 bg-black/30 px-2 text-xs font-semibold text-white outline-none focus:border-white/40" aria-label="초대 만료일" />
          </div>
          <PermissionChecks value={invitePermissions} onChange={setInvitePermissions} />
          <button type="button" onClick={createInvite} disabled={savingKey === "invite"} className="inline-flex h-9 items-center justify-center gap-2 rounded-[7px] bg-white px-3 text-xs font-black text-slate-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45">
            {savingKey === "invite" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            코드 발급
          </button>
          {newCode ? (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(newCode)}
              className="flex items-center justify-between gap-2 rounded-[7px] border border-white/10 bg-white/[0.05] px-3 py-2 text-left font-mono text-xs text-white"
              title="복사"
            >
              <span className="truncate">{newCode}</span>
              <Clipboard className="h-3.5 w-3.5 shrink-0" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <div className="text-xs font-bold text-slate-200">활성 강사</div>
        {staff.length ? (
          staff.map((member) => (
            <div key={member.id} className="rounded-[7px] border border-white/10 bg-white/[0.035] p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-white">{member.user?.name || member.user?.email || member.user_id}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{roleLabel(member.role)} · {member.is_active ? "활성" : "비활성"}</div>
                </div>
                <button type="button" onClick={() => removeMember(member)} disabled={savingKey === member.user_id} className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] border border-white/10 text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-45" aria-label="강사 비활성화">
                  {savingKey === member.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {permissionOptions.map((option) => {
                  const enabled = Boolean(member.permissions?.[option.key]);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => updateMember(member, { [option.key]: !enabled } as StaffPermissionPayload)}
                      className={cn(
                        "rounded-[6px] border px-2 py-1 text-[11px] font-bold transition",
                        enabled ? "border-white/30 bg-white text-slate-950" : "border-white/10 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-muted-foreground">아직 초대된 강사가 없습니다.</div>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          미사용 초대 코드
        </div>
        {inviteCodes.length ? (
          inviteCodes.map((code) => (
            <div key={code.id} className="flex items-center justify-between gap-2 rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-black text-white">****{code.code_preview}</div>
                <div className="truncate text-[11px] text-muted-foreground">{roleLabel(code.role)} · {new Date(code.expires_at).toLocaleDateString("ko-KR")} 만료</div>
              </div>
              <button type="button" onClick={() => revokeInvite(code)} disabled={savingKey === code.id} className="rounded-[6px] border border-white/10 px-2 py-1 text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-45">
                회수
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-muted-foreground">대기 중인 초대 코드가 없습니다.</div>
        )}
      </div>

      {error ? <p className="mt-3 text-xs font-semibold text-zinc-300">{error}</p> : null}
    </div>
  );
}

function PermissionChecks({ value, onChange }: { value: Record<PermissionKey, boolean>; onChange: (value: Record<PermissionKey, boolean>) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {permissionOptions.map((option) => {
        const enabled = Boolean(value[option.key]);
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange({ ...value, [option.key]: !enabled })}
            className={cn(
              "rounded-[6px] border px-2 py-1 text-[11px] font-bold transition",
              enabled ? "border-white/30 bg-white text-slate-950" : "border-white/10 text-slate-400 hover:bg-white/[0.07] hover:text-white"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
