"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ExternalLink, X } from "lucide-react";

import {
  BATCH_NOTIFICATION_EVENT,
  BatchNotification,
  clearBatchNotifications,
  markBatchNotificationsRead,
  readBatchNotifications,
} from "@/lib/batch-notifications";
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

export function HeaderNotifications() {
  const [notifications, setNotifications] = useState<BatchNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<BatchNotification | null>(null);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  useEffect(() => {
    setNotifications(readBatchNotifications());

    function handleChange(event: Event) {
      const detail = (event as CustomEvent<BatchNotification | null>).detail;
      setNotifications(readBatchNotifications());
      if (detail) setToast(detail);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key) setNotifications(readBatchNotifications());
    }

    window.addEventListener(BATCH_NOTIFICATION_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(BATCH_NOTIFICATION_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.045] text-slate-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white",
          unreadCount && "border-violet-300/30 bg-violet-400/10 text-violet-100"
        )}
        aria-label={unreadCount ? `새 알림 ${unreadCount}개` : "알림"}
        title="알림"
        onClick={toggleOpen}
      >
        <Bell className="h-4 w-4" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-400 px-1 text-[10px] font-black leading-none text-white shadow-[0_0_0_2px_rgba(0,0,0,0.65)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {toast && !open ? (
        <Link
          href={toast.href}
          className="absolute right-0 top-11 z-50 w-[min(84vw,340px)] rounded-[10px] border border-white/10 bg-[#090b12] p-3 text-sm text-white shadow-[0_24px_70px_rgba(0,0,0,0.46)] ring-1 ring-violet-300/10"
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
        <div className="absolute right-0 z-50 mt-2 w-[min(88vw,360px)] rounded-[10px] border border-white/10 bg-[#090b12] p-2 text-sm shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div>
              <div className="font-bold text-white">알림</div>
              <div className="text-xs text-slate-500">추출 완료와 실패 상태를 알려드립니다.</div>
            </div>
            {notifications.length ? (
              <button type="button" className="rounded-[7px] p-1 text-slate-500 hover:bg-white/[0.07] hover:text-white" aria-label="알림 비우기" onClick={clearAll}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-1 max-h-[360px] overflow-y-auto [scrollbar-color:#2f3543_transparent] [scrollbar-width:thin]">
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
            ) : (
              <div className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-8 text-center text-sm text-slate-500">
                아직 알림이 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
