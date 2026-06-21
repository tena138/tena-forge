"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff, X } from "lucide-react";

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
  listLoginHistory,
  listOAuthAccounts,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  setupTotp,
  unlinkOAuthAccount,
  deleteAccount,
  type LoginHistoryItem,
  type OAuthAccountItem,
} from "@/lib/auth-api";

function actionErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { detail?: unknown } }; message?: string }).response;
  const detail = response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail && "message" in detail && typeof detail.message === "string") return detail.message;
  return (error as { message?: string }).message || fallback;
}

export default function AccountSecurityPage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccountItem[]>([]);
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

  async function load() {
    try {
      const [me, sessionList, historyList, oauthList] = await Promise.all([fetchMe(), listSessions(), listLoginHistory(), listOAuthAccounts()]);
      setProfile(me);
      setSessions(sessionList);
      setHistory(historyList);
      setOauthAccounts(oauthList);
      setError("");
    } catch (err) {
      setError(actionErrorMessage(err, "보안 설정을 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

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

  if (!profile) return <div className="rounded-lg bg-white p-8 text-sm font-semibold text-zinc-500 shadow-sm">{error || "보안 설정을 불러오는 중..."}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
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
              <div key={provider} className="flex items-center justify-between gap-3 rounded-lg border p-3">
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
              <thead className="border-y border-zinc-100 bg-zinc-50 text-left text-zinc-500"><tr><th className="p-2">기기</th><th className="hidden p-2 md:table-cell">브라우저</th><th className="hidden p-2 md:table-cell">IP</th><th className="hidden p-2 md:table-cell">마지막 활동</th><th className="p-2 text-right md:text-left">액션</th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t border-zinc-100">
                    <td className="p-2">
                      <div className="font-medium">{session.device_info || "Unknown"} {session.is_current ? "(현재)" : ""}</div>
                      <div className="mt-1 space-y-0.5 text-xs text-zinc-500 md:hidden">
                        <div>{session.browser} / {session.os}</div>
                        <div>{session.ip_address}</div>
                        <div>{new Date(session.last_active_at).toLocaleString("ko-KR")}</div>
                      </div>
                    </td>
                    <td className="hidden p-2 md:table-cell">{session.browser} / {session.os}</td>
                    <td className="hidden p-2 md:table-cell">{session.ip_address}</td>
                    <td className="hidden p-2 md:table-cell">{new Date(session.last_active_at).toLocaleString("ko-KR")}</td>
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
              <thead className="border-y border-zinc-100 bg-zinc-50 text-left text-zinc-500"><tr><th className="p-2">날짜/시간</th><th className="hidden p-2 md:table-cell">기기</th><th className="hidden p-2 md:table-cell">IP</th><th className="p-2 text-right md:text-left">결과</th></tr></thead>
              <tbody>
                {history.slice(0, 30).map((item) => (
                  <tr key={item.id} className="border-t border-zinc-100">
                    <td className="p-2">
                      <div>{new Date(item.login_at).toLocaleString("ko-KR")}</div>
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

      {setup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-xl bg-white p-6 text-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
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
                <img src={setup.qr_code_url} alt="" className="mx-auto h-56 w-56 rounded-lg bg-white p-3 shadow-inner" />
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
