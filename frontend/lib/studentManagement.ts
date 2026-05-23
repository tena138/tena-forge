import { api } from "@/lib/api";

export type StudentCard = {
  id: string;
  student_user_id: string;
  name: string;
  grade_level?: string | null;
  school?: string | null;
  status: string;
  status_chip: string;
  memo?: string | null;
  class_ids: string[];
  class_names: string[];
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
  average_score?: number | null;
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
    result_status: "correct" | "wrong" | "unmarked";
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
  return api<ClassCard>("/api/student-management/classes", {
    method: "POST",
    body: JSON.stringify(payload),
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
  return api<StudentCard>("/api/student-management/students", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getClassDetail(id: string) {
  return api<ClassCard>(`/api/student-management/classes/${id}`);
}

export function getStudentDetail(id: string) {
  return api<StudentCard & { paper_session_history: unknown[]; wrong_answers: WrongAnswer[]; analytics: Record<string, unknown> }>(
    `/api/student-management/students/${id}`
  );
}

export function listPaperSessions() {
  return api<PaperSessionSummary[]>("/api/student-management/paper-sessions");
}

export function createPaperSession(payload: {
  title: string;
  description?: string;
  source_problem_set_id: string;
  session_type: string;
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

export function getPaperSessionDetail(id: string) {
  return api<PaperSessionDetail>(`/api/student-management/paper-sessions/${id}`);
}

export function savePaperSessionGrade(
  id: string,
  payload: {
    student_membership_id: string;
    statuses?: Array<{ problem_id?: string; problem_number: number; result_status: "correct" | "wrong" | "unmarked" }>;
    wrong_numbers?: string | null;
    mark_unlisted_correct?: boolean;
  }
) {
  return api<PaperSessionDetail>(`/api/student-management/paper-sessions/${id}/grade`, {
    method: "POST",
    body: JSON.stringify(payload),
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
