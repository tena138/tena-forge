import type { CanvasDocument } from "@/lib/editorTypes";
import { authHttp, getAccessToken } from "@/lib/auth-client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type BatchStatus = "pending" | "processing" | "done" | "error";

export type Tag = {
  id?: string;
  problem_id?: string;
  subject: string | null;
  unit: string | null;
  difficulty: string | null;
  problem_type: string | null;
  source: string | null;
};

export type Problem = {
  id: string;
  problem_number: number;
  problem_text: string;
  choices?: Array<{ label?: string; choice_label?: string; text?: string; choice_text?: string }>;
  has_visual: boolean;
  visual_url: string | null;
  review_page_image_url?: string | null;
  review_page_number?: number | null;
  answer?: string | null;
  solution_steps?: string | null;
  key_concept?: string | null;
  needs_review: boolean;
  source_batch_id: string;
  source_type: SourceType;
  source_label: string | null;
  batch_name?: string | null;
  batch_accent_color?: string | null;
  rights_confirmed: boolean;
  rights_confirmed_at?: string | null;
  rights_note?: string | null;
  visibility: "private" | "unlisted" | "public" | "marketplace_restricted";
  origin_type: "owned" | "licensed" | "derived" | "imported_unknown";
  owner_id?: string;
  academy_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  tags: Tag | null;
};

export type Batch = {
  id: string;
  name: string;
  problem_pdf_filename: string;
  solution_pdf_filename: string | null;
  status: BatchStatus;
  source_type: SourceType;
  source_label: string | null;
  accent_color: string;
  rights_confirmed: boolean;
  rights_note: string | null;
  subject_candidates?: string[];
  unit_candidates?: string[];
  archive_folder_id?: string | null;
  subject_engine?: "math" | "korean" | "english";
  processing_task?: "full" | "solution_only";
  created_at: string;
  problem_count: number;
  review_count: number;
  review_item_count?: number;
  pending_review_item_count?: number;
  tagged_count: number;
  untagged_count: number;
  progress_message?: string | null;
  progress_percent?: number | null;
  estimated_seconds_remaining?: number | null;
  failure_stage?: string | null;
  failure_reason?: string | null;
  failure_hint?: string | null;
  failed_at?: string | null;
  unit_map?: Array<{
    from_page?: number | null;
    to_page?: number | null;
    unit_name?: string | null;
    page_range?: string | null;
  }> | null;
};

export type ArchiveFolder = {
  id: string;
  owner_id: string;
  academy_id?: string | null;
  subject_engine?: "math" | "korean" | "english";
  name: string;
  parent_id?: string | null;
  color?: string | null;
  order: number;
  created_at: string;
  updated_at?: string | null;
};

export type ArchiveFolderPayload = {
  name?: string;
  parent_id?: string | null;
  subject_engine?: "math" | "korean" | "english";
  color?: string | null;
  order?: number | null;
};

export type KoreanReviewLinkedQuestion = {
  question_id: string;
  problem_id?: string | null;
  question_number?: string | null;
  problem_number?: number | null;
  needs_review: boolean;
  source_pages?: number[];
};

export type KoreanReviewPassageItem = {
  item_type: "passage";
  id: string;
  passage_id: string;
  source_pages: number[];
  passage_instruction?: string | null;
  passage_title?: string | null;
  passage_text: string;
  passage_type: string;
  linked_questions: KoreanReviewLinkedQuestion[];
  review_page_image_url?: string | null;
  review_page_number?: number | null;
  needs_review: boolean;
};

export type KoreanReviewQuestionItem = {
  item_type: "question";
  id: string;
  linked_passage_id?: string | null;
  question_id?: string | null;
  problem: Problem;
};

export type KoreanReviewItem = KoreanReviewPassageItem | KoreanReviewQuestionItem;

export type KoreanReviewItemsResponse = {
  batch_id: string;
  review_item_count: number;
  pending_review_item_count: number;
  items: KoreanReviewItem[];
};

