import { api } from "@/lib/api";

export type AcademySeat = {
  id: string;
  academy_id: string;
  class_id: string | null;
  class_name?: string | null;
  seat_number: string;
  display_name: string | null;
  invite_code_preview: string;
  current_student_membership_id: string | null;
  is_active: boolean;
  assigned: boolean;
  key_status: "unclaimed" | "claimed" | "revoked" | "legacy_unassigned" | string;
  assigned_student_user_id: string | null;
  assigned_membership_id: string | null;
  invite_code?: string | null;
  key_code?: string | null;
  invite_url?: string | null;
  invite_metadata?: StudentKeyInviteMetadata | null;
  message_body?: string | null;
  sms_url?: string | null;
  notification_id?: string | null;
  delivery_status?: string | null;
};

export type StudentKeyInviteMetadata = {
  source?: string | null;
  channel?: "manual" | "sms" | "student_app" | string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_account_user_id?: string | null;
  recipient_memo?: string | null;
  message_body?: string | null;
  sms_url?: string | null;
  notification_id?: string | null;
  delivery_status?: string | null;
  invite_url?: string | null;
  prepared_at?: string | null;
  claimed_at?: string | null;
};

export type StudentKeyRecipient = {
  name?: string | null;
  phone?: string | null;
  account_user_id?: string | null;
  memo?: string | null;
};

export type StudentMembership = {
  id: string;
  student_user_id: string;
  academy_id: string;
  academy_seat_id: string;
  class_id?: string | null;
  class_name?: string | null;
  status: "active" | "ended" | "suspended";
  academy_name?: string;
  joined_at: string;
};

export type StudentInvitePreview = {
  invite_id: string;
  academy_id: string;
  academy_name: string;
  academy_student_id?: string | null;
  student_name?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  status: "pending" | "claimed" | "revoked" | "invalid" | string;
  key_status: string;
  invite_code_preview?: string | null;
  linked_user_id?: string | null;
  claimed_at?: string | null;
  expires_at?: string | null;
};

export type StudentProfileRequirementField = {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
  real_name: boolean;
};

export type AcademyKeyRequirements = {
  academy_id: string;
  academy_name: string;
  class_id?: string | null;
  class_name?: string | null;
  fields: StudentProfileRequirementField[];
};

export type StudentAcademyInvite = {
  id: string;
  academy_id: string;
  academy_name: string;
  academy_seat_id: string;
  academy_student_id: string;
  student_name?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  target_profile_name: string;
  status: "pending" | "accepted" | "declined" | "revoked" | string;
  created_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  revoked_at?: string | null;
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
  unlimited_seats?: boolean;
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

export function createAcademySeats(
  academyId: string,
  count = 1,
  classId?: string,
  options: { delivery_channel?: "manual" | "sms" | "student_app"; recipients?: StudentKeyRecipient[]; message_template?: string | null } = {}
) {
  return api<AcademySeat[]>(`/api/academy/${academyId}/seats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count, class_id: classId || null, ...options }),
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

export function getAcademyKeyRequirements(inviteCode: string) {
  return api<AcademyKeyRequirements>(`/api/student/academy-keys/requirements?invite_code=${encodeURIComponent(inviteCode.trim())}`);
}

export function claimAcademyKey(inviteCode: string, studentProfile: Record<string, string> = {}) {
  return api<StudentMembership>("/api/student/academy-keys/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode, student_profile: studentProfile }),
  });
}

export function getStudentInvite(token: string) {
  return api<StudentInvitePreview>(`/api/student/invites/${encodeURIComponent(token)}`);
}

export function claimStudentInvite(token: string) {
  return api<StudentMembership>(`/api/student/invites/${encodeURIComponent(token)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_profile: {} }),
  });
}

