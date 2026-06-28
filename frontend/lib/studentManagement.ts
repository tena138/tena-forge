import { api } from "@/lib/api";
import { authHttp } from "@/lib/auth-client";

export type StudentCard = {
  id: string;
  student_user_id: string;
  student_person_id?: string | null;
  academy_seat_id?: string | null;
  pending_seat_id?: string | null;
  card_type?: "student" | "pending_key" | string;
  key_status?: string | null;
  invite_metadata?: Record<string, unknown> | null;
  recipient_phone?: string | null;
  delivery_status?: string | null;
  invite_code_preview?: string | null;
  invite_codes?: StudentInviteCode[];
  name: string;
  grade_level?: string | null;
  school?: string | null;
  status: string;
  status_chip: string;
  memo?: string | null;
  class_ids: string[];
  class_names: string[];
  class_subjects?: Array<string | null>;
  recent_score?: number | null;
  recent_completion_status?: string | null;
  unresolved_wrong_count: number;
  recent_weakness_label?: string | null;
  invite_code?: string;
  joined_at?: string | null;
  tuition?: TuitionSettings;
};

export type StudentInviteCode = {
  membership_id?: string | null;
  seat_id: string;
  class_id?: string | null;
  class_name?: string | null;
  invite_code?: string | null;
  invite_code_preview?: string | null;
};

export type StudentProfileFieldSetting = {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
  real_name: boolean;
};

export type StudentProfileCollectionSettings = {
  fields: StudentProfileFieldSetting[];
};

export type TuitionSettings = {
  enabled: boolean;
  cycle_sessions?: number | null;
  amount?: number | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
};

export type ClassCard = {
  id: string;
  name: string;
  description?: string | null;
  subject?: string | null;
  grade_level?: string | null;
  is_active: boolean;
  student_count: number;
  pending_key_count?: number;
  upcoming_count: number;
  recent_session?: PaperSessionSummary | null;
  average_recent_score?: number | null;
  unresolved_wrong_count: number;
  students: StudentCard[];
  student_membership_ids?: string[];
  paper_sessions?: PaperSessionSummary[];
  schedule_events?: ScheduleEvent[];
};