export type DashboardAnnouncement = {
  id: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  badge: string | null;
  cta_label: string | null;
  cta_href: string | null;
  secondary_label: string | null;
  secondary_href: string | null;
  media_type: "none" | "image" | "video";
  media_url: string | null;
  media_alt: string | null;
  theme: "product" | "update" | "event" | "system";
  priority: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardAnnouncementPayload = Partial<
  Pick<
    DashboardAnnouncement,
    | "eyebrow"
    | "title"
    | "body"
    | "badge"
    | "cta_label"
    | "cta_href"
    | "secondary_label"
    | "secondary_href"
    | "media_type"
    | "media_url"
    | "media_alt"
    | "theme"
    | "priority"
    | "is_active"
    | "starts_at"
    | "ends_at"
  >
>;

export type DashboardAnnouncementMediaUpload = {
  url: string;
  media_type: "image" | "video";
  filename: string;
  content_type: string;
  size: number;
};

export type SourceType =
  | "self_created"
  | "academy_internal"
  | "licensed"
  | "public_domain_or_open"
  | "personal_study_only"
  | "unknown";

export const sourceTypeOptions: Array<{ value: SourceType; label: string; warning?: string }> = [
  { value: "self_created", label: "직접 제작한 자료" },
  { value: "academy_internal", label: "우리 학원 내부 자료" },
  { value: "licensed", label: "이용 허락을 받은 자료" },
  { value: "public_domain_or_open", label: "공개 이용 가능한 자료" },
  { value: "personal_study_only", label: "개인 학습용 자료", warning: "이 출처 유형은 공개 공유 또는 마켓플레이스 등록이 제한됩니다." },
  { value: "unknown", label: "기타 / 출처 확인 필요", warning: "출처 확인 전에는 공개 공유 또는 마켓플레이스 등록이 제한됩니다." },
];

export function sourceTypeLabel(value?: string | null) {
  return sourceTypeOptions.find((option) => option.value === value)?.label || "출처 확인 필요";
}

export type ProblemSetListItem = {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  subject?: string | null;
  grade?: string | null;
  unit?: string | null;
  difficulty?: string | null;
  visibility?: "private" | "unlisted" | "public" | "marketplace";
  source_type?: SourceType;
  rights_confirmed?: boolean;
  can_publish_to_marketplace?: boolean;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
};

export type ProblemSetItem = {
  id: string;
  problem_set_id: string;
  problem_id: string;
  order_index: number;
  problem: Problem;
};

export type ProblemSet = {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  subject?: string | null;
  grade?: string | null;
  unit?: string | null;
  difficulty?: string | null;
  problem_count?: number;
  visibility?: "private" | "unlisted" | "public" | "marketplace";
  source_type?: SourceType;
  rights_confirmed?: boolean;
  can_publish_to_marketplace?: boolean;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
  items: ProblemSetItem[];
};

export type ExamTemplate = {
  id: string;
  name: string;
  academy_name: string | null;
  logo_url: string | null;
  canvas_json: CanvasDocument | null;
  header_fields: {
    exam_title?: boolean;
    class_name?: boolean;
    student_name?: boolean;
    date?: boolean;
  };
  footer_text: string | null;
  font_size: number;
  problems_per_page: number;
  include_solution: boolean;
  created_at: string;
  updated_at: string;
};

export type VisualPagePlan = {
  document_kind?: "exam" | "textbook";
  include_cover?: boolean;
  cover_page_id?: string | null;
  first_problem_page_id?: string | null;
  body_problem_page_id?: string | null;
  left_inner_page_id?: string | null;
  right_inner_page_id?: string | null;
  solution_page_id?: string | null;
  answer_page_id?: string | null;
};

export type TemplateVersion = {
  id: string;
  template_id: string;
  canvas_json: CanvasDocument;
  saved_at: string;
  version_number: number;
  element_count: number;
};

export type AssetItem = {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: "image" | "logo" | "other";
  content_type: string;
  created_at: string;
};

export async function saveVisualTemplate(payload: {
  id?: string | null;
  name: string;
  canvas_json: CanvasDocument;
  academy_name?: string | null;
  font_size?: number;
  problems_per_page?: number;
  include_solution?: boolean;
}) {
  const response = await authHttp.request<ExamTemplate>({
    url: `/api/templates${payload.id ? `/${payload.id}` : ""}`,
    method: payload.id ? "PATCH" : "POST",
    data: payload,
  });
  return response.data;
}

export async function previewCanvasExport(canvas_json: CanvasDocument) {
  const response = await authHttp.post("/api/export/preview", { canvas_json }, { responseType: "blob" });
  return response.data as Blob;
}

export async function duplicateTemplate(id: string) {
  return api<ExamTemplate>(`/api/templates/${id}/duplicate`, { method: "POST" });
}

export async function listTemplateVersions(id: string) {
  return api<TemplateVersion[]>(`/api/templates/${id}/versions`);
}

export async function restoreTemplateVersion(templateId: string, versionId: string) {
  return api<ExamTemplate>(`/api/templates/${templateId}/versions/${versionId}/restore`, { method: "POST" });
}

export async function downloadExport(payload: {
  source: "set" | "selection";
  problem_set_id?: string | null;
  problem_ids?: string[] | null;
  template_id?: string | null;
  hub_template_id?: string | null;
  exam_title: string;
  class_name?: string;
  student_name?: string;
  date: string;
  exam_start_time?: string;
  exam_end_time?: string;
  exam_time?: string;
  exam_datetime?: string;
  custom_variables?: Record<string, string>;
  visual_page_plan?: VisualPagePlan | null;
  include_solution: boolean;
  include_missing_solution_metadata?: boolean;
}) {
  const response = await authHttp.post("/api/export", payload, { responseType: "blob" });
  const blob = response.data as Blob;
  const disposition = response.headers["content-disposition"] || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const fallbackMatch = disposition.match(/filename="?([^";]+)"?/);
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : fallbackMatch?.[1] || `${payload.exam_title}_${payload.date}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCounselingExport(payload: {
  student_id: string;
  log_ids: string[];
  hub_template_id: string;
  title?: string | null;
}) {
  const response = await authHttp.post(`/api/student-management/students/${payload.student_id}/counseling-logs/export`, {
    log_ids: payload.log_ids,
    hub_template_id: payload.hub_template_id,
    title: payload.title || null,
  }, { responseType: "blob" });
  const blob = response.data as Blob;
  const disposition = response.headers["content-disposition"] || "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const fallbackMatch = disposition.match(/filename="?([^";]+)"?/);
  const filename = encodedMatch
    ? decodeURIComponent(encodedMatch[1])
    : fallbackMatch?.[1] || `${payload.title || "counseling-log"}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authHttp.request<T>({
    url: path,
    method: init?.method || "GET",
    data: init?.body ? JSON.parse(String(init.body)) : undefined,
    headers: init?.headers as Record<string, string> | undefined,
  });
  if (response.status === 204) return undefined as T;
  return response.data;
}

