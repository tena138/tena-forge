"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";

import {
  addBatchStatusNotification,
  BATCH_NOTIFICATION_EVENT,
  BATCH_NOTIFICATION_STORAGE_KEY,
  clearBatchNotifications,
  markBatchNotificationsRead,
  readBatchNotifications,
} from "@/lib/batch-notifications";
import type { BatchNotification } from "@/lib/batch-notifications";
import {
  ACTIVE_BATCH_EVENT,
  ACTIVE_BATCH_STORAGE_KEY,
  fetchActiveBatchStatus,
  fetchBatchStatus,
  forgetActiveBatch,
  formatRemaining,
  friendlyProgressMessage,
  readActiveBatch,
  rememberActiveBatch,
  shouldForgetActiveBatchAfterStatusError,
} from "@/lib/batch-progress";
import type { BatchStatusResponse } from "@/lib/batch-progress";
import { cn } from "@/lib/utils";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safeProgressDetail(statusData: BatchStatusResponse) {
  const detail = statusData.progress_message || "";
  if (/로컬|워커|local|worker/i.test(detail)) {
    return statusData.status === "pending" ? "서버 작업 대기 중" : "서버 작업 처리 중";
  }
  return detail || (statusData.status === "pending" ? "처리 대기 중" : "처리 중");
}

function ActiveBatchPanel({ statusData }: { statusData: BatchStatusResponse }) {
  const progress = statusData.progress_percent ?? 0;
  const detail = safeProgressDetail(statusData);
  const message = friendlyProgressMessage(statusData.status, detail);
  const taskLabel = statusData.processing_task === "solution_only" ? "해설 재처리" : "PDF 추출";

  return (
    <Link
      href="/archive/new"
      className="mb-2 block rounded-[9px] border border-cyan-200/20 bg-cyan-300/[0.08] p-3 text-left transition hover:border-cyan-200/35 hover:bg-cyan-300/[0.12]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-cyan-50">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
            <span className="truncate">{message}</span>
          </div>
          <p className="mt-1 truncate text-xs text-cyan-100/70">{taskLabel} · {detail}</p>
        </div>
        <span className="shrink-0 text-sm font-black text-cyan-100">{progress}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-200 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-cyan-100/70">
        <span>{formatRemaining(statusData.estimated_seconds_remaining)}</span>
        <span>상태 보기</span>
      </div>
    </Link>
  );
}