export type PaperSessionSummary = {
  id: string;
  title: string;
  description?: string | null;
  source_problem_set_id?: string | null;
  content_version_id: string;
  session_type: string;
  target_type: string;
  class_ids: string[];
  student_membership_ids: string[];
  scheduled_at?: string | null;
  due_at?: string | null;
  status: string;
  problem_count: number;
  assigned_count: number;
  graded_count: number;
  respondent_count?: number;
  average_score?: number | null;
  highest_score?: number | null;
  lowest_score?: number | null;
  q1_score?: number | null;
  q2_score?: number | null;
  q3_score?: number | null;
  score_standard_deviation?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SessionProblem = {
  problem_id: string;
  problem_number: number;
  original_problem_number?: number;
  review_page_number?: number | null;
  problem_text?: string;
  answer?: string | null;
  solution_steps?: string | null;
  source_label?: string | null;
  subject?: string | null;
  unit?: string | null;
  difficulty?: string | null;
};

export type PaperSessionStudent = StudentCard & {
  result: {
    id: string;
    paper_session_id: string;
    student_membership_id: string;
    status: string;
    score?: number | null;
    correct_count: number;
    wrong_count: number;
    total_count: number;
    graded_at?: string | null;
  };
  problem_results: Array<{
    id: string;
    problem_id: string;
    problem_number: number;
    result_status: "correct" | "wrong" | "unanswered" | "unmarked";
  }>;
};

export type PaperSessionDetail = PaperSessionSummary & {
  problems: SessionProblem[];
  students: PaperSessionStudent[];
};

export type WrongAnswer = {
  id: string;
  student_id: string;
  student_membership_id?: string | null;
  student_name: string;
  problem_id: string;
  problem_number: number;
  problem_text: string;
  source_assignment_ids: string[];
  subject?: string | null;
  unit?: string | null;
  first_wrong_at?: string | null;
  latest_wrong_at?: string | null;
  wrong_count: number;
  retry_count: number;
  resolved_status: string;
  teacher_memo?: string | null;
};

export type ScheduleEvent = {
  id: string;
  class_id: string;
  title: string;
  description?: string | null;
  event_type: string;
  starts_at: string;
  ends_at?: string | null;
  linked_paper_session_id?: string | null;
  counts_for_tuition?: boolean;
  series_id?: string | null;
  series_position?: number | null;
  series_size?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TuitionPayment = {
  id: string;
  academy_id: string;
  student_membership_id: string;
  student_user_id: string;
  student_name: string;
  class_id?: string | null;
  class_name?: string | null;
  due_event_id?: string | null;
  event_title?: string | null;
  due_at: string;
  cycle_number: number;
  cycle_start_session: number;
  cycle_end_session: number;
  cycle_sessions: number;
  amount?: number | null;
  status: "pending" | "reminded" | "paid" | "excluded" | string;
  paid_at?: string | null;
  reminder_count: number;
  reminder_sent_at?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  message_body: string;
  counts_for_tuition?: boolean;
};

export type TuitionDashboard = {
  summary: {
    pending_count: number;
    overdue_count: number;
    reminded_count: number;
  };
  payments: TuitionPayment[];
};

export type CounselingFormatField = {
  id: string;
  label: string;
  placeholder?: string | null;
  include_in_report?: boolean;
};

export type CounselingFormat = {
  class_id: string;
  fields: CounselingFormatField[];
  updated_at?: string | null;
};

export type CounselingPreset = {
  slot: number;
  name: string;
  subject?: string | null;
  fields: CounselingFormatField[];
  updated_at?: string | null;
};

export type CounselingLogSection = {
  field_id: string;
  label: string;
  value?: string | null;
  include_in_report?: boolean;
};

export type CounselingLogPayload = {
  counseling_date?: string | null;
  title: string;
  class_id?: string | null;
  notes?: string | null;
  weekly_report?: string | null;
  next_plan?: string | null;
  sections?: CounselingLogSection[];
};

export type CounselingCleanPreview = {
  sections: Array<{
    field_id: string;
    label: string;
    value: string;
    include_in_report?: boolean;
  }>;
};

export type CounselingTranscriptionResponse = {
  text: string;
  model: string;
};

export type CounselingIntakeProfile = {
  name: string;
  school: string;
  grade_level: string;
  guardian_name: string;
  guardian_phone: string;
  memo: string;
  recommended_class: string;
  pending_reason: string;
};

export type CounselingIntakePreview = {
  title: string;
  summary: string;
  student_profile: CounselingIntakeProfile;
  sections: Array<{
    field_id: string;
    label: string;
    value: string;
    include_in_report?: boolean;
  }>;
};

export type StudentExamStatsPoint = {
  id: string;
  title: string;
  date: string;
  student_score?: number | null;
  average?: number | null;
  highest?: number | null;
  lowest?: number | null;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  stddev?: number | null;
  respondents?: number | null;
};

export type CounselingLog = {
  id: string;
  student_membership_id: string;
  class_id?: string | null;
  class_name?: string | null;
  title: string;
  counseling_date: string;
  notes?: string | null;
  weekly_report?: string | null;
  next_plan?: string | null;
  sections?: CounselingLogSection[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type RoutineMessage = {
  id: string;
  action_id: string;
  student_membership_id?: string | null;
  student_user_id: string;
  student_name: string;
  class_id?: string | null;
  class_name?: string | null;
  message_body: string;
  status: string;
  channel: string;
  delivery_status: string;
  notification_id?: string | null;
  sent_at?: string | null;
  metadata?: Record<string, unknown>;
  updated_at?: string | null;
};

export type RoutineAction = {
  id: string;
  academy_id: string;
  routine_type: string;
  source_type: string;
  source_id: string;
  class_id?: string | null;
  status: string;
  title: string;
  summary?: string | null;
  channel: string;
  message_count: number;
  sendable_count: number;
  sent_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  sent_at?: string | null;
  ai_payload?: Record<string, unknown>;
  messages: RoutineMessage[];
};

export type StudentManagementDashboard = {
  summary: {
    class_count: number;
    student_count: number;
    active_session_count: number;
    unresolved_wrong_count: number;
  };
  classes: ClassCard[];
  recent_sessions: PaperSessionSummary[];
};

export function getStudentManagementDashboard() {
  return api<StudentManagementDashboard>("/api/student-management/dashboard");
}

export function createClass(payload: {
  name: string;
  description?: string;
  subject?: string;
  grade_level?: string;
}) {
  const normalized = {
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    subject: payload.subject?.trim() || null,
    grade_level: payload.grade_level?.trim() || null,
  };
  return api<ClassCard>("/api/student-management/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
}

export function updateClassOrder(classIds: string[]) {
  return api<ClassCard[]>("/api/student-management/classes/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_ids: classIds }),
  });
}

export function updateClass(
  id: string,
  payload: {
    name?: string;
    description?: string | null;
    subject?: string | null;
    grade_level?: string | null;
    is_active?: boolean;
  }
) {
  return api<ClassCard>(`/api/student-management/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteClass(id: string) {
  return api<void>(`/api/student-management/classes/${id}`, {
    method: "DELETE",
  });
}

export function createStudent(payload: {
  name: string;
  grade_level?: string;
  school?: string;
  memo?: string;
  status?: string;
  class_ids?: string[];
  guardian_name?: string;
  guardian_phone?: string;
  tuition_enabled?: boolean;
  tuition_cycle_sessions?: number | string | null;
  tuition_amount?: number | string | null;
}) {
  const cycleSessions = Number(payload.tuition_cycle_sessions);
  const tuitionAmount = Number(payload.tuition_amount);
  const normalized = {
    name: payload.name.trim(),
    grade_level: payload.grade_level?.trim() || null,
    school: payload.school?.trim() || null,
    memo: payload.memo?.trim() || null,
    status: payload.status || "active",
    class_ids: payload.class_ids || [],
    guardian_name: payload.guardian_name?.trim() || null,
    guardian_phone: payload.guardian_phone?.trim() || null,
    tuition_enabled: Boolean(payload.tuition_enabled),
    tuition_cycle_sessions: Number.isFinite(cycleSessions) && cycleSessions > 0 ? cycleSessions : null,
    tuition_amount: Number.isFinite(tuitionAmount) && tuitionAmount >= 0 ? tuitionAmount : null,
  };
  return api<StudentCard>("/api/student-management/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
}

export function addStudentToClass(classId: string, studentMembershipId: string) {
  return api<ClassCard>(`/api/student-management/classes/${classId}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_membership_id: studentMembershipId }),
  });
}

export function getStudentProfileCollectionSettings() {
  return api<StudentProfileCollectionSettings>("/api/student-management/student-profile-settings");
}

export function updateStudentProfileCollectionSettings(payload: StudentProfileCollectionSettings) {
  return api<StudentProfileCollectionSettings>("/api/student-management/student-profile-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function mergeStudents(studentId: string, otherStudentId: string) {
  return api<{
    primary_student_id: string;
    merged_student_id: string;
    primary_student: StudentCard;
    counts: Record<string, number>;
  }>(`/api/student-management/students/${studentId}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ other_student_id: otherStudentId }),
  });
}

export function ensureStudentInviteCode(id: string) {
  return api<{ invite_code: string; invite_code_preview?: string | null; invite_codes?: StudentInviteCode[] }>(`/api/student-management/students/${id}/invite-code`, {
    method: "POST",
  });
}

export function getClassDetail(id: string) {
  return api<ClassCard>(`/api/student-management/classes/${id}`);
}

export function getStudentDetail(id: string) {
  return api<
    StudentCard & {
      paper_session_history: unknown[];
      wrong_answers: WrongAnswer[];
      schedule_events: ScheduleEvent[];
      counseling_formats: CounselingFormat[];
      counseling_presets: CounselingPreset[];
      counseling_logs: CounselingLog[];
      analytics: Record<string, unknown>;
    }
  >(`/api/student-management/students/${id}`);
}

export function getStudentExamStatsSeries(studentId: string, params?: { start_date?: string; end_date?: string }) {
  const search = new URLSearchParams();
  if (params?.start_date) search.set("start_date", params.start_date);
  if (params?.end_date) search.set("end_date", params.end_date);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return api<StudentExamStatsPoint[]>(`/api/student-management/students/${studentId}/exam-stats-series${suffix}`);
}

export function listPaperSessions() {
  return api<PaperSessionSummary[]>("/api/student-management/paper-sessions");
}

export function createPaperSession(payload: {
  title: string;
  description?: string;
  source_problem_set_id?: string | null;
  source_batch_id?: string | null;
  problem_ids?: string[];
  session_type: string;
  target_type?: string | null;
  class_ids?: string[];
  student_membership_ids?: string[];
  scheduled_at?: string | null;
  due_at?: string | null;
  status?: string;
  create_calendar_events?: boolean;
}) {
  return api<PaperSessionSummary>("/api/student-management/paper-sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createScheduleEvent(payload: {
  class_id: string;
  title: string;
  description?: string | null;
  event_type?: string;
  starts_at: string;
  ends_at?: string | null;
  linked_paper_session_id?: string | null;
  counts_for_tuition?: boolean;
  series_id?: string | null;
  series_position?: number | null;
  series_size?: number | null;
}) {
  return api<ScheduleEvent>("/api/student-management/schedule-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateScheduleEvent(id: string, payload: Partial<{
  class_id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  linked_paper_session_id: string | null;
  counts_for_tuition: boolean;
  update_scope: "single" | "future";
}>) {
  return api<ScheduleEvent>(`/api/student-management/schedule-events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function listScheduleEvents(params?: { class_id?: string; start_date?: string; end_date?: string }) {
  const search = new URLSearchParams();
  if (params?.class_id) search.set("class_id", params.class_id);
  if (params?.start_date) search.set("start_date", params.start_date);
  if (params?.end_date) search.set("end_date", params.end_date);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return api<ScheduleEvent[]>(`/api/student-management/schedule-events${suffix}`);
}

export function deleteScheduleEvent(id: string) {
  return api<void>(`/api/student-management/schedule-events/${id}`, {
    method: "DELETE",
  });
}

export function createCounselingLog(
  studentId: string,
  payload: CounselingLogPayload
) {
  return api<CounselingLog>(`/api/student-management/students/${studentId}/counseling-logs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCounselingLog(
  studentId: string,
  logId: string,
  payload: CounselingLogPayload
) {
  return api<CounselingLog>(`/api/student-management/students/${studentId}/counseling-logs/${logId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function cleanCounselingDraft(studentId: string, payload: CounselingLogPayload) {
  return api<CounselingCleanPreview>(`/api/student-management/students/${studentId}/counseling-logs/clean-preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function transcribeCounselingAudio(file: Blob) {
  const form = new FormData();
  const extension = file.type.includes("mp4") ? "m4a" : file.type.includes("mpeg") ? "mp3" : "webm";
  form.append("file", file, `counseling-audio.${extension}`);
  const response = await authHttp.post<CounselingTranscriptionResponse>("/api/student-management/counseling/transcribe", form);
  return response.data;
}

export function previewCounselingIntake(payload: {
  mode: "new" | "existing";
  transcript: string;
  student_id?: string | null;
  student_name?: string | null;
}) {
  return api<CounselingIntakePreview>("/api/student-management/counseling/intake-preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRoutineActions() {
  return api<RoutineAction[]>("/api/student-management/routines");
}

export function refreshRoutineAi(routineId: string) {
  return api<RoutineAction>(`/api/student-management/routines/${routineId}/refresh-ai`, {
    method: "POST",
  });
}

export function updateRoutineMessage(routineId: string, messageId: string, payload: { message_body?: string; status?: "pending" | "excluded" }) {
  return api<RoutineAction>(`/api/student-management/routines/${routineId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function sendRoutineAction(routineId: string) {
  return api<RoutineAction>(`/api/student-management/routines/${routineId}/send`, {
    method: "POST",
  });
}

export function listTuitionPayments(daysAhead = 14) {
  return api<TuitionDashboard>(`/api/student-management/tuition?days_ahead=${daysAhead}`);
}

export function confirmTuitionPaid(paymentId: string) {
  return api<TuitionPayment>(`/api/student-management/tuition/${paymentId}/paid`, {
    method: "POST",
  });
}

export function sendTuitionReminder(paymentId: string) {
  return api<{ payment: TuitionPayment; guardian_phone: string; message_body: string; sms_url: string }>(`/api/student-management/tuition/${paymentId}/remind`, {
    method: "POST",
  });
}

export function updateTuitionEventCount(eventId: string, countsForTuition: boolean) {
  return api<ScheduleEvent>(`/api/student-management/tuition/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ counts_for_tuition: countsForTuition }),
  });
}

export function updateTuitionSessionAdjustment(eventId: string, studentId: string, payload: { counts_for_tuition: boolean; reason?: string | null; note?: string | null }) {
  return api<{ event: ScheduleEvent; student_membership_id: string; counts_for_tuition: boolean; reason?: string | null; note?: string | null }>(
    `/api/student-management/tuition/events/${eventId}/students/${studentId}/adjustment`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteCounselingLog(studentId: string, logId: string) {
  return api<void>(`/api/student-management/students/${studentId}/counseling-logs/${logId}`, {
    method: "DELETE",
  });
}

export function updateClassCounselingFormat(classId: string, payload: { fields: CounselingFormatField[] }) {
  return api<CounselingFormat>(`/api/student-management/classes/${classId}/counseling-format`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function saveCounselingPreset(slot: number, payload: { name?: string | null; subject?: string | null; fields: CounselingFormatField[] }) {
  return api<CounselingPreset>(`/api/student-management/counseling-presets/${slot}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getPaperSessionDetail(id: string) {
  return api<PaperSessionDetail>(`/api/student-management/paper-sessions/${id}`);
}

export function savePaperSessionGrade(
  id: string,
  payload: {
    student_membership_id: string;
    statuses?: Array<{ problem_id?: string; problem_number: number; result_status: "correct" | "wrong" | "unanswered" | "unmarked" }>;
    wrong_numbers?: string | null;
    mark_unlisted_correct?: boolean;
  }
) {
  return api<PaperSessionDetail>(`/api/student-management/paper-sessions/${id}/grade`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePaperSessionResult(id: string) {
  return api<void>(`/api/student-management/paper-session-results/${id}`, {
    method: "DELETE",
  });
}

export function listWrongAnswers(params?: { class_id?: string; student_membership_id?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params?.class_id) search.set("class_id", params.class_id);
  if (params?.student_membership_id) search.set("student_membership_id", params.student_membership_id);
  if (params?.status) search.set("status", params.status);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return api<WrongAnswer[]>(`/api/student-management/wrong-answers${suffix}`);
}

export function deleteWrongAnswerRecord(id: string) {
  return api<void>(`/api/student-management/wrong-answers/${id}`, {
    method: "DELETE",
  });
}

export function createReviewSet(payload: {
  title: string;
  wrong_answer_ids?: string[];
  class_id?: string | null;
  student_membership_id?: string | null;
  unresolved_only?: boolean;
}) {
  return api<{ id: string; name: string; problem_count: number; href: string }>("/api/student-management/wrong-answers/review-set", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
