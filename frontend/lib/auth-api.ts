import { authHttp, clearAuthState, setAccessToken, storeAuthProfile } from "@/lib/auth-client";

const PROFILE_REQUEST_TIMEOUT_MS = 5000;
const LOGIN_REQUEST_TIMEOUT_MS = 8000;

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
  roles?: string[];
  is_active: boolean;
  is_suspended: boolean;
  suspension_reason?: string | null;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
  totp_enabled?: boolean;
  totp_enabled_at?: string | null;
};

export type WorkspacePermissions = {
  can_manage_billing?: boolean;
  can_manage_seats?: boolean;
  can_manage_materials?: boolean;
  can_manage_assignments?: boolean;
  can_manage_students?: boolean;
  can_manage_schedule?: boolean;
  can_manage_coagent?: boolean;
};

export type WorkspaceSummary = {
  id: string;
  type: "academy" | "student";
  name: string;
  role: "owner" | "admin" | "teacher" | "assistant" | "student" | string;
  permissions: WorkspacePermissions;
  account?: {
    id: string;
    name: string;
    email: string;
    account_type?: "academy" | "student";
    plan?: string;
  };
  seat_status?: StaffSeatStatus;
};

export type StaffSeatStatus = {
  purchased_staff_seats: number;
  active_staff: number;
  pending_invites: number;
  available_staff_seats: number;
  staff_seat_monthly_addon_krw: number;
};

export type WorkspaceClassSummary = {
  id: string;
  academy_id: string;
  name: string;
  subject?: string | null;
  grade_level?: string | null;
  is_active?: boolean;
};

export type StaffMember = {
  id: string;
  academy_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  permissions: WorkspacePermissions;
  assigned_class_ids?: string[];
  assigned_classes?: WorkspaceClassSummary[];
  user?: WorkspaceSummary["account"] | null;
  created_at: string;
  updated_at: string;
};

export type StaffInviteCode = {
  id: string;
  academy_id: string;
  code_preview: string;
  code?: string;
  role: string;
  permissions: WorkspacePermissions;
  assigned_class_ids?: string[];
  assigned_classes?: WorkspaceClassSummary[];
  created_by: string;
  claimed_by?: string | null;
  expires_at: string;
  claimed_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  seat_status?: StaffSeatStatus;
};

export type StaffPermissionPayload = {
  role?: string;
  can_manage_seats?: boolean;
  can_manage_materials?: boolean;
  can_manage_assignments?: boolean;
  can_manage_students?: boolean;
  can_manage_schedule?: boolean;
  can_manage_coagent?: boolean;
  assigned_class_ids?: string[];
  is_active?: boolean;
};

export type LiveInteractionSettings = {
  academy_id: string;
  live_start_lead_minutes: number;
  updated_at?: string | null;
};

export type LiveInteractionEvent = {
  id: string;
  academy_id: string;
  class_id: string;
  class_name: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  minutes_until_start: number;
  status: "ready" | "opening" | string;
  live_href: string;
};

export type LiveLectureSlidePdf = {
  url: string;
  name: string;
  size: number;
  content_type?: string | null;
};

export type LiveLectureSession = {
  event: LiveInteractionEvent;
  source: "event" | "class_default" | "empty" | string;
  event_initialized: boolean;
  class_default_initialized: boolean;
  created_class_default?: boolean;
  lecture: {
    notes: string;
    slide_pdf?: LiveLectureSlidePdf | null;
    page_number: number;
    updated_at?: string | null;
  };
};

export type LiveLectureSessionSavePayload = Partial<{
  notes: string | null;
  page_number: number | null;
  slide_pdf: LiveLectureSlidePdf | null;
}>;

export type LoginResult = {
  access_token?: string;
  token_type?: "bearer";
  academy?: AcademyProfile;
  requires_totp?: boolean;
  academy_id?: string;
};

let fetchMePromise: Promise<AcademyProfile> | null = null;
let fetchMeCache: { profile: AcademyProfile; expiresAt: number } | null = null;

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

export async function checkLoginIdAvailability(loginId: string) {
  const response = await authHttp.get("/api/auth/login-id/availability", { params: { login_id: loginId } });
  return response.data as { login_id: string; valid: boolean; available: boolean };
}

export async function requestRegistrationCode(email: string) {
  const response = await authHttp.post("/api/auth/register/code", { email });
  return response.data as { message: string; verification_session: string; expires_in_seconds: number };
}

