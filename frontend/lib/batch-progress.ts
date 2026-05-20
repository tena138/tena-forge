import type { BatchStatus } from "@/lib/api";
import { authHttp, ensureAccessToken } from "@/lib/auth-client";

export const ACTIVE_BATCH_STORAGE_KEY = "tena-forge-active-batch-id-v2";
const LEGACY_ACTIVE_BATCH_STORAGE_KEYS = ["tena-forge-active-batch-id"];
export const ACTIVE_BATCH_EVENT = "tena-forge-active-batch-change";

export type BatchStatusResponse = {
  batch_id: string;
  status: BatchStatus;
  processing_mode?: "local" | "cloud";
  progress_message: string;
  progress_percent: number | null;
  estimated_seconds_remaining: number | null;
  failure_stage?: string | null;
  failure_reason?: string | null;
  failure_hint?: string | null;
  failed_at?: string | null;
};

export function formatRemaining(seconds: number | null) {
  if (seconds === null) return "계산 중";
  if (seconds < 60) return `약 ${Math.max(seconds, 1)}초 남음`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `약 ${minutes}분 ${rest}초 남음`;
  const hours = Math.floor(minutes / 60);
  return `약 ${hours}시간 ${minutes % 60}분 남음`;
}

export function friendlyProgressMessage(status: BatchStatus | null, message: string, submitting = false) {
  if (submitting) return "업로드 중입니다.";
  if (status === "done") return "처리가 완료되었습니다.";
  if (status === "error") return message || "처리 중 오류가 발생했습니다.";
  if (!message) return "처리를 준비하고 있습니다.";

  if (message.includes("로컬 워커 대기")) return "로컬 실행기가 필요합니다.";
  if (message.includes("렌더링") || message.includes("PDF")) return "PDF를 읽는 중입니다.";
  if (message.includes("문항") && message.includes("추출")) return "문항을 추출하는 중입니다.";
  if (message.includes("시각") || message.includes("캡처")) return "시각 자료를 정리하는 중입니다.";
  if (message.includes("선지") || message.includes("정리")) return "선지를 정리하는 중입니다.";
  if (message.includes("해설")) return "해설과 정답을 매칭하는 중입니다.";
  if (message.includes("저장")) return "추출한 문항을 저장하는 중입니다.";
  return message;
}

export function rememberActiveBatch(batchId: string) {
  window.localStorage.setItem(ACTIVE_BATCH_STORAGE_KEY, batchId);
  window.dispatchEvent(new CustomEvent(ACTIVE_BATCH_EVENT, { detail: batchId }));
}

export function forgetActiveBatch(batchId?: string) {
  const current = readActiveBatch();
  if (!batchId || current === batchId) {
    window.localStorage.removeItem(ACTIVE_BATCH_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(ACTIVE_BATCH_EVENT, { detail: "" }));
  }
}

export function readActiveBatch() {
  for (const key of LEGACY_ACTIVE_BATCH_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  return window.localStorage.getItem(ACTIVE_BATCH_STORAGE_KEY);
}

export function shouldForgetActiveBatchAfterStatusError(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 400 || status === 404 || status === 422;
}

export async function fetchBatchStatus(batchId: string) {
  await ensureAccessToken();
  const response = await authHttp.get<BatchStatusResponse>(`/api/batches/${batchId}/status`, {
    headers: { "Cache-Control": "no-store" },
  });
  return response.data;
}
