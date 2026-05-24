import { authHttp, clearAuthState, setAccessToken, storeAuthProfile } from "@/lib/auth-client";

export type AcademyProfile = {
  id: string;
  email: string;
  email_verified: boolean;
  academy_name: string;
  account_type?: "academy" | "student";
  business_number?: string | null;
  phone?: string | null;
  address?: string | null;
  plan: string;
  plan_expires_at?: string | null;
  trial_ends_at?: string | null;
  requires_payment?: boolean;
  is_active: boolean;
  is_suspended: boolean;
  suspension_reason?: string | null;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
  totp_enabled?: boolean;
  totp_enabled_at?: string | null;
};

export type LoginResult = {
  access_token?: string;
  token_type?: "bearer";
  academy?: AcademyProfile;
  requires_totp?: boolean;
  academy_id?: string;
};

export async function registerAcademy(payload: unknown) {
  const response = await authHttp.post("/api/auth/register", payload);
  return response.data as { message: string; email: string };
}

export async function completeSocialSignup(payload: { signup_token: string; login_id: string; nickname: string; password: string }) {
  const response = await authHttp.post("/api/auth/register/social-complete", payload);
  const data = response.data as LoginResult;
  if (data.access_token) setAccessToken(data.access_token);
  if (data.academy) storeAuthProfile(data.academy);
  return data;
}

export async function requestRegistrationCode(email: string) {
  const response = await authHttp.post("/api/auth/register/code", { email });
  return response.data as { message: string; verification_session: string; expires_in_seconds: number };
}

export async function loginAcademy(payload: unknown) {
  const response = await authHttp.post("/api/auth/login", payload);
  const data = response.data as LoginResult;
  if (data.access_token) setAccessToken(data.access_token);
  if (data.academy) storeAuthProfile(data.academy);
  return data;
}

export async function loginWithBackupCode(payload: { academy_id: string; backup_code: string }) {
  const response = await authHttp.post("/api/auth/2fa/backup-code", payload);
  const data = response.data as LoginResult;
  if (data.access_token) setAccessToken(data.access_token);
  if (data.academy) storeAuthProfile(data.academy);
  return data;
}

export async function verifyEmailToken(token: string) {
  const response = await authHttp.post("/api/auth/verify-email", { token });
  const data = response.data as LoginResult;
  if (data.access_token) setAccessToken(data.access_token);
  if (data.academy) storeAuthProfile(data.academy);
  return data;
}

export async function resendVerification(email: string) {
  const response = await authHttp.post("/api/auth/resend-verification", { email });
  return response.data as { message: string };
}

export async function forgotPassword(email: string) {
  const response = await authHttp.post("/api/auth/forgot-password", { email });
  return response.data as { message: string };
}

export async function validateResetToken(token: string) {
  const response = await authHttp.get("/api/auth/reset-password/validate", { params: { token } });
  return response.data as { valid: boolean };
}

export async function resetPassword(token: string, new_password: string) {
  const response = await authHttp.post("/api/auth/reset-password", { token, new_password });
  return response.data as { message: string };
}

export async function logout() {
  try {
    await authHttp.post("/api/auth/logout");
  } finally {
    clearAuthState();
  }
}

export async function fetchMe() {
  const response = await authHttp.get("/api/auth/me");
  const profile = response.data as AcademyProfile;
  storeAuthProfile(profile);
  return profile;
}

export async function updateMe(payload: Partial<Pick<AcademyProfile, "academy_name" | "account_type" | "phone" | "address" | "business_number">>) {
  const response = await authHttp.patch("/api/auth/me", payload);
  const profile = response.data as AcademyProfile;
  storeAuthProfile(profile);
  return profile;
}

export async function changePassword(payload: { current_password: string; new_password: string }) {
  const response = await authHttp.post("/api/auth/change-password", payload);
  return response.data as { message: string };
}

export async function setupTotp() {
  const response = await authHttp.post("/api/auth/2fa/setup");
  return response.data as { qr_code_url: string; secret: string; backup_codes: string[] };
}

export async function enableTotp(totp_code: string) {
  const response = await authHttp.post("/api/auth/2fa/enable", { totp_code });
  return response.data as { message: string };
}

export async function disableTotp(payload: { password: string; totp_code: string }) {
  const response = await authHttp.post("/api/auth/2fa/disable", payload);
  return response.data as { message: string };
}

export type SessionItem = {
  id: string;
  device_info: string | null;
  browser: string;
  os: string;
  ip_address: string;
  last_active_at: string;
  created_at: string;
  is_current: boolean;
};

export type LoginHistoryItem = {
  id: string;
  ip_address: string;
  device_type: string;
  os: string;
  browser: string;
  country: string | null;
  login_at: string;
  success: boolean;
  failure_reason: string | null;
  provider: string;
};

export async function listSessions() {
  const response = await authHttp.get("/api/auth/sessions");
  return response.data as SessionItem[];
}

export async function revokeSession(id: string) {
  await authHttp.delete(`/api/auth/sessions/${id}`);
}

export async function revokeOtherSessions() {
  await authHttp.delete("/api/auth/sessions");
}

export async function listLoginHistory() {
  const response = await authHttp.get("/api/auth/login-history");
  return response.data as LoginHistoryItem[];
}

export type OAuthAccountItem = {
  id: string;
  provider: "google" | "kakao" | "naver";
  provider_email: string | null;
  created_at: string;
};

export async function listOAuthAccounts() {
  const response = await authHttp.get("/api/auth/oauth-accounts");
  return response.data as OAuthAccountItem[];
}

export async function unlinkOAuthAccount(provider: string) {
  await authHttp.delete(`/api/auth/oauth-accounts/${provider}`);
}

export async function deleteAccount(password: string) {
  const response = await authHttp.delete("/api/auth/me", { data: { password } });
  clearAuthState();
  return response.data as { message: string };
}