export function createStudentInviteByProfileName(
  academyId: string,
  payload: { class_id: string; profile_name: string; display_name?: string | null; memo?: string | null }
) {
  return api<StudentAcademyInvite>(`/api/academy/${academyId}/student-invites/by-profile-name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listStudentAcademyInvites() {
  return api<StudentAcademyInvite[]>("/api/student/academy-invites");
}

export function acceptStudentAcademyInvite(inviteId: string) {
  return api<StudentMembership>(`/api/student/academy-invites/${inviteId}/accept`, { method: "POST" });
}

export function declineStudentAcademyInvite(inviteId: string) {
  return api<StudentAcademyInvite>(`/api/student/academy-invites/${inviteId}/decline`, { method: "POST" });
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

export type LearningProblem = {
  id: string;
  problem_number: number;
  review_page_number?: number | null;
  problem_text: string;
  has_visual: boolean;
  visual_url: string | null;
  visual_schema?: Record<string, unknown> | null;
  math_model?: Record<string, unknown> | null;
  review_page_image_url?: string | null;
  answer?: string | null;
  solution_steps?: string | null;
  key_concept?: string | null;
  tags?: {
    subject?: string | null;
    unit?: string | null;
    difficulty?: string | null;
    problem_type?: string | null;
    source?: string | null;
  };
};

export type LearningSubmission = {
  id: string;
  academy_id: string;
  student_id: string;
  assignment_id: string | null;
  source_context: string;
  source_id: string | null;
  started_at: string;
  submitted_at: string | null;
  status: "not_started" | "in_progress" | "submitted" | "late" | "abandoned" | string;
  score: number | null;
  correct_count: number;
  wrong_count: number;
  total_count: number;
  time_spent_seconds: number | null;
};

export type LearningAssignment = {
  id: string;
  academy_id: string;
  academy_name?: string;
  title: string;
  description: string | null;
  source_type: string;
  source_id: string;
  content_version_id: string;
  assigned_by: string;
  assigned_to_type: string;
  start_at: string | null;
  due_at: string | null;
  schedule_type: string;
  grading_mode: string;
  show_score_policy: string;
  show_answer_policy: string;
  show_solution_policy: string;
  retry_policy: string;
  time_limit_seconds: number | null;
  shuffle_problems: boolean;
  shuffle_choices: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  content: {
    id: string;
    title: string;
    source_type: string;
    source_id: string;
    snapshot: {
      title: string;
      source_type: string;
      source_id: string;
      problem_count: number;
      problems: LearningProblem[];
      material_title?: string | null;
      material_scope?: string | null;
    };
  };
  submission: LearningSubmission | null;
};

export type LearningStats = {
  submission_count: number;
  completion_rate: number;
  solved_problem_count: number;
  correct_rate: number;
  unresolved_wrong_count: number;
  mastered_wrong_count: number;
  weak_units: Array<{ unit: string; total: number; wrong: number; wrong_rate: number }>;
};

export type LearningToday = {
  academies: StudentMembership[];
  assignments: LearningAssignment[];
  stats: LearningStats;
};

export type LearningArchiveGrant = {
  id: string;
  academy_id: string;
  academy_name?: string;
  student_id: string | null;
  group_id: string | null;
  source_type: string;
  source_id: string;
  access_scope: string;
  can_view_problems: boolean;
  can_solve_freely: boolean;
  can_save_to_my_archive: boolean;
  can_create_custom_sets: boolean;
  can_see_answer_immediately: boolean;
  can_see_solution: boolean;
  can_retry: boolean;
  timed_only: boolean;
  starts_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  title: string;
  problem_count: number;
  locked_reason: string | null;
};

export type LearningArchiveDetail = {
  grant: LearningArchiveGrant;
  academy_name: string;
  title: string;
  problems: LearningProblem[];
};

export type LearningWrongAnswer = {
  id: string;
  academy_id: string;
  academy_name?: string;
  student_id: string;
  problem_id: string;
  problem_version_id: string;
  first_wrong_at: string;
  latest_wrong_at: string;
  wrong_count: number;
  retry_count: number;
  resolved_status: "unresolved" | "reviewing" | "resolved" | "mastered" | string;
  source_assignment_ids: string[];
  student_memo: string | null;
  teacher_memo: string | null;
  problem: LearningProblem | null;
};

export type StudentPersonalSet = {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  visibility: "private";
  created_at: string;
  updated_at: string;
  item_count: number;
  items: Array<{
    id: string;
    academy_id: string;
    academy_name?: string;
    problem_id: string;
    locked_reason: string | null;
    problem: LearningProblem | null;
  }>;
};

export type AcademyLearningStudent = {
  id: string;
  student_user_id: string;
  academy_id: string;
  student_name: string;
  display_name_in_academy: string | null;
  status: string;
  key_status: string;
  groups: AcademyClass[];
  recent_assignment_completion: number;
  recent_correct_rate: number | null;
  unresolved_wrong_answer_count: number;
};

export type LearningAssignmentReport = {
  assignment: LearningAssignment;
  students: Array<{ student_id: string; student_name: string; status: string; submission: LearningSubmission | null }>;
  summary: {
    target_count: number;
    submitted_count: number;
    pending_confirmation_count?: number;
    missing_count: number;
    completion_rate: number;
    average_score: number | null;
  };
};

export function activateLearningAcademyKey(keyCode: string) {
  return api<StudentMembership>("/api/learning/student/academy-keys/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key_code: keyCode }),
  });
}

export function listLearningAcademies() {
  return api<StudentMembership[]>("/api/learning/student/academies");
}

export function getLearningToday(academyId?: string) {
  return api<LearningToday>(`/api/learning/student/today${academyId ? `?academy_id=${academyId}` : ""}`);
}

export function listLearningAssignments(academyId?: string) {
  return api<LearningAssignment[]>(`/api/learning/student/assignments${academyId ? `?academy_id=${academyId}` : ""}`);
}

export function readLearningAssignment(assignmentId: string) {
  return api<LearningAssignment>(`/api/learning/student/assignments/${assignmentId}`);
}

export function startLearningAssignment(assignmentId: string) {
  return api<LearningSubmission>(`/api/learning/student/assignments/${assignmentId}/start`, { method: "POST" });
}

export function submitLearningAssignment(assignmentId: string, answers: Array<{ problem_id: string; answer: string; time_spent_seconds?: number }>) {
  return api<LearningSubmission>(`/api/learning/student/assignments/${assignmentId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}

export function listLearningArchives(academyId?: string) {
  return api<LearningArchiveGrant[]>(`/api/learning/student/archives${academyId ? `?academy_id=${academyId}` : ""}`);
}

export function readLearningArchive(grantId: string) {
  return api<LearningArchiveDetail>(`/api/learning/student/archives/${grantId}/problems`);
}

export function solveLearningProblem(problemId: string, payload: { answer: string; source_access_grant_id?: string | null; time_spent_seconds?: number }) {
  return api(`/api/learning/student/problems/${problemId}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listLearningWrongAnswers(params: { academyId?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  if (params.academyId) query.set("academy_id", params.academyId);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return api<LearningWrongAnswer[]>(`/api/learning/student/wrong-answers${qs ? `?${qs}` : ""}`);
}

export function retryLearningWrongAnswer(recordId: string, payload: { answer: string; source_access_grant_id?: string | null }) {
  return api(`/api/learning/student/wrong-answers/${recordId}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getLearningStats(academyId?: string) {
  return api<LearningStats>(`/api/learning/student/stats${academyId ? `?academy_id=${academyId}` : ""}`);
}

export function listStudentPersonalSets() {
  return api<StudentPersonalSet[]>("/api/learning/student/personal-sets");
}

export function createStudentPersonalSet(payload: { title: string; description?: string }) {
  return api<StudentPersonalSet>("/api/learning/student/personal-sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function addStudentPersonalSetItem(setId: string, payload: { problem_id: string; source_access_grant_id?: string | null }) {
  return api<StudentPersonalSet>(`/api/learning/student/personal-sets/${setId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function removeStudentPersonalSetItem(setId: string, itemId: string) {
  return api<{ ok: boolean }>(`/api/learning/student/personal-sets/${setId}/items/${itemId}`, { method: "DELETE" });
}

export function listAcademyLearningStudents(academyId: string) {
  return api<AcademyLearningStudent[]>(`/api/learning/academy/${academyId}/students`);
}

export function issueLearningStudentKeys(
  academyId: string,
  payload: {
    count: number;
    display_name_prefix?: string;
    class_id?: string | null;
    delivery_channel?: "manual" | "sms" | "student_app";
    message_template?: string | null;
    recipients?: StudentKeyRecipient[];
  }
) {
  return api<{ created_by: string; keys: Array<AcademySeat & { key_code: string; status: string }> }>(`/api/learning/academy/${academyId}/student-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listAcademyLearningAssignments(academyId: string) {
  return api<LearningAssignment[]>(`/api/learning/academy/${academyId}/assignments`);
}

export function createLearningAssignment(
  academyId: string,
  payload: {
    title: string;
    description?: string;
    source_type: string;
    source_id: string;
    manual_material_title?: string | null;
    manual_material_scope?: string | null;
    student_ids?: string[];
    group_ids?: string[];
    due_at?: string | null;
    status?: string;
  }
) {
  return api<LearningAssignment>(`/api/learning/academy/${academyId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateLearningAssignment(academyId: string, assignmentId: string, payload: Partial<{
  title: string;
  description: string | null;
  start_at: string | null;
  due_at: string | null;
  schedule_type: string;
  recurrence_rule: string | null;
  grading_mode: string;
  show_score_policy: string;
  show_answer_policy: string;
  show_solution_policy: string;
  retry_policy: string;
  time_limit_seconds: number | null;
  shuffle_problems: boolean;
  shuffle_choices: boolean;
  status: string;
}>) {
  return api<LearningAssignment>(`/api/learning/academy/${academyId}/assignments/${assignmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function publishLearningAssignment(academyId: string, assignmentId: string) {
  return api<LearningAssignment>(`/api/learning/academy/${academyId}/assignments/${assignmentId}/publish`, { method: "POST" });
}

export function archiveLearningAssignment(academyId: string, assignmentId: string) {
  return api<{ ok: boolean }>(`/api/learning/academy/${academyId}/assignments/${assignmentId}`, { method: "DELETE" });
}

export function readLearningAssignmentReport(academyId: string, assignmentId: string) {
  return api<LearningAssignmentReport>(`/api/learning/academy/${academyId}/assignments/${assignmentId}/report`);
}

export function confirmLearningAssignmentCompletion(academyId: string, assignmentId: string, studentId: string) {
  return api<LearningSubmission>(`/api/learning/academy/${academyId}/assignments/${assignmentId}/students/${studentId}/confirm`, { method: "POST" });
}

export function createLearningAccessGrant(
  academyId: string,
  payload: {
    student_id?: string | null;
    group_id?: string | null;
    source_type: string;
    source_id: string;
    can_solve_freely?: boolean;
    can_save_to_my_archive?: boolean;
    can_see_answer_immediately?: boolean;
    can_see_solution?: boolean;
    expires_at?: string | null;
  }
) {
  return api<LearningArchiveGrant>(`/api/learning/academy/${academyId}/access-grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listLearningAccessGrants(academyId: string) {
  return api<LearningArchiveGrant[]>(`/api/learning/academy/${academyId}/access-grants`);
}

export function revokeLearningAccessGrant(academyId: string, grantId: string) {
  return api<LearningArchiveGrant>(`/api/learning/academy/${academyId}/access-grants/${grantId}`, { method: "DELETE" });
}

export function listAcademyLearningWrongAnswers(academyId: string) {
  return api<LearningWrongAnswer[]>(`/api/learning/academy/${academyId}/wrong-answers`);
}
