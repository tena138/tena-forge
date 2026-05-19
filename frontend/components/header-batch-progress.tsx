"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { BatchStatus } from "@/lib/api";
import {
  ACTIVE_BATCH_EVENT,
  BatchStatusResponse,
  fetchBatchStatus,
  forgetActiveBatch,
  formatRemaining,
  friendlyProgressMessage,
  readActiveBatch,
  shouldForgetActiveBatchAfterStatusError,
} from "@/lib/batch-progress";
import { addBatchStatusNotification } from "@/lib/batch-notifications";

export function HeaderBatchProgress() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<BatchStatusResponse | null>(null);
  const [pollVersion, setPollVersion] = useState(0);

  useEffect(() => {
    setBatchId(readActiveBatch());

    function handleChange(event: Event) {
      const customEvent = event as CustomEvent<string>;
      setStatusData(null);
      setBatchId(customEvent.detail || readActiveBatch());
      setPollVersion((value) => value + 1);
    }

    window.addEventListener(ACTIVE_BATCH_EVENT, handleChange);
    return () => window.removeEventListener(ACTIVE_BATCH_EVENT, handleChange);
  }, []);

  useEffect(() => {
    if (!batchId) return;
    const activeBatchId = batchId;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const data = await fetchBatchStatus(activeBatchId);
        if (cancelled) return;
        if (data.status === "done" || data.status === "error") {
          addBatchStatusNotification(data);
          forgetActiveBatch(activeBatchId);
          setBatchId(null);
          setStatusData(null);
          if (timer) window.clearInterval(timer);
          return;
        }
        setStatusData(data);
      } catch (error) {
        if (shouldForgetActiveBatchAfterStatusError(error)) {
          forgetActiveBatch(activeBatchId);
          if (!cancelled) {
            setBatchId(null);
            setStatusData(null);
          }
          if (timer) window.clearInterval(timer);
        }
      }
    }

    poll();
    timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [batchId, pollVersion]);

  const isActiveStatus = statusData?.status === "pending" || statusData?.status === "processing";
  if (!batchId || !statusData || !isActiveStatus) return null;

  const progress = statusData.progress_percent ?? 0;
  const message = friendlyProgressMessage(statusData.status as BatchStatus, statusData.progress_message);

  return (
    <Link
      href="/archive/new"
      title={`${message} · ${progress}% · ${formatRemaining(statusData.estimated_seconds_remaining)}`}
      className="group relative flex h-9 max-w-[92px] items-center gap-1.5 overflow-hidden rounded-[9px] bg-violet-400/12 px-2 text-xs font-semibold text-violet-50 shadow-[0_10px_28px_rgba(109,40,217,0.18)] ring-1 ring-violet-300/20 transition hover:bg-violet-400/18 hover:ring-violet-200/35 sm:max-w-[280px] sm:gap-2 sm:px-3"
      aria-label={`추출 진행 상황 ${progress}%`}
    >
      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10" />
      <span className="absolute bottom-0 left-0 h-[2px] bg-violet-300 transition-all duration-500" style={{ width: `${progress}%` }} />
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-200" />
      <span className="hidden truncate lg:inline">{message}</span>
      <span className="hidden truncate sm:inline lg:hidden">추출 중</span>
      <span className="shrink-0 text-violet-200">{progress}%</span>
    </Link>
  );
}
