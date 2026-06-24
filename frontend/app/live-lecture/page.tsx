"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  Mic,
  MonitorUp,
  Pause,
  Play,
  ScreenShare,
  ScreenShareOff,
  Square,
  Video,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import { LiveInteractionEvent, listUpcomingLiveInteractions } from "@/lib/auth-api";
import { cn } from "@/lib/utils";

type RecordingMode = "audio" | "video";
type RecordingState = "idle" | "recording" | "paused";

type SlidePdf = {
  url: string;
  name: string;
  size: number;
};

type PdfPageSize = {
  width: number;
  height: number;
};

type SharedLectureState = {
  eventId: string;
  classId: string;
  title: string;
  className: string;
  slidePdf: SlidePdf | null;
  pageNumber: number;
  updatedAt: number;
};

type PdfSlideViewerProps = {
  slidePdf: SlidePdf | null;
  pageNumber?: number;
  className?: string;
  shared?: boolean;
  dragging?: boolean;
  onUpload?: () => void;
  onDropFile?: (file: File) => void;
  onPageChange?: (pageNumber: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
};

const DEFAULT_SLIDE_SIZE: PdfPageSize = { width: 16, height: 9 };
let pdfWorkerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

function liveShareKey(eventId: string, classId: string) {
  return `tena-live-lecture-share:${eventId || "manual"}:${classId || "all"}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function timeText(date: Date | null) {
  if (!date) return "--:--";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function fileSizeText(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function minuteTickStep(totalMinutes: number) {
  if (totalMinutes <= 30) return 5;
  if (totalMinutes <= 60) return 10;
  if (totalMinutes <= 120) return 15;
  if (totalMinutes <= 240) return 30;
  return 60;
}

function buildMinuteTicks(totalMinutes: number) {
  const durationMinutes = Math.max(1, Math.round(totalMinutes));
  const step = minuteTickStep(durationMinutes);
  const ticks: number[] = [];
  for (let minute = 0; minute < durationMinutes; minute += step) {
    ticks.push(minute);
  }
  if (ticks[ticks.length - 1] !== durationMinutes) ticks.push(durationMinutes);
  return ticks;
}

function fileNameForRecording(mode: RecordingMode) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `tena-live-${mode}-${stamp}.${mode === "audio" ? "webm" : "webm"}`;
}

function slideShareUrl(eventId: string, classId: string) {
  const params = new URLSearchParams();
  params.set("share", "1");
  if (eventId) params.set("eventId", eventId);
  if (classId) params.set("classId", classId);
  return `/live-lecture?${params.toString()}`;
}

function useLectureEvent(eventId: string | null) {
  const [events, setEvents] = useState<LiveInteractionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listUpcomingLiveInteractions();
        if (!cancelled) setEvents(data.events || []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return {
    loading,
    event: eventId ? events.find((item) => item.id === eventId) || null : events[0] || null,
  };
}

function LectureTimeline({ event, now }: { event: LiveInteractionEvent | null; now: number }) {
  const fallbackStart = useMemo(() => new Date(now), []);
  const startsAt = parseDate(event?.starts_at) || fallbackStart;
  const endsAt = parseDate(event?.ends_at) || new Date(startsAt.getTime() + 60 * 60000);
  const totalMs = Math.max(1, endsAt.getTime() - startsAt.getTime());
  const elapsedMs = Math.max(0, Math.min(totalMs, now - startsAt.getTime()));
  const progressRatio = Math.max(0, Math.min(1, elapsedMs / totalMs));
  const progress = Math.round(progressRatio * 100);
  const progressPercent = progressRatio * 100;
  const lectureDurationMinutes = Math.max(1, Math.round(totalMs / 60000));
  const elapsedMinutes = Math.max(0, Math.min(lectureDurationMinutes, Math.floor(elapsedMs / 60000)));
  const ticks = useMemo(() => buildMinuteTicks(lectureDurationMinutes), [lectureDurationMinutes]);

  return (
    <section className="rounded-[8px] bg-white p-4 ring-1 ring-black/5">
      <div className="relative h-24 overflow-hidden rounded-[8px] bg-zinc-100 ring-1 ring-black/5">
        <div className="absolute inset-y-0 left-0 bg-black transition-[width] duration-700" style={{ width: `${progressPercent}%` }} />
        <div className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black text-zinc-950 shadow-sm">
          {elapsedMinutes}분 진행 · {progress}%
        </div>
        {ticks.map((minute) => {
          const left = (minute / lectureDurationMinutes) * 100;
          const passed = left <= progressPercent + 0.5;
          const labelAlign = minute === 0 ? "translate-x-0" : minute === lectureDurationMinutes ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <div key={minute} className="absolute top-0 z-10 h-full" style={{ left: `${left}%` }}>
              <span className={cn("absolute top-0 h-12 border-l", passed ? "border-white/75" : "border-zinc-500/55")} />
              <span className={cn("absolute bottom-3 whitespace-nowrap text-[10px] font-black", labelAlign, passed ? "text-white" : "text-zinc-600")}>{minute}분</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-zinc-500">
        <span>수업 시작 {timeText(startsAt)}</span>
        <span>캘린더 기준 {lectureDurationMinutes}분</span>
        <span>수업 종료 {timeText(endsAt)}</span>
      </div>
    </section>
  );
}

function PdfSlideViewer({ slidePdf, pageNumber = 1, className, shared = false, dragging = false, onUpload, onDropFile, onPageChange, onDragStateChange }: PdfSlideViewerProps) {
  const canDrop = Boolean(onDropFile);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSize, setPageSize] = useState<PdfPageSize>(DEFAULT_SLIDE_SIZE);
  const [frameSize, setFrameSize] = useState<PdfPageSize>({ width: 0, height: 0 });
  const [renderState, setRenderState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const activePage = Math.max(1, pageNumber);
  const slideAspectRatio = `${pageSize.width} / ${pageSize.height}`;
  const slideAspectValue = pageSize.width / Math.max(1, pageSize.height);
  const showPageControls = Boolean(slidePdf && !shared);
  const slideFrameStyle = slidePdf
    ? shared
      ? { aspectRatio: slideAspectRatio }
      : {
          aspectRatio: slideAspectRatio,
          width: `min(100%, calc((100dvh - 16rem) * ${slideAspectValue}))`,
          maxHeight: "calc(100dvh - 16rem)",
        }
    : undefined;

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { promise: Promise<PDFDocumentProxy>; destroy(): Promise<void> } | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;

    setPdfDocument((current) => {
      if (current) void current.cleanup();
      return null;
    });
    setPageCount(0);
    setPageSize(DEFAULT_SLIDE_SIZE);
    setRenderState(slidePdf ? "loading" : "idle");

    if (!slidePdf) return undefined;
    const slidePdfUrl = slidePdf.url;

    async function loadDocument() {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ url: slidePdfUrl });
        loadedDocument = await loadingTask.promise;
        if (cancelled) {
          void loadedDocument.cleanup();
          return;
        }
        setPageCount(loadedDocument.numPages);
        setPdfDocument(loadedDocument);
      } catch {
        if (!cancelled) setRenderState("error");
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
      if (loadedDocument) void loadedDocument.cleanup();
    };
  }, [slidePdf?.url]);

  useEffect(() => {
    if (!slidePdf) return undefined;
    const frame = frameRef.current;
    if (!frame) return undefined;

    const syncFrameSize = (width: number, height: number) => {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      setFrameSize((current) => (current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }));
    };

    syncFrameSize(frame.clientWidth, frame.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      syncFrameSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [slidePdf, shared, slideAspectRatio]);

  useEffect(() => {
    if (!pdfDocument || !slidePdf) return undefined;
    const documentProxy = pdfDocument;
    const safePage = Math.min(Math.max(1, activePage), Math.max(1, documentProxy.numPages));
    if (safePage !== activePage) {
      onPageChange?.(safePage);
      return undefined;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setRenderState("loading");

    async function renderPage() {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const page = await documentProxy.getPage(safePage);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const hasFrameSize = frameSize.width > 1 && frameSize.height > 1;
        const cssScale = hasFrameSize
          ? Math.max(0.1, Math.min(frameSize.width / Math.max(1, baseViewport.width), frameSize.height / Math.max(1, baseViewport.height)))
          : Math.min(2.4, Math.max(1.2, 1200 / Math.max(1, baseViewport.width)));
        const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
        const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
        const cssWidth = baseViewport.width * cssScale;
        const cssHeight = baseViewport.height * cssScale;

        setPageSize({ width: baseViewport.width, height: baseViewport.height });
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(cssWidth)}px`;
        canvas.style.height = `${Math.floor(cssHeight)}px`;

        renderTask = page.render({ canvas, viewport: renderViewport });
        await renderTask.promise;
        if (!cancelled) setRenderState("ready");
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setRenderState("error");
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [activePage, frameSize.height, frameSize.width, onPageChange, pdfDocument, slidePdf]);

  function movePage(delta: number) {
    if (!pageCount) return;
    onPageChange?.(Math.min(pageCount, Math.max(1, activePage + delta)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!showPageControls) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      movePage(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      movePage(1);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canDrop) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    onDragStateChange?.(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!canDrop) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    onDragStateChange?.(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!canDrop) return;
    event.preventDefault();
    event.stopPropagation();
    onDragStateChange?.(false);
    const files = Array.from(event.dataTransfer.files || []);
    const file = files.find(isPdfFile) || files[0];
    if (file) onDropFile?.(file);
  }

  return (
    <div
      className={cn(
        "relative flex w-full shrink-0 overflow-hidden rounded-[8px] bg-white text-zinc-950 ring-1 ring-black/5",
        slidePdf ? "min-h-0 shadow-[0_18px_55px_rgba(0,0,0,0.08)]" : "min-h-[28rem]",
        slidePdf && !shared && "mx-auto",
        shared && "h-screen w-screen",
        dragging && "ring-2 ring-black",
        className
      )}
      style={slideFrameStyle}
      tabIndex={showPageControls ? 0 : undefined}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
    >
      {slidePdf ? (
        <div ref={frameRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-zinc-950">
          <canvas ref={canvasRef} className="block max-h-full max-w-full bg-white object-contain" />
          {renderState === "loading" ? (
            <div className="absolute inset-0 grid place-items-center bg-white/78 text-sm font-black text-zinc-800">
              슬라이드 렌더링 중
            </div>
          ) : null}
          {renderState === "error" ? (
            <button type="button" onClick={onUpload} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-50 text-sm font-black text-zinc-900">
              PDF를 표시하지 못했습니다.
              <span className="text-xs text-zinc-500">다른 PDF를 선택하세요.</span>
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={onUpload} className="flex min-h-[inherit] w-full flex-col items-center justify-center gap-3 bg-zinc-50 px-6 text-center transition hover:bg-zinc-100">
          <span className="grid h-14 w-14 place-items-center rounded-[8px] bg-black text-white">
            <FileUp className="h-6 w-6" />
          </span>
          <span className={cn("font-black text-zinc-950", shared ? "text-3xl" : "text-xl")}>PDF 슬라이드</span>
          <span className="max-w-md text-sm font-semibold leading-6 text-zinc-500">{shared ? "발표자 화면에서 PDF를 올리면 표시됩니다." : "수업에 사용할 PDF를 선택하세요."}</span>
        </button>
      )}
      {showPageControls ? (
        <>
          <button
            type="button"
            onClick={() => movePage(-1)}
            disabled={activePage <= 1}
            className="absolute inset-y-0 left-0 z-20 grid w-20 place-items-center bg-gradient-to-r from-black/20 to-transparent text-white transition hover:from-black/32 disabled:pointer-events-none disabled:opacity-0"
            aria-label="이전 슬라이드"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/82 shadow-[0_16px_36px_rgba(0,0,0,0.26)]">
              <ChevronLeft className="h-5 w-5" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => movePage(1)}
            disabled={!pageCount || activePage >= pageCount}
            className="absolute inset-y-0 right-0 z-20 grid w-20 place-items-center bg-gradient-to-l from-black/20 to-transparent text-white transition hover:from-black/32 disabled:pointer-events-none disabled:opacity-0"
            aria-label="다음 슬라이드"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/82 shadow-[0_16px_36px_rgba(0,0,0,0.26)]">
              <ChevronRight className="h-5 w-5" />
            </span>
          </button>
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/86 px-3 py-1 text-xs font-black text-white shadow-[0_14px_35px_rgba(0,0,0,0.18)]">
            {activePage} / {pageCount || "..."}
          </div>
        </>
      ) : null}
      {canDrop ? (
        <div className={cn("pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white/0 opacity-0 transition", dragging && "pointer-events-auto bg-white/88 opacity-100")}>
          <div className="rounded-[8px] bg-black px-5 py-3 text-sm font-black text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            PDF를 여기에 놓기
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShareOnlyView({ eventId, classId }: { eventId: string; classId: string }) {
  const storageKey = liveShareKey(eventId, classId);
  const [state, setState] = useState<SharedLectureState | null>(null);

  useEffect(() => {
    function read() {
      try {
        const raw = window.localStorage.getItem(storageKey);
        setState(raw ? (JSON.parse(raw) as SharedLectureState) : null);
      } catch {
        setState(null);
      }
    }
    read();
    const timer = window.setInterval(read, 1000);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) read();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, [storageKey]);

  return (
    <main className="min-h-screen bg-black">
      <PdfSlideViewer slidePdf={state?.slidePdf || null} pageNumber={state?.pageNumber || 1} shared className="min-h-screen rounded-none ring-0" />
    </main>
  );
}

function LiveLectureContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") || "";
  const classId = searchParams.get("classId") || "";
  const shareOnly = searchParams.get("share") === "1";
  const { event } = useLectureEvent(eventId || null);
  const [now, setNow] = useState(() => Date.now());
  const [slidePdf, setSlidePdf] = useState<SlidePdf | null>(null);
  const [notes, setNotes] = useState("수업 시작 전 출석 확인\n핵심 개념 설명 후 대표 문항 풀이\n마지막 5분 질문 정리");
  const [sharing, setSharing] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("audio");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingName, setRecordingName] = useState("");
  const [slidePage, setSlidePage] = useState(1);
  const [slideDragActive, setSlideDragActive] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const slidePdfInputRef = useRef<HTMLInputElement | null>(null);

  const sessionTitle = event?.title || "즉시 강의";
  const sessionClassName = event?.class_name || "클래스 선택 없음";
  const storageKey = liveShareKey(eventId, classId);
  const shareUrl = slideShareUrl(eventId, classId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sharing) return;
    const payload: SharedLectureState = {
      eventId,
      classId,
      title: sessionTitle,
      className: sessionClassName,
      slidePdf,
      pageNumber: slidePage,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [classId, eventId, sessionClassName, sessionTitle, sharing, slidePage, slidePdf, storageKey]);

  useEffect(() => {
    return () => {
      if (slidePdf?.url) URL.revokeObjectURL(slidePdf.url);
    };
  }, [slidePdf?.url]);

  useEffect(() => {
    if (!shareOnly) return;
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [shareOnly]);

  if (shareOnly) {
    return <ShareOnlyView eventId={eventId} classId={classId} />;
  }

  async function startRecording(mode: RecordingMode) {
    if (recordingState !== "idle") return;
    try {
      const stream = mode === "audio"
        ? await navigator.mediaDevices.getUserMedia({ audio: true })
        : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      chunksRef.current = [];
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        setRecordingName(fileNameForRecording(mode));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
      };
      setRecordingMode(mode);
      setRecordingState("recording");
      recorder.start();
    } catch {
      setRecordingState("idle");
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recordingState === "idle") return;
    recorderRef.current.stop();
    setRecordingState("idle");
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recordingState === "recording") {
      recorder.pause();
      setRecordingState("paused");
      return;
    }
    if (recordingState === "paused") {
      recorder.resume();
      setRecordingState("recording");
    }
  }

  async function startSharing() {
    setSharing(true);
    const payload: SharedLectureState = {
      eventId,
      classId,
      title: sessionTitle,
      className: sessionClassName,
      slidePdf,
      pageNumber: slidePage,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    window.open(shareUrl, "tena-live-slide-share", "noopener,noreferrer");
  }

  async function copyShareUrl() {
    const absoluteUrl = `${window.location.origin}${shareUrl}`;
    await navigator.clipboard?.writeText(absoluteUrl);
  }

  function applySlidePdfFile(file: File) {
    if (!isPdfFile(file)) {
      window.alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    const url = URL.createObjectURL(file);
    setSlidePdf((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { url, name: file.name, size: file.size };
    });
    setSlidePage(1);
  }

  function handleSlidePdfInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    applySlidePdfFile(file);
  }

  return (
    <div className="space-y-4">
      <LectureTimeline event={event} now={now} />

      {sharing ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-black px-4 py-3 text-white">
          <div className="flex items-center gap-2 text-sm font-black">
            <ScreenShare className="h-4 w-4" />
            슬라이드 공유 중입니다. 2차 화면에는 슬라이드만 표시됩니다.
          </div>
          <button type="button" onClick={() => setSharing(false)} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-white px-3 text-xs font-black text-black">
            <ScreenShareOff className="h-3.5 w-3.5" />
            공유 종료
          </button>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(20rem,0.65fr)]">
        <div className="min-w-0 space-y-3">
          <PdfSlideViewer
            slidePdf={slidePdf}
            pageNumber={slidePage}
            dragging={slideDragActive}
            onUpload={() => slidePdfInputRef.current?.click()}
            onDropFile={applySlidePdfFile}
            onPageChange={setSlidePage}
            onDragStateChange={setSlideDragActive}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-white p-2 ring-1 ring-black/5">
            <input ref={slidePdfInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleSlidePdfInput} />
            <div className="min-w-0">
              <div className="text-xs font-black text-zinc-500">슬라이드 PDF</div>
              <div className="mt-0.5 truncate text-sm font-bold text-zinc-950">
                {slidePdf ? `${slidePdf.name}${fileSizeText(slidePdf.size) ? ` · ${fileSizeText(slidePdf.size)}` : ""}` : "선택된 PDF 없음"}
              </div>
            </div>
            <button type="button" onClick={() => slidePdfInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800">
              <FileUp className="h-3.5 w-3.5" />
              PDF 업로드
            </button>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <div className="rounded-[8px] bg-white p-4 ring-1 ring-black/5">
            <div className="text-sm font-black text-zinc-950">발표자 메모</div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-3 min-h-[18rem] w-full resize-none rounded-[8px] bg-zinc-100 p-3 text-sm font-medium leading-6 text-zinc-800 outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
        </aside>
      </section>

      <section className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-white/95 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/10 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => startRecording("audio")} disabled={recordingState !== "idle"} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300">
            <Mic className="h-4 w-4" />
            녹음 시작
          </button>
          <button type="button" onClick={() => startRecording("video")} disabled={recordingState !== "idle"} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300">
            <Video className="h-4 w-4" />
            녹화 시작
          </button>
          <button type="button" onClick={togglePause} disabled={recordingState === "idle"} className="grid h-10 w-10 place-items-center rounded-[8px] bg-zinc-100 text-zinc-800 transition hover:bg-zinc-200 disabled:text-zinc-300">
            {recordingState === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button type="button" onClick={stopRecording} disabled={recordingState === "idle"} className="grid h-10 w-10 place-items-center rounded-[8px] bg-zinc-100 text-zinc-800 transition hover:bg-zinc-200 disabled:text-zinc-300">
            <Square className="h-4 w-4" />
          </button>
          <div className="text-xs font-bold text-zinc-500">
            {recordingState === "idle" ? "녹음/녹화 대기" : `${recordingMode === "audio" ? "녹음" : "녹화"} ${recordingState === "paused" ? "일시정지" : "진행 중"}`}
          </div>
          {recordingUrl ? (
            <a href={recordingUrl} download={recordingName} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-zinc-100 px-3 text-xs font-black text-zinc-800 transition hover:bg-zinc-200">
              <Download className="h-4 w-4" />
              저장
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyShareUrl} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-zinc-100 px-3 text-xs font-black text-zinc-800 transition hover:bg-zinc-200">
            <Copy className="h-4 w-4" />
            공유 URL
          </button>
          <button
            type="button"
            onClick={startSharing}
            disabled={!slidePdf}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-black px-3 text-xs font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500"
          >
            <MonitorUp className="h-4 w-4" />
            슬라이드 공유
          </button>
        </div>
      </section>
    </div>
  );
}

export default function LiveLecturePage() {
  return (
    <Suspense fallback={<div className="text-sm font-semibold text-zinc-500">실시간 강의 세션을 여는 중입니다...</div>}>
      <LiveLectureContent />
    </Suspense>
  );
}
