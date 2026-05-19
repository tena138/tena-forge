import type { BatchStatusResponse } from "@/lib/batch-progress";

export const BATCH_NOTIFICATION_STORAGE_KEY = "tena-forge-batch-notifications-v1";
export const BATCH_NOTIFICATION_EVENT = "tena-forge-batch-notification-change";

export type BatchNotification = {
  id: string;
  batchId: string;
  status: "done" | "error";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
};

const MAX_NOTIFICATIONS = 20;

function emitNotificationChange(detail?: BatchNotification) {
  window.dispatchEvent(new CustomEvent(BATCH_NOTIFICATION_EVENT, { detail: detail || null }));
}

function writeBatchNotifications(notifications: BatchNotification[]) {
  window.localStorage.setItem(BATCH_NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  emitNotificationChange();
}

export function readBatchNotifications() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BATCH_NOTIFICATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BatchNotification => Boolean(item?.id && item?.batchId && item?.title && item?.href));
  } catch {
    return [];
  }
}

export function addBatchStatusNotification(statusData: BatchStatusResponse) {
  if (typeof window === "undefined") return null;
  if (statusData.status !== "done" && statusData.status !== "error") return null;

  const id = `${statusData.batch_id}:${statusData.status}`;
  const current = readBatchNotifications();
  if (current.some((notification) => notification.id === id)) return null;

  const isDone = statusData.status === "done";
  const notification: BatchNotification = {
    id,
    batchId: statusData.batch_id,
    status: statusData.status,
    title: isDone ? "추출 완료" : "추출 실패",
    body: isDone
      ? "배치 처리가 끝났습니다. 문항 검토를 시작할 수 있습니다."
      : statusData.failure_reason || statusData.progress_message || "처리 중 오류가 발생했습니다.",
    href: isDone ? `/problems/review?batch_id=${statusData.batch_id}` : "/batches",
    createdAt: new Date().toISOString(),
    read: false,
  };

  window.localStorage.setItem(BATCH_NOTIFICATION_STORAGE_KEY, JSON.stringify([notification, ...current].slice(0, MAX_NOTIFICATIONS)));
  emitNotificationChange(notification);
  return notification;
}

export function markBatchNotificationsRead(notificationId?: string) {
  if (typeof window === "undefined") return;
  const notifications = readBatchNotifications();
  const next = notifications.map((notification) =>
    !notificationId || notification.id === notificationId ? { ...notification, read: true } : notification
  );
  writeBatchNotifications(next);
}

export function clearBatchNotifications() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(BATCH_NOTIFICATION_STORAGE_KEY);
  emitNotificationChange();
}
