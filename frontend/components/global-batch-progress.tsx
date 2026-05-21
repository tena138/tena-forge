"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BatchStatus } from "@/lib/api";
import {
  ACTIVE_BATCH_EVENT,
  BatchStatusResponse,
  fetchBatchStatus,
  forgetActiveBatch,
  formatRemaining,
  friendlyProgressMessage,
  readActiveBatch,
  shouldForgetActiveBatchAfterStatusError
} from "@/lib/batch-progress";
import { addBatchStatusNotification } from "@/lib/batch-notifications";

export function GlobalBatchProgress() {
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

    async function poll() {
      try {
        const data = await fetchBatchStatus(activeBatchId);
        if (cancelled) return;
        if (data.status === "done" || data.status === "error") {
          addBatchStatusNotification(data);
          forgetActiveBatch(activeBatchId);
          setBatchId(null);
          setStatusData(null);
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
          return;
        }
        if (!cancelled) setStatusData(null);
      }
    }

    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [batchId, pollVersion]);

  const isActiveStatus = statusData?.status === "pending" || statusData?.status === "processing";
  if (!batchId || !statusData || !isActiveStatus) return null;

  const progress = statusData.progress_percent ?? 0;
  const message = friendlyProgressMessage(statusData.status as BatchStatus, statusData.progress_message);

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(92vw,420px)] rounded-lg border bg-card/95 p-4 shadow-[0_18px_45px_rgba(37,20,76,0.18)] backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {message}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {statusData.progress_message}
          </p>
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{formatRemaining(statusData.estimated_seconds_remaining)}</span>
        <div className="flex items-center gap-2">
          <Link href="/archive/new">
            <Button size="sm" variant="outline">상태 보기</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