export function HeaderNotifications() {
  const [notifications, setNotifications] = useState<BatchNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<BatchNotification | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<BatchStatusResponse | null>(null);
  const [pollVersion, setPollVersion] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const [layerPosition, setLayerPosition] = useState({ top: 64, right: 16 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);
  const activeStatusData = activeStatus && (activeStatus.status === "pending" || activeStatus.status === "processing") ? activeStatus : null;
  const activeProgress = activeStatusData?.progress_percent ?? 0;
  const buttonLabel = activeStatusData ? `추출 진행 중 ${activeProgress}%` : unreadCount ? `알림 ${unreadCount}개` : "알림";
  const layerStyle: CSSProperties = { top: layerPosition.top, right: layerPosition.right };

  const updateLayerPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportGap = 16;
    setLayerPosition({
      top: Math.round(rect.bottom + 8),
      right: Math.max(viewportGap, Math.round(window.innerWidth - rect.right)),
    });
  }, []);

  useEffect(() => {
    setPortalReady(true);
    setNotifications(readBatchNotifications());
    setActiveBatchId(readActiveBatch());

    function handleNotificationChange(event: Event) {
      const detail = (event as CustomEvent<BatchNotification | null>).detail;
      setNotifications(readBatchNotifications());
      if (detail) setToast(detail);
    }

    function handleActiveBatchChange(event: Event) {
      const customEvent = event as CustomEvent<string>;
      setActiveStatus(null);
      setActiveBatchId(customEvent.detail || readActiveBatch());
      setPollVersion((value) => value + 1);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === BATCH_NOTIFICATION_STORAGE_KEY) setNotifications(readBatchNotifications());
      if (event.key === ACTIVE_BATCH_STORAGE_KEY) {
        setActiveStatus(null);
        setActiveBatchId(readActiveBatch());
        setPollVersion((value) => value + 1);
      }
    }

    window.addEventListener(BATCH_NOTIFICATION_EVENT, handleNotificationChange);
    window.addEventListener(ACTIVE_BATCH_EVENT, handleActiveBatchChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(BATCH_NOTIFICATION_EVENT, handleNotificationChange);
      window.removeEventListener(ACTIVE_BATCH_EVENT, handleActiveBatchChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!open && !toast) return;
    updateLayerPosition();
    window.addEventListener("resize", updateLayerPosition);
    window.addEventListener("scroll", updateLayerPosition, true);
    return () => {
      window.removeEventListener("resize", updateLayerPosition);
      window.removeEventListener("scroll", updateLayerPosition, true);
    };
  }, [open, toast, updateLayerPosition]);

  useEffect(() => {
    if (!activeBatchId) {
      setActiveStatus(null);
      return;
    }

    const batchId = activeBatchId;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const data = await fetchBatchStatus(batchId);
        if (cancelled) return;
        if (data.status === "done" || data.status === "error") {
          addBatchStatusNotification(data);
          forgetActiveBatch(batchId);
          setActiveBatchId(null);
          setActiveStatus(null);
          if (timer) window.clearInterval(timer);
          return;
        }
        setActiveStatus(data);
      } catch (error) {
        if (shouldForgetActiveBatchAfterStatusError(error)) {
          forgetActiveBatch(batchId);
          if (!cancelled) {
            setActiveBatchId(null);
            setActiveStatus(null);
          }
          if (timer) window.clearInterval(timer);
          return;
        }
        try {
          const activeBatch = await fetchActiveBatchStatus();
          if (cancelled || !activeBatch) return;
          rememberActiveBatch(activeBatch.batch_id);
          setActiveBatchId(activeBatch.batch_id);
          setActiveStatus(activeBatch);
        } catch {
          // Keep the current active id and retry on the next interval.
        }
      }
    }

    poll();
    timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [activeBatchId, pollVersion]);

  useEffect(() => {
    let cancelled = false;

    async function discoverActiveBatch() {
      if (activeBatchId || readActiveBatch()) return;
      try {
        const activeBatch = await fetchActiveBatchStatus();
        if (cancelled) return;
        if (!activeBatch) return;
        rememberActiveBatch(activeBatch.batch_id);
        setActiveBatchId(activeBatch.batch_id);
        setActiveStatus(activeBatch);
      } catch {
        // Header progress should be opportunistic; auth/network failures are handled by the next poll.
      }
    }

    void discoverActiveBatch();
    const timer = window.setInterval(() => void discoverActiveBatch(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeBatchId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && unreadCount) {
      markBatchNotificationsRead();
      setNotifications(readBatchNotifications());
    }
  }

  function clearAll() {
    clearBatchNotifications();
    setNotifications([]);
    setOpen(false);
    setToast(null);
  }

  function openNotification(notification: BatchNotification) {
    markBatchNotificationsRead(notification.id);
    setNotifications(readBatchNotifications());
    setOpen(false);
    setToast(null);
  }

  const notificationLayer = portalReady
    ? createPortal(
        <>
          {toast && !open ? (
            <Link
              href={toast.href}
              className="fixed z-[4000] w-[min(84vw,340px)] rounded-[10px] border border-white/10 bg-[#090b12] p-3 text-sm text-white shadow-[0_24px_70px_rgba(0,0,0,0.46)] ring-1 ring-violet-300/10"
              style={layerStyle}
              onClick={() => openNotification(toast)}
            >
              <div className="flex gap-3">
                <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[8px]", toast.status === "done" ? "bg-emerald-400/12 text-emerald-200" : "bg-red-400/12 text-red-200")}>
                  {toast.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{toast.title}</span>
                  <span className="mt-1 block leading-5 text-slate-300">{toast.body}</span>
                </span>
              </div>
            </Link>
          ) : null}

          {open ? (
            <div className="fixed z-[4000] w-[min(88vw,380px)] rounded-[10px] border border-white/10 bg-[#090b12] p-2 text-sm shadow-[0_24px_70px_rgba(0,0,0,0.42)]" style={layerStyle}>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <div>
                  <div className="font-bold text-white">알림</div>
                </div>
                {notifications.length ? (
                  <button type="button" className="rounded-[7px] p-1 text-slate-500 hover:bg-white/[0.07] hover:text-white" aria-label="알림 비우기" onClick={clearAll}>
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="mt-1 max-h-[420px] overflow-y-auto [scrollbar-color:#2f3543_transparent] [scrollbar-width:thin]">
                {activeStatusData ? <ActiveBatchPanel statusData={activeStatusData} /> : null}
                {notifications.length ? (
                  <div className="grid gap-1">
                    {notifications.map((notification) => (
                      <Link
                        key={notification.id}
                        href={notification.href}
                        className="group flex gap-3 rounded-[8px] px-2 py-2.5 text-left transition hover:bg-white/[0.06]"
                        onClick={() => openNotification(notification)}
                      >
                        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[8px]", notification.status === "done" ? "bg-emerald-400/12 text-emerald-200" : "bg-red-400/12 text-red-200")}>
                          {notification.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={cn("font-semibold", notification.read ? "text-slate-200" : "text-white")}>{notification.title}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:text-slate-300" />
                          </span>
                          <span className="mt-1 block leading-5 text-slate-400">{notification.body}</span>
                          <span className="mt-1.5 block text-xs text-slate-600">{formatTime(notification.createdAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : !activeStatusData ? (
                  <div className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-8 text-center text-sm text-slate-500">
                    아직 알림이 없습니다.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>,
        document.body
      )
    : null;

  return (
    <div className="relative z-10">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-[8px] border border-transparent bg-transparent text-slate-400 shadow-none transition hover:border-transparent hover:bg-transparent hover:text-white",
          unreadCount && "text-violet-100",
          activeStatusData && "text-cyan-100"
        )}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={toggleOpen}
      >
        {activeStatusData ? (
          <>
            <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10" />
            <span className="absolute bottom-0 left-0 h-[2px] bg-cyan-200 transition-all duration-500" style={{ width: `${activeProgress}%` }} />
          </>
        ) : null}
        <Bell className="h-4 w-4" />
        {activeStatusData ? <Loader2 className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 animate-spin rounded-full bg-black/80 p-0.5 text-cyan-200" /> : null}
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-400 px-1 text-[10px] font-black leading-none text-white shadow-[0_0_0_2px_rgba(0,0,0,0.65)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {notificationLayer}
    </div>
  );
}
