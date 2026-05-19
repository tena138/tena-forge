export type AcademyContextId = "personal" | string;

export type StudentUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

export type StudentAcademyMembershipStatus = "active" | "ended" | "suspended";

export type StudentAcademyMembership = {
  id: string;
  student_user_id: string;
  academy_id: string;
  academy_seat_id: string;
  status: StudentAcademyMembershipStatus;
  academy_name?: string;
  joined_at: string;
};

export type AcademySeat = {
  id: string;
  academy_id: string;
  seat_number: string;
  display_name?: string | null;
  invite_code_preview: string;
  current_student_membership_id?: string | null;
  is_active: boolean;
  assigned: boolean;
};

export type StudentQuotaKind = "upload" | "extraction" | "export";

export type StudentQuota = {
  total: Record<StudentQuotaKind, number>;
  used: Record<StudentQuotaKind, number>;
  remaining: Record<StudentQuotaKind, number>;
  contributions: Array<{
    source: AcademyContextId;
    academy_name?: string;
    upload: number;
    extraction: number;
    export: number;
  }>;
};

export type AssignmentType = "homework" | "practice" | "test" | "material" | "custom";
export type AssignmentSubmissionMode =
  | "completion"
  | "answer_input"
  | "solution_photo"
  | "per_problem_checklist"
  | "auto_graded_problem_set"
  | "timed_test";

export type Assignment = {
  id: string;
  academy_id: string;
  title: string;
  description?: string | null;
  assignment_type: AssignmentType | string;
  submission_mode: AssignmentSubmissionMode | string;
  open_at?: string | null;
  due_at?: string | null;
  close_at?: string | null;
  result_release_policy?: string;
  time_limit_minutes?: number | null;
};

export type TestSession = {
  id: string;
  assignment_id: string;
  student_membership_id: string;
  started_at: string;
  expires_at?: string | null;
  submitted_at?: string | null;
  status: "in_progress" | "submitted" | "auto_submitted" | "expired" | string;
  score?: number | null;
};

export type StudentMaterial = {
  id: string;
  academy_id: string;
  title: string;
  material_type: "pdf" | "problem_set" | "image" | "text" | "link" | "solution_sheet" | "custom" | string;
  permissions: {
    view?: boolean;
    download?: boolean;
    print?: boolean;
    export?: boolean;
    add_to_wrong_answer?: boolean;
  };
  expires_at?: string | null;
};

export type CalendarEvent = {
  id: string;
  owner_type: "student" | "academy" | "class" | "membership" | string;
  owner_id: string;
  academy_id?: string | null;
  class_id?: string | null;
  student_membership_id?: string | null;
  title: string;
  description?: string | null;
  event_type:
    | "class"
    | "test"
    | "homework_due"
    | "consultation"
    | "makeup_class"
    | "holiday"
    | "cancellation"
    | "academy_notice"
    | "personal"
    | "custom"
    | string;
  starts_at: string;
  ends_at: string;
  visibility: "personal_private" | "academy_staff" | "class_members" | "specific_students" | string;
};

export type WrongAnswerItem = {
  id: string;
  student_user_id: string;
  academy_id?: string | null;
  student_membership_id?: string | null;
  source_type:
    | "personal_photo"
    | "personal_one_page_pdf"
    | "academy_assignment"
    | "academy_test"
    | "academy_material"
    | "manual_entry"
    | "existing_problem_library"
    | string;
  source_ref_id?: string | null;
  extracted_problem_text?: string | null;
  extracted_choices?: unknown[];
  extracted_answer?: string | null;
  extracted_explanation?: string | null;
  subject?: string | null;
  unit?: string | null;
  difficulty?: string | null;
  tags: string[];
  visibility: "private" | "shared_with_academy" | "academy_linked" | string;
  memo?: string | null;
  created_at: string;
};

export const BASE_STUDENT_DAILY_QUOTA: Record<StudentQuotaKind, number> = {
  upload: 5,
  extraction: 5,
  export: 5
};

export const STUDENT_CONTEXT_LABELS = {
  personal: "Personal",
  academy: "Academy"
} as const;

export function computeRemainingQuota(quota: StudentQuota, kind: StudentQuotaKind) {
  return Math.max((quota.total[kind] || 0) - (quota.used[kind] || 0), 0);
}

export function isAcademyContext(contextId: AcademyContextId) {
  return contextId !== "personal";
}