export async function loginAcademy(payload: unknown) {
  const response = await authHttp.post("/api/auth/login", payload, { timeout: LOGIN_REQUEST_TIMEOUT_MS });
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
  const now = Date.now();
  if (fetchMeCache && fetchMeCache.expiresAt > now) return fetchMeCache.profile;
  if (fetchMePromise) return fetchMePromise;
  fetchMePromise = authHttp
    .get("/api/auth/me", { timeout: PROFILE_REQUEST_TIMEOUT_MS })
    .then((response) => {
      const profile = response.data as AcademyProfile;
      fetchMeCache = { profile, expiresAt: Date.now() + 15000 };
      storeAuthProfile(profile);
      return profile;
    })
    .finally(() => {
      fetchMePromise = null;
    });
  return fetchMePromise;
}

export async function listWorkspaces() {
  const response = await authHttp.get("/api/workspaces");
  return response.data as { active_workspace_id?: string | null; items: WorkspaceSummary[] };
}

export async function claimStaffInviteCode(code: string) {
  const response = await authHttp.post("/api/workspaces/staff-invite-codes/claim", { code });
  return response.data as { ok: boolean; workspace: WorkspaceSummary };
}

export async function listWorkspaceStaff(academyId: string) {
  const response = await authHttp.get(`/api/workspaces/${academyId}/staff`);
  return response.data as { seat_status: StaffSeatStatus; staff: StaffMember[] };
}

export async function updateWorkspaceStaff(academyId: string, userId: string, payload: StaffPermissionPayload) {
  const response = await authHttp.patch(`/api/workspaces/${academyId}/staff/${userId}`, payload);
  return response.data as StaffMember;
}

export async function removeWorkspaceStaff(academyId: string, userId: string) {
  await authHttp.delete(`/api/workspaces/${academyId}/staff/${userId}`);
}

export async function listWorkspaceStaffInviteCodes(academyId: string) {
  const response = await authHttp.get(`/api/workspaces/${academyId}/staff/invite-codes`);
  return response.data as { seat_status: StaffSeatStatus; invite_codes: StaffInviteCode[] };
}

export async function createWorkspaceStaffInviteCode(academyId: string, payload: StaffPermissionPayload & { expires_in_days?: number }) {
  const response = await authHttp.post(`/api/workspaces/${academyId}/staff/invite-codes`, payload);
  return response.data as StaffInviteCode;
}

export async function revokeWorkspaceStaffInviteCode(academyId: string, codeId: string) {
  await authHttp.delete(`/api/workspaces/${academyId}/staff/invite-codes/${codeId}`);
}

export async function getLiveInteractionSettings() {
  const response = await authHttp.get("/api/live-interactions/settings");
  return response.data as LiveInteractionSettings;
}

export async function updateLiveInteractionSettings(payload: Pick<LiveInteractionSettings, "live_start_lead_minutes">) {
  const response = await authHttp.patch("/api/live-interactions/settings", payload);
  return response.data as LiveInteractionSettings;
}

export async function listUpcomingLiveInteractions() {
  const response = await authHttp.get("/api/live-interactions/upcoming");
  return response.data as { settings: LiveInteractionSettings; events: LiveInteractionEvent[] };
}

export async function getLiveLectureSession(eventId: string) {
  const response = await authHttp.get(`/api/live-interactions/events/${eventId}/session`);
  return response.data as LiveLectureSession;
}

export async function saveLiveLectureSession(eventId: string, payload: LiveLectureSessionSavePayload) {
  const response = await authHttp.patch(`/api/live-interactions/events/${eventId}/session`, payload);
  return response.data as LiveLectureSession;
}

export async function uploadLiveLectureSlide(eventId: string, file: File, onProgress?: (progress: number) => void) {
  const form = new FormData();
  form.append("file", file);
  const response = await authHttp.post(`/api/live-interactions/events/${eventId}/slide`, form, {
    onUploadProgress: (event) => {
      if (!event.total) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    },
  });
  onProgress?.(100);
  return response.data as LiveLectureSession;
}

export async function updateMe(payload: Partial<Pick<AcademyProfile, "academy_name" | "account_type" | "phone" | "address" | "business_number">>) {
  const response = await authHttp.patch("/api/auth/me", payload);
  const profile = response.data as AcademyProfile;
  fetchMeCache = { profile, expiresAt: Date.now() + 15000 };
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
  provider: "google" | "kakao";
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
