import { api } from "@/lib/api";

export type AcademySeat = {
  id: string;
  academy_id: string;
  seat_number: string;
  display_name: string | null;
  invite_code_preview: string;
  current_student_membership_id: string | null;
  is_active: boolean;
  assigned: boolean;
  assigned_student_user_id: string | null;
  assigned_membership_id: string | null;
  invite_code?: string | null;
};

export type StudentMembership = {
  id: string;
  student_user_id: string;
  academy_id: string;
  academy_seat_id: string;
  status: "active" | "ended" | "suspended";
  academy_name?: string;
  joined_at: string;
};

export type StudentQuota = {
  total: { upload: number; extraction: number; export: number };
  used: { upload: number; extraction: number; export: number };
  remaining: { upload: number; extraction: number; export: number };
  contributions: Array<{ source: string; academy_name?: string; upload: number; extraction: number; export: number }>;
};

export type AcademyBilling = {
  subscription: {
    academy_id: string;
    plan_code: string;
    status: string;
    purchased_additional_seats: number;
    overage_policy: "AUTO_BILL_OVERAGE" | "BLOCK_AT_LIMIT";
  };
  plan: {
    code: string;
    name: string;
    included_seats: number;
    monthly_price: number;
    additional_seat_price: number;
  } | null;
  included_seats: number;
  purchased_additional_seats: number;
  active_seats: number;
  assigned_seats: number;
  unassigned_seats: number;
  estimated_monthly_bill: number;
};

export type AcademyClass = {
  id: string;
  academy_id: string;
  name: string;
  description: string | null;
  subject: string | null;
  grade_level: string | null;
  is_active: boolean;
  created_at: string;
};

export type Assignment = {
  id: string;
  academy_id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  submission_mode: string;
  open_at: string | null;
  due_at: string | null;
  close_at: string | null;
  result_release_policy: string;
  time_limit_minutes: number | null;
};

export type WrongAnswerItem = {
  id: string;
  student_user_id: string;
  academy_id: string | null;
  source_type: string;
  extracted_problem_text: string | null;
  subject: string | null;
  unit: string | null;
  difficulty: string | null;
  tags: string[];
  visibility: string;
  memo: string | null;
  created_at: string;
};

export function getAcademyBilling(academyId: string) {
  return api<AcademyBilling>(`/api/academy/${academyId}/billing`);
}

export function updateAcademyBilling(academyId: string, payload: Partial<{ plan_code: string; purchased_additional_seats: number; overage_policy: string }>) {
  return api<{ ok: boolean }>(`/api/academy/${academyId}/billing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listAcademySeats(academyId: string) {
  return api<AcademySeat[]>(`/api/academy/${academyId}/seats`);
}

export function createAcademySeats(academyId: string, count = 1) {
  return api<AcademySeat[]>(`/api/academy/${academyId}/seats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count }),
  });
}

export function rotateAcademySeatCode(academyId: string, seatId: string) {
  return api<AcademySeat>(`/api/academy/${academyId}/seats/${seatId}/rotate-code`, { method: "POST" });
}

export function releaseAcademySeat(academyId: string, seatId: string, reason?: string) {
  return api<AcademySeat>(`/api/academy/${academyId}/seats/${seatId}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, rotate_code: true }),
  });
}

export function claimAcademyKey(inviteCode: string) {
  return api<StudentMembership>("/api/student/academy-keys/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export function listStudentAcademies() {
  return api<StudentMembership[]>("/api/student/academies");
}

export function getStudentQuotas() {
  return api<StudentQuota>("/api/student/quotas");
}

export function listAcademyClasses(academyId: string) {
  return api<AcademyClass[]>(`/api/academy/${academyId}/classes`);
}

export function createAcademyClass(academyId: string, payload: { name: string; subject?: string; grade_level?: string; description?: string }) {
  return api<AcademyClass>(`/api/academy/${academyId}/classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listAcademyAssignments(academyId: string) {
  return api<Assignment[]>(`/api/academy/${academyId}/assignments`);
}

export function createAcademyAssignment(
  academyId: string,
  payload: {
    title: string;
    description?: string;
    assignment_type?: string;
    submission_mode?: string;
    targets: Array<{ target_type: string; target_id: string }>;
    contents?: Array<Record<string, unknown>>;
    due_at?: string | null;
    time_limit_minutes?: number | null;
  }
) {
  return api<Assignment>(`/api/academy/${academyId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listStudentAssignments(academyId?: string) {
  return api<Assignment[]>(`/api/student/assignments${academyId ? `?academy_id=${academyId}` : ""}`);
}

export function submitAssignment(assignmentId: string, answers: Array<Record<string, unknown>>) {
  return api(`/api/student/assignments/${assignmentId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}

export function startTest(assignmentId: string) {
  return api(`/api/student/tests/${assignmentId}/start`, { method: "POST" });
}

export function listWrongAnswers(academyId?: string) {
  return api<WrongAnswerItem[]>(`/api/student/wrong-answers${academyId ? `?academy_id=${academyId}` : ""}`);
}

export function createWrongAnswer(payload: Partial<WrongAnswerItem>) {
  return api<WrongAnswerItem>("/api/student/wrong-answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function exportWrongAnswers(itemIds: string[], academyId?: string | null) {
  return api<{ export_id: string; watermark_applied: boolean; message: string }>("/api/student/wrong-answers/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: itemIds, academy_id: academyId }),
  });
}

