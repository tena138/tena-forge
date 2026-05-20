import { API_URL } from "@/lib/api";

export function localWorkerLaunchUrl(batchId?: string | null) {
  const url = new URL("tenaforge://worker/start");
  url.searchParams.set("api_url", API_URL);
  if (batchId) url.searchParams.set("batch_id", batchId);
  return url.toString();
}

export function launchLocalWorker(batchId?: string | null) {
  if (typeof window === "undefined") return;
  window.location.href = localWorkerLaunchUrl(batchId);
}