export async function listArchiveFolders(subjectEngine?: "math" | "korean" | "english") {
  const query = subjectEngine ? `?subject_engine=${encodeURIComponent(subjectEngine)}` : "";
  return api<ArchiveFolder[]>(`/api/archive-folders${query}`);
}

export async function createArchiveFolder(payload: Required<Pick<ArchiveFolderPayload, "name">> & ArchiveFolderPayload) {
  return api<ArchiveFolder>("/api/archive-folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateArchiveFolder(id: string, payload: ArchiveFolderPayload) {
  return api<ArchiveFolder>(`/api/archive-folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteArchiveFolder(id: string) {
  return api<void>(`/api/archive-folders/${id}`, { method: "DELETE" });
}

export async function updateBatchArchiveFolder(batchId: string, archiveFolderId: string | null) {
  return api<Batch>(`/api/batches/${batchId}/archive-folder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archive_folder_id: archiveFolderId }),
  });
}

export async function attachBatchSolutionPdf(batchId: string, file: File, onProgress?: (progress: number) => void) {
  const form = new FormData();
  form.append("solution_pdf", file);
  const response = await authHttp.post<{ batch_id: string; status: Batch["status"] }>(`/api/batches/${batchId}/solution-pdf`, form, {
    onUploadProgress: (event) => {
      if (!event.total) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
  return response.data;
}

export async function uploadProblemVisual(problemId: string, file: File, onProgress?: (progress: number) => void) {
  const form = new FormData();
  form.append("file", file);
  const response = await authHttp.post<Problem>(`/api/problems/${problemId}/visual`, form, {
    onUploadProgress: (event) => {
      if (!event.total) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
  return response.data;
}

export async function getActiveDashboardAnnouncement() {
  return api<DashboardAnnouncement | null>("/api/dashboard-announcements/active");
}

export async function listActiveDashboardAnnouncements(limit = 5) {
  return api<DashboardAnnouncement[]>(`/api/dashboard-announcements/active-list?limit=${limit}`);
}

export async function getDashboardAnnouncementAccess() {
  return api<{ can_manage: boolean }>("/api/dashboard-announcements/access");
}

export async function listDashboardAnnouncements() {
  return api<DashboardAnnouncement[]>("/api/admin/dashboard-announcements");
}

export async function createDashboardAnnouncement(payload: DashboardAnnouncementPayload) {
  return api<DashboardAnnouncement>("/api/admin/dashboard-announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateDashboardAnnouncement(id: string, payload: DashboardAnnouncementPayload) {
  return api<DashboardAnnouncement>(`/api/admin/dashboard-announcements/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteDashboardAnnouncement(id: string) {
  return api<void>(`/api/admin/dashboard-announcements/${id}`, { method: "DELETE" });
}

export function uploadDashboardAnnouncementMedia(file: File, onProgress?: (progress: number) => void) {
  return new Promise<DashboardAnnouncementMediaUpload>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(JSON.parse(xhr.responseText) as DashboardAnnouncementMediaUpload);
      } else {
        let message = "미디어 업로드에 실패했습니다.";
        try {
          const data = JSON.parse(xhr.responseText);
          if (typeof data?.detail === "string") message = data.detail;
        } catch {
          if (xhr.responseText) message = xhr.responseText;
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("미디어 업로드에 실패했습니다."));
    xhr.open("POST", `${API_URL}/api/admin/dashboard-announcements/media`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  });
}

export async function listAssets() {
  return api<AssetItem[]>("/api/assets");
}

export function uploadAsset(file: File, onProgress?: (progress: number) => void) {
  return new Promise<AssetItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(JSON.parse(xhr.responseText) as AssetItem);
      } else {
        reject(new Error(xhr.responseText || "이미지 업로드에 실패했습니다."));
      }
    };
    xhr.onerror = () => reject(new Error("이미지 업로드에 실패했습니다."));
    xhr.open("POST", `${API_URL}/api/assets`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  });
}

export async function renameAsset(id: string, filename: string) {
  return api<AssetItem>(`/api/assets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
}

export async function deleteAsset(id: string) {
  return api<void>(`/api/assets/${id}`, { method: "DELETE" });
}

export async function submitProblemSetToMarketplace(id: string, payload: {
  rights_confirmed: boolean;
  no_unauthorized_copy: boolean;
  pricing_type?: string;
  license_type?: string;
  price_amount?: number | null;
  category?: string | null;
}) {
  return api<{ listing_id: string; status: string }>(`/api/problem-sets/${id}/submit-to-marketplace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function assetUrl(url: string | null) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${API_URL}${url}`;
}

export function statusLabel(status: BatchStatus) {
  return { pending: "대기", processing: "처리 중", done: "완료", error: "오류" }[status];
}
