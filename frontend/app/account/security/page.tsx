"use client";

import { useEffect, useState } from "react";
import { Loader2, Radio, RefreshCcw, Save, ShieldCheck, ShieldOff, X } from "lucide-react";

import { PasswordStrength } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AcademyProfile,
  SessionItem,
  changePassword,
  disableTotp,
  enableTotp,
  fetchMe,
  getLiveInteractionSettings,
  listLoginHistory,
  listOAuthAccounts,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  setupTotp,
  unlinkOAuthAccount,
  deleteAccount,
  resetAccountData,
  updateLiveInteractionSettings,
  type AccountDataResetResult,
  type LoginHistoryItem,
  type OAuthAccountItem,
} from "@/lib/auth-api";
import { formatKstMonthDayTime } from "@/lib/datetime";

function actionErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { detail?: unknown } }; message?: string }).response;
  const detail = response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail && "message" in detail && typeof detail.message === "string") return detail.message;
  return (error as { message?: string }).message || fallback;
}

function formatSecurityDateTime(value?: string | null) {
  return formatKstMonthDayTime(value, "-");
}

type SettingsSection = "security" | "lecture";
const ACTIVE_SESSION_PREVIEW_LIMIT = 3;

export default function AccountSecurityPage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccountItem[]>([]);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("security");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [setup, setSetup] = useState<{ qr_code_url: string; secret: string; backup_codes: string[] } | null>(null);
  const [setupStep, setSetupStep] = useState(1);
  const [totpCode, setTotpCode] = useState("");
  const [backupSaved, setBackupSaved] = useState(false);
  const [disableForm, setDisableForm] = useState({ password: "", totp_code: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetResult, setResetResult] = useState<AccountDataResetResult | null>(null);
  const [liveMinutes, setLiveMinutes] = useState(5);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");
  const [liveError, setLiveError] = useState("");

  async function load() {
    try {
      const [me, sessionList, historyList, oauthList] = await Promise.all([fetchMe(), listSessions(), listLoginHistory(), listOAuthAccounts()]);
      setProfile(me);
      setSessions(sessionList);
      if (sessionList.length <= ACTIVE_SESSION_PREVIEW_LIMIT) setShowAllSessions(false);
      setHistory(historyList);
      setOauthAccounts(oauthList);
      setError("");
    } catch (err) {
      setError(actionErrorMessage(err, "설정을 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    const readSectionFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSettingsSection(params.get("section") === "lecture" ? "lecture" : "security");
    };
    readSectionFromUrl();
    window.addEventListener("popstate", readSectionFromUrl);
    return () => window.removeEventListener("popstate", readSectionFromUrl);
  }, []);

  useEffect(() => {
    let active = true;
    setLiveLoading(true);
    getLiveInteractionSettings()
      .then((settings) => {
        if (!active) return;
        setLiveMinutes(settings.live_start_lead_minutes);
        setLiveError("");
      })
      .catch((err: any) => {
        if (!active) return;
        setLiveError(err?.response?.data?.detail || "수업 설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLiveLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function selectSettingsSection(nextSection: SettingsSection) {
    setSettingsSection(nextSection);
    setNotice("");
    setError("");
    setLiveNotice("");
    setLiveError("");
    window.history.replaceState(null, "", nextSection === "lecture" ? "/account/security?section=lecture" : "/account/security");
  }

  async function submitPassword() {
    if (passwords.next !== passwords.confirm) {
      setNotice("");
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setAction("password");
    setNotice("");
    setError("");
    try {
      await changePassword({ current_password: passwords.current, new_password: passwords.next });
      setPasswords({ current: "", next: "", confirm: "" });
      setNotice("비밀번호가 변경되었습니다. 다시 로그인해주세요.");
    } catch (err) {
      setError(actionErrorMessage(err, "비밀번호를 변경하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function startTotpSetup() {
    setAction("totp-setup");
    setNotice("");
    setError("");
    try {
      const data = await setupTotp();
      setSetup(data);
      setSetupStep(1);
      setBackupSaved(false);
    } catch (err) {
      setError(actionErrorMessage(err, "2단계 인증 설정을 시작하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function finishEnableTotp() {
    if (totpCode.length !== 6) {
      setNotice("");
      setError("6자리 인증 코드를 입력해주세요.");
      return;
    }
    setAction("totp-enable");
    setNotice("");
    setError("");
    try {
      await enableTotp(totpCode);
      setNotice("2단계 인증이 활성화되었습니다.");
      setSetupStep(4);
      setProfile((current) => current ? { ...current, totp_enabled: true, totp_enabled_at: new Date().toISOString() } : current);
    } catch (err) {
      setError(actionErrorMessage(err, "2단계 인증을 활성화하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function submitDisableTotp() {
    setAction("totp-disable");
    setNotice("");
    setError("");
    try {
      await disableTotp(disableForm);
      setDisableForm({ password: "", totp_code: "" });
      setNotice("2단계 인증이 비활성화되었습니다.");
      setProfile((current) => current ? { ...current, totp_enabled: false, totp_enabled_at: null } : current);
    } catch (err) {
      setError(actionErrorMessage(err, "2단계 인증을 비활성화하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function unlinkProvider(provider: string) {
    const key = providerKey(provider);
    setAction(`oauth:${key}`);
    setNotice("");
    setError("");
    try {
      await unlinkOAuthAccount(key);
      setNotice(`${provider} 연결을 해제했습니다.`);
      await load();
    } catch (err) {
      setError(actionErrorMessage(err, `${provider} 연결을 해제하지 못했습니다.`));
    } finally {
      setAction(null);
    }
  }

  async function endSession(sessionId: string) {
    setAction(`session:${sessionId}`);
    setNotice("");
    setError("");
    try {
      await revokeSession(sessionId);
      setNotice("선택한 세션을 종료했습니다.");
      await load();
    } catch (err) {
      setError(actionErrorMessage(err, "세션을 종료하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function endOtherSessions() {
    setAction("sessions-other");
    setNotice("");
    setError("");
    try {
      await revokeOtherSessions();
      setNotice("다른 기기의 세션을 모두 종료했습니다.");
      await load();
    } catch (err) {
      setError(actionErrorMessage(err, "다른 기기에서 로그아웃하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function submitAccountDataReset() {
    if (resetConfirmation.trim() !== "초기화") {
      setNotice("");
      setError("초기화하려면 확인 칸에 '초기화'를 정확히 입력해 주세요.");
      return;
    }
    if (!window.confirm("계정 데이터만 초기화합니다. 결제 플랜과 구입한 학생 키 수는 유지되지만, 클래스/학생/자료/일정/과제/발급 코드는 삭제됩니다. 계속할까요?")) return;
    setAction("data-reset");
    setNotice("");
    setError("");
    setResetResult(null);
    try {
      const result = await resetAccountData(resetPassword);
      setResetPassword("");
      setResetConfirmation("");
      setResetResult(result);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(actionErrorMessage(err, "계정 데이터를 초기화하지 못했습니다."));
    } finally {
      setAction(null);
    }
  }

  async function submitDeleteAccount() {
    if (!window.confirm("정말 계정을 삭제하시겠습니까? 모든 인증 데이터가 영구적으로 삭제됩니다.")) return;
    setAction("delete-account");
    setNotice("");
    setError("");
    try {
      await deleteAccount(deletePassword);
      window.location.href = "/register";
    } catch (err) {
      setError(actionErrorMessage(err, "계정을 삭제하지 못했습니다."));
      setAction(null);
    }
  }

  async function saveLiveSettings() {
    const nextMinutes = Math.max(0, Math.min(240, Number(liveMinutes) || 0));
    setLiveSaving(true);
    setLiveNotice("");
    setLiveError("");
    try {
      const settings = await updateLiveInteractionSettings({ live_start_lead_minutes: nextMinutes });
      setLiveMinutes(settings.live_start_lead_minutes);
      setLiveNotice("실시간 수업 시작 호출 시간이 저장되었습니다.");
    } catch (err: any) {
      setLiveError(err?.response?.data?.detail || "수업 설정을 저장하지 못했습니다.");
    } finally {
      setLiveSaving(false);
    }
  }

  if (!profile) return <div className="rounded-lg bg-white p-8 text-sm font-semibold text-zinc-500">{error || "설정을 불러오는 중..."}</div>;

  const settingsNavItemClass = (section: SettingsSection) =>
    `flex h-10 w-full items-center rounded-[8px] px-3 text-sm font-black transition ${
      settingsSection === section ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
    }`;
  const sessionPreview = sessions.slice(0, ACTIVE_SESSION_PREVIEW_LIMIT);
  const currentSessionOutsidePreview = sessions.find((session) => session.is_current && !sessionPreview.some((item) => item.id === session.id));
  const visibleSessions = showAllSessions
    ? sessions
    : currentSessionOutsidePreview
      ? [currentSessionOutsidePreview, ...sessionPreview.slice(0, ACTIVE_SESSION_PREVIEW_LIMIT - 1)]
      : sessionPreview;
  const hiddenSessionCount = Math.max(0, sessions.length - ACTIVE_SESSION_PREVIEW_LIMIT);

  const lectureSettingsContent = (
    <Card>
      <CardHeader><CardTitle>수업 설정</CardTitle></CardHeader>
      <CardContent className="space-y-5">
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
          {liveLoading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
        </div>

        <div className="grid gap-3 sm:max-w-sm">
          <label className="text-xs font-black text-zinc-500" htmlFor="live-start-lead-minutes">
            시작 버튼 노출 시간
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              id="live-start-lead-minutes"
              value={liveMinutes}
              min={0}
              max={240}
              type="number"
              onChange={(event) => setLiveMinutes(Number(event.target.value))}
              className="h-11 rounded-[8px] border-0 bg-[#f2f2f2] px-3 text-sm font-bold text-zinc-950 outline-none transition focus:bg-[#f2f2f2] focus:ring-2 focus:ring-black/10"
            />
            <div className="inline-flex h-11 items-center rounded-[8px] bg-[#f2f2f2] px-3 text-sm font-bold text-zinc-500">분 전</div>
          </div>
          <button
            type="button"
            onClick={saveLiveSettings}
            disabled={liveLoading || liveSaving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-black px-4 text-sm font-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {liveSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </button>
          {liveNotice ? <p className="rounded-[7px] bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-900">{liveNotice}</p> : null}
          {liveError ? <p className="rounded-[7px] bg-zinc-950 px-3 py-2 text-xs font-bold text-white">{liveError}</p> : null}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[148px_minmax(0,1fr)]">
      <aside className="h-fit rounded-[10px] bg-white p-2 lg:sticky lg:top-24">
        <div className="px-2 pb-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">설정</div>
        <div className="grid gap-1">
          <button type="button" className={settingsNavItemClass("security")} onClick={() => selectSettingsSection("security")}>
            보안
          </button>
          <button type="button" className={settingsNavItemClass("lecture")} onClick={() => selectSettingsSection("lecture")}>
            수업 설정
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        {settingsSection === "security" ? (
          <>
            {notice && <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-800">{notice}</div>}
            {error && <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950">{error}</div>}

      <Card>
        <CardHeader><CardTitle>비밀번호 변경</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Input type="password" placeholder="현재 비밀번호" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} />
          <div>
            <Input type="password" placeholder="새 비밀번호" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} />
            <PasswordStrength password={passwords.next} />
          </div>
          <Input type="password" placeholder="새 비밀번호 확인" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
          <Button className="md:col-span-3" disabled={action === "password"} onClick={submitPassword}>
            {action === "password" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {action === "password" ? "변경 중" : "비밀번호 변경"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2단계 인증</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-lg p-4 ${profile.totp_enabled ? "bg-zinc-100" : "bg-zinc-50"}`}>
            <div className="flex items-center gap-2 text-lg font-bold">
              {profile.totp_enabled ? <ShieldCheck className="h-5 w-5 text-zinc-800" /> : <ShieldOff className="h-5 w-5 text-zinc-500" />}
              {profile.totp_enabled ? "활성화" : "비활성화"}
            </div>
            {profile.totp_enabled_at && <p className="mt-1 text-sm text-zinc-500">활성화일: {new Date(profile.totp_enabled_at).toLocaleDateString("ko-KR")}</p>}
          </div>
          {profile.totp_enabled ? (
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input type="password" placeholder="비밀번호" value={disableForm.password} onChange={(event) => setDisableForm({ ...disableForm, password: event.target.value })} />
              <Input placeholder="6자리 인증 코드" value={disableForm.totp_code} onChange={(event) => setDisableForm({ ...disableForm, totp_code: event.target.value.replace(/\D/g, "").slice(0, 6) })} />
              <Button variant="outline" disabled={action === "totp-disable"} onClick={submitDisableTotp}>
                {action === "totp-disable" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {action === "totp-disable" ? "처리 중" : "비활성화"}
              </Button>
            </div>
          ) : (
            <Button disabled={action === "totp-setup"} onClick={startTotpSetup}>
              {action === "totp-setup" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {action === "totp-setup" ? "준비 중" : "2단계 인증 설정하기"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>연결된 소셜 계정</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {["카카오"].map((provider) => {
            const connected = oauthAccounts.some((item) => providerName(item.provider) === provider);
            return (
              <div key={provider} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3">
              <div>
                <div className="font-semibold">{provider}</div>
                <div className="text-xs text-zinc-500">{connected ? "연결됨" : "연결되지 않음"}</div>
              </div>
              {connected ? (
                <Button variant="outline" size="sm" disabled={action === `oauth:${providerKey(provider)}`} onClick={() => unlinkProvider(provider)}>
                  {action === `oauth:${providerKey(provider)}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {action === `oauth:${providerKey(provider)}` ? "해제 중" : "해제"}
                </Button>
              ) : (
                <a className="inline-flex h-8 items-center rounded-md bg-black px-3 text-xs font-semibold text-white transition-colors hover:bg-zinc-800" href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/auth/${providerKey(provider)}`}>연결</a>
              )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>활성 세션</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left text-zinc-500"><tr><th className="p-2">기기</th><th className="hidden p-2 md:table-cell">브라우저</th><th className="hidden p-2 md:table-cell">IP</th><th className="hidden p-2 md:table-cell">마지막 활동</th><th className="p-2 text-right md:text-left">액션</th></tr></thead>
              <tbody>
                {visibleSessions.map((session) => (
                  <tr key={session.id} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-2">
                      <div className="font-medium">{session.device_info || "Unknown"} {session.is_current ? "(현재)" : ""}</div>
                      <div className="mt-1 space-y-0.5 text-xs text-zinc-500 md:hidden">
                        <div>{session.browser} / {session.os}</div>
                        <div>{session.ip_address}</div>
                        <div>{formatSecurityDateTime(session.last_active_at)}</div>
                      </div>
                    </td>
                    <td className="hidden p-2 md:table-cell">{session.browser} / {session.os}</td>
                    <td className="hidden p-2 md:table-cell">{session.ip_address}</td>
                    <td className="hidden p-2 md:table-cell">{formatSecurityDateTime(session.last_active_at)}</td>
                    <td className="p-2 text-right md:text-left">
                      {session.is_current ? "현재" : (
                        <Button variant="outline" size="sm" disabled={action === `session:${session.id}`} onClick={() => endSession(session.id)}>
                          {action === `session:${session.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {action === `session:${session.id}` ? "종료 중" : "종료"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenSessionCount > 0 ? (
            <Button variant="outline" onClick={() => setShowAllSessions((current) => !current)}>
              {showAllSessions ? "접기" : `자세히 보기 (${hiddenSessionCount}개 더)`}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={action === "sessions-other"} onClick={endOtherSessions}>
            {action === "sessions-other" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {action === "sessions-other" ? "로그아웃 중" : "모든 다른 기기에서 로그아웃"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>최근 로그인 기록</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left text-zinc-500"><tr><th className="p-2">날짜/시간</th><th className="hidden p-2 md:table-cell">기기</th><th className="hidden p-2 md:table-cell">IP</th><th className="p-2 text-right md:text-left">결과</th></tr></thead>
              <tbody>
                {history.slice(0, 30).map((item) => (
                  <tr key={item.id} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-2">
                      <div>{formatSecurityDateTime(item.login_at)}</div>
                      <div className="mt-1 space-y-0.5 text-xs text-zinc-500 md:hidden">
                        <div>{item.browser} on {item.os}</div>
                        <div>{item.ip_address}</div>
                      </div>
                    </td>
                    <td className="hidden p-2 md:table-cell">{item.browser} on {item.os}</td>
                    <td className="hidden p-2 md:table-cell">{item.ip_address}</td>
                    <td className="p-2 text-right font-semibold text-zinc-700 md:text-left">{item.success ? "성공" : `실패 ${item.failure_reason || ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-950">
            <RefreshCcw className="h-5 w-5" />
            계정 데이터 초기화
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[8px] bg-zinc-100 p-4 text-sm leading-6 text-zinc-700">
            계정, 로그인, 결제 플랜, 구입한 학생 키 수와 스태프 좌석은 유지됩니다. 클래스, 학생 연결, 발급된 기존 코드,
            자료, 일정, 과제, 시험, 오답, 알림 등 운영 데이터만 삭제됩니다.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input type="password" placeholder="비밀번호 확인" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
            <Input placeholder="초기화 입력" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} />
          </div>
          {resetResult ? (
            <div className="rounded-[8px] border border-zinc-200 bg-white p-3 text-xs font-bold text-zinc-600">
              삭제된 데이터 {resetResult.total_deleted.toLocaleString("ko-KR")}개 · 보존된 추가 학생 키 {resetResult.preserved.purchased_additional_student_keys.toLocaleString("ko-KR")}개 · 보존된 스태프 좌석 {resetResult.preserved.purchased_staff_seats.toLocaleString("ko-KR")}개
            </div>
          ) : null}
          <Button variant="outline" disabled={!resetPassword || resetConfirmation.trim() !== "초기화" || action === "data-reset"} onClick={submitAccountDataReset}>
            {action === "data-reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {action === "data-reset" ? "초기화 중" : "데이터 초기화"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-zinc-950">계정 삭제</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-500">모든 데이터가 영구적으로 삭제됩니다.</p>
          <Input type="password" placeholder="비밀번호 확인" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
          <Button variant="destructive" disabled={!deletePassword || action === "delete-account"} onClick={submitDeleteAccount}>
            {action === "delete-account" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {action === "delete-account" ? "삭제 중" : "계정 삭제"}
          </Button>
        </CardContent>
      </Card>
          </>
        ) : (
          lectureSettingsContent
        )}

      {setup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[14px] bg-white p-5 text-zinc-950 shadow-[0_24px_80px_rgba(15,15,15,0.22)] sm:p-6">
            <button
              type="button"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
              onClick={() => setSetup(null)}
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
            {setupStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">인증 앱 설치</h2>
                <p className="pr-10 text-sm text-zinc-500">Google Authenticator, Authy 같은 인증 앱을 준비해주세요.</p>
                <Button onClick={() => setSetupStep(2)}>다음</Button>
              </div>
            )}
            {setupStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">QR 코드 스캔</h2>
                <img src={setup.qr_code_url} alt="" className="mx-auto h-56 w-56 rounded-lg bg-zinc-50 p-3" />
                <p className="rounded-md bg-zinc-100 p-3 text-center text-sm font-semibold text-zinc-950">수동 입력 코드: {setup.secret}</p>
                <Button onClick={() => setSetupStep(3)}>다음</Button>
              </div>
            )}
            {setupStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">인증 코드 확인</h2>
                <Input placeholder="6자리 코드" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                <Button disabled={action === "totp-enable"} onClick={finishEnableTotp}>
                  {action === "totp-enable" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {action === "totp-enable" ? "활성화 중" : "활성화"}
                </Button>
              </div>
            )}
            {setupStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">백업 코드 저장</h2>
                <div className="grid grid-cols-2 gap-2">
                  {setup.backup_codes.map((code) => <code key={code} className="rounded bg-zinc-100 p-2 text-center font-bold text-zinc-950">{code}</code>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => navigator.clipboard.writeText(setup.backup_codes.join("\n"))}>복사</Button>
                  <Button variant="secondary" onClick={() => downloadBackupCodes(setup.backup_codes)}>다운로드 TXT</Button>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold"><input className="accent-black" type="checkbox" checked={backupSaved} onChange={(event) => setBackupSaved(event.target.checked)} /> 백업 코드를 안전한 곳에 저장했습니다</label>
                <Button disabled={!backupSaved} onClick={() => setSetup(null)}>완료</Button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function downloadBackupCodes(codes: string[]) {
  const blob = new Blob([codes.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tena-forge-backup-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function providerName(provider: string) {
  return provider === "kakao" ? "카카오" : provider;
}

function providerKey(name: string) {
  return "kakao";
}
