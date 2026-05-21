import { API_URL } from "@/lib/api";

type LaunchLocalWorkerOptions = {
  fallbackDelayMs?: number;
  onPossiblyBlocked?: (url: string) => void;
};

export function localWorkerLaunchUrl(batchId?: string | null) {
  const url = new URL("tenaforge://worker/start");
  url.searchParams.set("api_url", API_URL);
  if (batchId) url.searchParams.set("batch_id", batchId);
  return url.toString();
}

export function localWorkerProtocolSetupCommand() {
  return String.raw`tools\register_local_worker_protocol_windows.cmd`;
}

export function localWorkerManualCommand(batchId?: string | null) {
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\tools\\start_local_worker_windows.ps1" -ProtocolUrl "${localWorkerLaunchUrl(batchId).replace(/"/g, '\\"')}"`;
}

export function launchLocalWorker(batchId?: string | null, options: LaunchLocalWorkerOptions = {}) {
  const url = localWorkerLaunchUrl(batchId);
  if (typeof window === "undefined" || typeof document === "undefined") return url;

  let handoffLikelyStarted = false;
  const markStarted = () => {
    handoffLikelyStarted = true;
  };
  const cleanup = () => {
    window.removeEventListener("blur", markStarted);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
  function handleVisibilityChange() {
    if (document.hidden) markStarted();
  }

  window.addEventListener("blur", markStarted, { once: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    cleanup();
    if (!handoffLikelyStarted && !document.hidden) {
      options.onPossiblyBlocked?.(url);
    }
  }, options.fallbackDelayMs ?? 1400);

  return url;
}
