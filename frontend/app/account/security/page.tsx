"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";

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

export default function AccountSecurityPage() {
  const [profile, setProfile] = useState<AcademyProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccountItem[]>([]);
  const [notice, setNotice] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [setup, setSetup] = useState<{ qr_code_url: string; secret: string; backup_codes: string[] } | null>(null);
  const [setupStep, setSetupStep] = useState(1);
  const [totpCode, setTotpCode] = useState("");
  const [backupSaved, setBackupSaved] = useState(false);
  const [disableForm, setDisableForm] = useState({ password: "", totp_code: "" });
  const [deletePassword, setDeletePassword] = useState("");

  async function load() {
    const [me, sessionList, historyList, oauthList] = await Promise.all([fetchMe(), listSessions(), listLoginHistory(), listOAuthAccounts()]);
    setProfile(me);
    setSessions(sessionList);
    setHistory(historyList);
    setOauthAccounts(oauthList);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submitPassword() {
    if (passwords.next !== passwords.confirm) {
      setNotice("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    await changePassword({ current_password: passwords.current, new_password: passwords.next });
    setPasswords({ current: "", next: "", confirm: "" });
    setNotice("비밀번호가 변경되었습니다. 다시 로그인해주세요.");
  }

  async function startTotpSetup() {
    const data = await setupTotp();
    setSetup(data);
    setSetupStep(1);
    setBackupSaved(false);
  }

  async function finishEnableTotp() {
    await enableTotp(totpCode);
    setNotice("2단계 인증이 활성화되었습니다.");
    setSetupStep(4);
    await load();
  }

  async function submitDisableTotp() {
    await disableTotp(disableForm);
    setDisableForm({ password: "", totp_code: "" });
    setNotice("2단계 인증이 비활성화되었습니다.");
    await load();
  }

  async function submitDeleteAccount() {
    if (!window.confirm("정말 계정을 삭제하시겠습니까? 모든 인증 데이터가 영구적으로 삭제됩니다.")) return;
    await deleteAccount(deletePassword);
    window.location.href = "/register";
  }

  if (!profile) return <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">보안 설정을 불러오는 중...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {notice && <div className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">{notice}</div>}

      <Card>
        <CardHeader><CardTitle>비밀번호 변경</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Input type="password" placeholder="현재 비밀번호" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} />
          <div>
            <Input type="password" placeholder="새 비밀번호" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} />
            <PasswordStrength password={passwords.next} />
          </div>
          <Input type="password" placeholder="새 비밀번호 확인" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
          <Button className="md:col-span-3" onClick={submitPassword}>비밀번호 변경</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2단계 인증</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-lg border p-4 ${profile.totp_enabled ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-white/[0.04]"}`}>
            <div className="flex items-center gap-2 text-lg font-bold">
              {profile.totp_enabled ? <ShieldCheck className="h-5 w-5 text-emerald-300" /> : <ShieldOff className="h-5 w-5 text-slate-400" />}
              {profile.totp_enabled ? "활성화" : "비활성화"}
            </div>
            {profile.totp_enabled_at && <p className="mt-1 text-sm text-slate-400">활성화일: {new Date(profile.totp_enabled_at).toLocaleDateString("ko-KR")}</p>}
          </div>
          {profile.totp_enabled ? (
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input type="password" placeholder="비밀번호" value={disableForm.password} onChange={(event) => setDisableForm({ ...disableForm, password: event.target.value })} />
              <Input placeholder="6자리 인증 코드" value={disableForm.totp_code} onChange={(event) => setDisableForm({ ...disableForm, totp_code: event.target.value.replace(/\D/g, "").slice(0, 6) })} />
              <Button variant="outline" onClick={submitDisableTotp}>비활성화</Button>
            </div>
          ) : (
            <Button onClick={startTotpSetup}>2단계 인증 설정하기</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>연결된 소셜 계정</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {["카카오", "네이버"].map((provider) => {
            const connected = oauthAccounts.some((item) => providerName(item.provider) === provider);
            return (
              <div key={provider} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="font-semibold">{provider}</div>
                <div className="text-xs text-slate-400">{connected ? "연결됨" : "연결되지 않음"}</div>
              </div>
              {connected ? (
                <Button variant="outline" size="sm" onClick={() => unlinkOAuthAccount(providerKey(provider)).then(load)}>해제</Button>
              ) : (
                <a className="inline-flex h-8 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]" href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/auth/${providerKey(provider)}`}>연결</a>
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
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-y border-white/10 bg-white/[0.04] text-left text-slate-400"><tr><th className="p-2">기기</th><th className="p-2">브라우저</th><th className="p-2">IP</th><th className="p-2">마지막 활동</th><th className="p-2">액션</th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t border-white/8">
                    <td className="p-2">{session.device_info || "Unknown"} {session.is_current ? "(현재)" : ""}</td>
                    <td className="p-2">{session.browser} / {session.os}</td>
                    <td className="p-2">{session.ip_address}</td>
                    <td className="p-2">{new Date(session.last_active_at).toLocaleString("ko-KR")}</td>
                    <td className="p-2">{session.is_current ? "현재" : <Button variant="outline" size="sm" onClick={() => revokeSession(session.id).then(load)}>종료</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" className="border-red-400/30 text-red-200 hover:bg-red-400/10 hover:text-red-100" onClick={() => revokeOtherSessions().then(load)}>모든 다른 기기에서 로그아웃</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>최근 로그인 기록</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-y border-white/10 bg-white/[0.04] text-left text-slate-400"><tr><th className="p-2">날짜/시간</th><th className="p-2">기기</th><th className="p-2">IP</th><th className="p-2">결과</th></tr></thead>
              <tbody>
                {history.slice(0, 30).map((item) => (
                  <tr key={item.id} className="border-t border-white/8">
                    <td className="p-2">{new Date(item.login_at).toLocaleString("ko-KR")}</td>
                    <td className="p-2">{item.browser} on {item.os}</td>
                    <td className="p-2">{item.ip_address}</td>
                    <td className={`p-2 font-semibold ${item.success ? "text-emerald-300" : "text-red-300"}`}>{item.success ? "성공" : `실패 ${item.failure_reason || ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-red-300">계정 삭제</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-400">모든 데이터가 영구적으로 삭제됩니다.</p>
          <Input type="password" placeholder="비밀번호 확인" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
          <Button variant="destructive" disabled={!deletePassword} onClick={submitDeleteAccount}>계정 삭제</Button>
        </CardContent>
      </Card>

      {setup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#090b12] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            {setupStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">인증 앱 설치</h2>
                <p className="text-sm text-slate-400">Google Authenticator, Naver OTP, Authy 같은 인증 앱을 준비해주세요.</p>
                <Button onClick={() => setSetupStep(2)}>다음</Button>
              </div>
            )}
            {setupStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">QR 코드 스캔</h2>
                <img src={setup.qr_code_url} alt="" className="mx-auto h-56 w-56" />
                <p className="rounded-md border border-white/10 bg-white/[0.06] p-3 text-center text-sm font-semibold text-slate-100">수동 입력 코드: {setup.secret}</p>
                <Button onClick={() => setSetupStep(3)}>다음</Button>
              </div>
            )}
            {setupStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">인증 코드 확인</h2>
                <Input placeholder="6자리 코드" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                <Button onClick={finishEnableTotp}>활성화</Button>
              </div>
            )}
            {setupStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">백업 코드 저장</h2>
                <div className="grid grid-cols-2 gap-2">
                  {setup.backup_codes.map((code) => <code key={code} className="rounded border border-white/10 bg-white/[0.06] p-2 text-center font-bold text-slate-100">{code}</code>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText(setup.backup_codes.join("\n"))}>복사</Button>
                  <Button variant="outline" onClick={() => downloadBackupCodes(setup.backup_codes)}>다운로드 TXT</Button>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={backupSaved} onChange={(event) => setBackupSaved(event.target.checked)} /> 백업 코드를 안전한 곳에 저장했습니다</label>
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
  return provider === "kakao" ? "카카오" : "네이버";
}

function providerKey(name: string) {
  return name === "카카오" ? "kakao" : "naver";
}
