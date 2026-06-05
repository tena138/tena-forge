import { api } from "@/lib/api";

export type StudentCard = {
  id: string;
  student_user_id: string;
  academy_seat_id?: string | null;
  invite_code_preview?: string | null;
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
};

export type ClassCard = {
  id: string;
  name: string;
  description?: string | null;
  subject?: string | null;
  grade_level?: string | null;
  is_active: boolean;
  student_count: number;
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
  problem_text?: string;
  answer?: string | null;
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
}) {
  const normalized = {
    name: payload.name.trim(),
    grade_level: payload.grade_level?.trim() || null,
    school: payload.school?.trim() || null,
    memo: payload.memo?.trim() || null,
    status: payload.status || "active",
    class_ids: payload.class_ids || [],
  };
  return api<StudentCard>("/api/student-management/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
}

export function ensureStudentInviteCode(id: string) {
  return api<{ invite_code: string; invite_code_preview?: string | null }>(`/api/student-management/students/${id}/invite-code`, {
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
}) {
  return api<ScheduleEvent>("/api/student-management/schedule-events", {
    method: "POST",
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
  payload: {
    counseling_date?: string | null;
    title: string;
    class_id?: string | null;
    notes?: string | null;
    weekly_report?: string | null;
    next_plan?: string | null;
    sections?: Array<{
      field_id: string;
      label: string;
      value?: string | null;
      include_in_report?: boolean;
    }>;
  }
) {
  return api<CounselingLog>(`/api/student-management/students/${studentId}/counseling-logs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCounselingLog(
  studentId: string,
  logId: string,
  payload: {
    counseling_date?: string | null;
    title: string;
    class_id?: string | null;
    notes?: string | null;
    weekly_report?: string | null;
    next_plan?: string | null;
    sections?: Array<{
      field_id: string;
      label: string;
      value?: string | null;
      include_in_report?: boolean;
    }>;
  }
) {
  return api<CounselingLog>(`/api/student-management/students/${studentId}/counseling-logs/${logId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
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
