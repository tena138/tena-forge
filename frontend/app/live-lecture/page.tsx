"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  Copy,
  Download,
  FileUp,
  Loader2,
  Mic,
  MonitorUp,
  Pause,
  Play,
  Plus,
  Save,
  ScreenShare,
  ScreenShareOff,
  Square,
  TrendingUp,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import {
  getLiveLectureSession,
  listUpcomingLiveInteractions,
  saveLiveLectureSession,
  type LiveInteractionEvent,
  type LiveLectureSession,
  type LiveLessonPlanItem,
  uploadLiveLectureSlide,
} from "@/lib/auth-api";
import { api, assetUrl, type Batch, type ProblemSetListItem } from "@/lib/api";
import { formatLocalTime } from "@/lib/datetime";
import { createPaperSession, getClassDetail, getPaperSessionDetail, type ClassCard, type PaperSessionDetail, type StudentCard } from "@/lib/studentManagement";
import { cn } from "@/lib/utils";

type RecordingMode = "audio" | "video";
type RecordingState = "idle" | "recording" | "paused";

type SlidePdf = {
  url: string;
  name: string;
  size: number;
};

type LecturePageNotes = Record<string, string>;

type LessonPlanKind = LiveLessonPlanItem["kind"];

type LessonPlanDraft = {
  id?: string;
  title: string;
  kind: LessonPlanKind;
  startMinute: string;
  durationMinutes: string;
  paperSessionId?: string | null;
  testSourceKey: string;
};

type TestSource = {
  type: "batch" | "problem_set";
  id: string;
};

const LEGACY_DEFAULT_LIVE_NOTES = "수업 시작 전 출석 확인\n핵심 개념 설명 후 대표 문항 풀이\n마지막 5분 질문 정리";

const LESSON_KIND_LABELS: Record<LessonPlanKind, string> = {
  lesson: "수업",
  break: "쉬는 시간",
  test: "테스트",
};

const LESSON_KIND_STYLES: Record<LessonPlanKind, string> = {
  lesson: "bg-zinc-950 text-white ring-zinc-950",
  break: "bg-zinc-200 text-zinc-950 ring-zinc-300",
  test: "bg-sky-600 text-white ring-sky-700",
};

const LESSON_KIND_ICONS: Record<LessonPlanKind, LucideIcon> = {
  lesson: BookOpen,
  break: Coffee,
  test: ClipboardList,
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

function eventDurationMinutes(event: LiveInteractionEvent | null, fallbackNow = Date.now()) {
  const startsAt = parseDate(event?.starts_at) || new Date(fallbackNow);
  const endsAt = parseDate(event?.ends_at) || new Date(startsAt.getTime() + 60 * 60000);
  return Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
}

function eventMinuteDate(event: LiveInteractionEvent | null, minute: number) {
  const startsAt = parseDate(event?.starts_at);
  if (!startsAt) return null;
  return new Date(startsAt.getTime() + minute * 60000);
}

function planTimeRangeText(item: LiveLessonPlanItem) {
  return `${item.start_minute}분 - ${item.start_minute + item.duration_minutes}분`;
}

function normalizeLessonPlanItems(items?: LiveLessonPlanItem[] | null): LiveLessonPlanItem[] {
  if (!Array.isArray(items)) return [];
  const normalized: LiveLessonPlanItem[] = [];
  for (const item of items) {
    const kind: LessonPlanKind = item.kind === "break" || item.kind === "test" ? item.kind : "lesson";
    const startMinute = Number(item.start_minute);
    const durationMinutes = Number(item.duration_minutes);
    if (!Number.isFinite(startMinute) || !Number.isFinite(durationMinutes) || durationMinutes < 1) continue;
    normalized.push({
      id: item.id || newLessonPlanId(),
      title: String(item.title || LESSON_KIND_LABELS[kind]).trim() || LESSON_KIND_LABELS[kind],
      kind,
      start_minute: Math.max(0, Math.round(startMinute)),
      duration_minutes: Math.max(1, Math.round(durationMinutes)),
      paper_session_id: item.paper_session_id || null,
    });
  }
  return normalized.sort((left, right) => left.start_minute - right.start_minute || left.title.localeCompare(right.title));
}

function newLessonPlanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseTestSourceKey(value: string): TestSource | null {
  const [type, id] = value.split(":");
  if ((type === "batch" || type === "problem_set") && id) return { type, id };
  return null;
}

function normalizeListResponse<T>(value: T[] | { items?: T[]; data?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const response = value as { items?: T[]; data?: T[] };
    if (Array.isArray(response.items)) return response.items;
    if (Array.isArray(response.data)) return response.data;
  }
  return [];
}

function timeText(date: Date | null) {
  return formatLocalTime(date, "--:--");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isBlobUrl(value?: string | null) {
  return Boolean(value && value.startsWith("blob:"));
}

function normalizeLectureNotes(value?: string | null) {
  const text = value || "";
  return text.trim() === LEGACY_DEFAULT_LIVE_NOTES.trim() ? "" : text;
}

function normalizeLecturePageNotes(value?: Record<string, string> | null, legacyNotes?: string | null): LecturePageNotes {
  const normalized: LecturePageNotes = {};
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([rawPage, rawNote]) => {
      const page = Number(rawPage);
      if (!Number.isInteger(page) || page < 1) return;
      const note = normalizeLectureNotes(String(rawNote || ""));
      if (note.trim()) normalized[String(page)] = note;
    });
    return normalized;
  }
  const legacy = normalizeLectureNotes(legacyNotes);
  return legacy.trim() ? { "1": legacy } : normalized;
}

function lecturePageNotesEqual(a: LecturePageNotes, b: LecturePageNotes) {
  const aKeys = Object.keys(a).sort((left, right) => Number(left) - Number(right));
  const bKeys = Object.keys(b).sort((left, right) => Number(left) - Number(right));
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a[key] === b[key]);
}

function slidePdfFromSession(session: LiveLectureSession): SlidePdf | null {
  const slide = session.lecture.slide_pdf;
  if (!slide?.url) return null;
  return {
    url: assetUrl(slide.url),
    name: slide.name || "lecture.pdf",
    size: slide.size || 0,
  };
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

function LectureTimeline({
  event,
  now,
  lessonPlan,
  saving,
  onAdd,
  onEdit,
  onOpenTest,
}: {
  event: LiveInteractionEvent | null;
  now: number;
  lessonPlan: LiveLessonPlanItem[];
  saving: boolean;
  onAdd: () => void;
  onEdit: (item: LiveLessonPlanItem) => void;
  onOpenTest: (item: LiveLessonPlanItem) => void;
}) {
  const fallbackStart = useMemo(() => new Date(now), []);
  const startsAt = parseDate(event?.starts_at) || fallbackStart;
  const endsAt = parseDate(event?.ends_at) || new Date(startsAt.getTime() + 60 * 60000);
  const totalMs = Math.max(1, endsAt.getTime() - startsAt.getTime());
  const elapsedMs = Math.max(0, Math.min(totalMs, now - startsAt.getTime()));
  const progressRatio = Math.max(0, Math.min(1, elapsedMs / totalMs));
  const lectureDurationMinutes = Math.max(1, Math.round(totalMs / 60000));
  const ticks = useMemo(() => buildMinuteTicks(lectureDurationMinutes), [lectureDurationMinutes]);
  const timelineItems = lessonPlan.filter((item) => item.start_minute < lectureDurationMinutes);
  const trackTopPercent = 5;
  const trackHeightPercent = 90;
  const progressPercent = trackTopPercent + progressRatio * trackHeightPercent;

  return (
    <section className="rounded-[8px] bg-white p-3 ring-1 ring-black/5">
      <div className="relative h-[34rem] overflow-hidden rounded-[8px] bg-zinc-50 ring-1 ring-black/5">
        <button
          type="button"
          onClick={onAdd}
          className="absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-[8px] bg-black text-white shadow-sm transition hover:bg-zinc-800"
          aria-label="계획 추가"
          title="계획 추가"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="absolute bottom-[5%] left-5 top-[5%] w-px bg-zinc-300" />
        {timelineItems.map((item) => {
          const top = trackTopPercent + (item.start_minute / lectureDurationMinutes) * trackHeightPercent;
          const height = Math.max(6, (item.duration_minutes / lectureDurationMinutes) * trackHeightPercent);
          const Icon = LESSON_KIND_ICONS[item.kind] || BookOpen;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.kind === "test" ? onOpenTest(item) : onEdit(item))}
              className={cn(
                "absolute left-10 right-3 z-10 flex min-h-10 items-start gap-2 overflow-hidden rounded-[7px] px-2.5 py-2 text-left text-[11px] font-black shadow-sm ring-1 transition hover:brightness-95",
                LESSON_KIND_STYLES[item.kind]
              )}
              style={{ top: `${top}%`, height: `${height}%` }}
              title={`${item.title} · ${planTimeRangeText(item)}`}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{item.title}</span>
                <span className="mt-0.5 block text-[10px] opacity-70">{planTimeRangeText(item)}</span>
              </span>
            </button>
          );
        })}
        {ticks.map((minute) => {
          const top = trackTopPercent + (minute / lectureDurationMinutes) * trackHeightPercent;
          return (
            <div key={minute} className="absolute left-0 right-0 z-0" style={{ top: `${top}%` }}>
              <span className="absolute left-5 top-0 h-px w-3 bg-zinc-400/70" />
              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-600">{minute}분</span>
            </div>
          );
        })}
        <div
          className="absolute left-3 right-3 z-20 h-[3px] -translate-y-1/2 rounded-full bg-black shadow-[0_0_0_4px_rgba(0,0,0,0.08)] transition-[top] duration-700"
          style={{ top: `${progressPercent}%` }}
          aria-hidden="true"
        />
      </div>
      {saving ? (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] bg-zinc-50 px-3 py-2 text-xs font-black text-zinc-500 ring-1 ring-black/5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          저장 중
        </div>
      ) : null}
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

function LessonPlanEditorModal({
  draft,
  durationMinutes,
  batches,
  problemSets,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: LessonPlanDraft;
  durationMinutes: number;
  batches: Batch[];
  problemSets: ProblemSetListItem[];
  saving: boolean;
  error: string;
  onChange: (draft: LessonPlanDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const selectedKindIcon = LESSON_KIND_ICONS[draft.kind] || BookOpen;
  const SelectedIcon = selectedKindIcon;
  const doneBatches = batches.filter((batch) => batch.status === "done" && batch.problem_count > 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section className="w-full max-w-xl rounded-[8px] bg-white p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-zinc-100 text-zinc-950">
                <SelectedIcon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-black text-zinc-950">{draft.id ? "계획 수정" : "계획 추가"}</h2>
                <p className="mt-0.5 text-xs font-bold text-zinc-500">현재 수업 안에서만 저장됩니다.</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-[7px] text-zinc-500 hover:bg-zinc-100 hover:text-black" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-black text-zinc-600">제목</span>
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              placeholder="예: 1교시, 쉬는 시간, Preview test"
              className="mt-1 h-11 w-full rounded-[8px] bg-zinc-100 px-3 text-sm font-bold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>

          <div>
            <div className="text-xs font-black text-zinc-600">유형</div>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["lesson", "break", "test"] as LessonPlanKind[]).map((kind) => {
                const Icon = LESSON_KIND_ICONS[kind] || BookOpen;
                const active = draft.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => onChange({ ...draft, kind, title: draft.title || LESSON_KIND_LABELS[kind] })}
                    className={cn(
                      "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] text-xs font-black ring-1 transition",
                      active ? "bg-black text-white ring-black" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {LESSON_KIND_LABELS[kind]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-black text-zinc-600">시작 분</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, durationMinutes - 1)}
                value={draft.startMinute}
                onChange={(event) => onChange({ ...draft, startMinute: event.target.value })}
                className="mt-1 h-11 w-full rounded-[8px] bg-zinc-100 px-3 text-sm font-bold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black text-zinc-600">길이</span>
              <input
                type="number"
                min={1}
                max={durationMinutes}
                value={draft.durationMinutes}
                onChange={(event) => onChange({ ...draft, durationMinutes: event.target.value })}
                className="mt-1 h-11 w-full rounded-[8px] bg-zinc-100 px-3 text-sm font-bold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
              />
            </label>
          </div>

          {draft.kind === "test" ? (
            <label className="block">
              <span className="text-xs font-black text-zinc-600">테스트 자료</span>
              <select
                value={draft.testSourceKey}
                onChange={(event) => onChange({ ...draft, testSourceKey: event.target.value })}
                className="mt-1 h-11 w-full rounded-[8px] bg-zinc-100 px-3 text-sm font-bold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="">자료 선택</option>
                <optgroup label="추출 배치">
                  {doneBatches.map((batch) => (
                    <option key={batch.id} value={`batch:${batch.id}`}>
                      {batch.name} · {batch.problem_count}문항
                    </option>
                  ))}
                </optgroup>
                <optgroup label="문항 묶음">
                  {problemSets.filter((set) => set.item_count > 0).map((set) => (
                    <option key={set.id} value={`problem_set:${set.id}`}>
                      {set.name} · {set.item_count}문항
                    </option>
                  ))}
                </optgroup>
              </select>
              {draft.paperSessionId && !draft.testSourceKey ? (
                <p className="mt-1 text-xs font-bold text-zinc-500">이미 연결된 테스트가 있습니다. 새 자료를 선택하면 테스트 세션을 새로 만듭니다.</p>
              ) : null}
            </label>
          ) : null}

          {error ? <div className="rounded-[8px] bg-red-50 px-3 py-2 text-xs font-black text-red-600">{error}</div> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[8px] px-4 text-sm font-black text-zinc-700 hover:bg-zinc-100">
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-black px-4 text-sm font-black text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </button>
        </div>
      </section>
    </div>
  );
}

function TestResultModal({
  item,
  detail,
  loading,
  error,
  onClose,
}: {
  item: LiveLessonPlanItem;
  detail: PaperSessionDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const gradedStudents = detail?.students.filter((student) => student.result.status === "graded" && typeof student.result.score === "number") || [];
  const averageScore = gradedStudents.length
    ? Math.round(gradedStudents.reduce((sum, student) => sum + Number(student.result.score || 0), 0) / gradedStudents.length)
    : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-[8px] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.24)] ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[8px] bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700">
              <ClipboardList className="h-3.5 w-3.5" />
              테스트
            </div>
            <h2 className="mt-2 text-xl font-black text-zinc-950">{detail?.title || item.title}</h2>
            <p className="mt-1 text-xs font-bold text-zinc-500">{planTimeRangeText(item)}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-[7px] text-zinc-500 hover:bg-zinc-100 hover:text-black" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(86vh-5.5rem)] overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-[8px] bg-zinc-50 px-4 py-12 text-sm font-black text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              테스트 결과를 불러오는 중
            </div>
          ) : error ? (
            <div className="rounded-[8px] bg-red-50 px-4 py-3 text-sm font-black text-red-600">{error}</div>
          ) : detail ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[8px] bg-zinc-50 p-3">
                    <p className="text-[11px] font-black text-zinc-500">문항</p>
                    <p className="mt-1 text-xl font-black text-zinc-950">{detail.problem_count}</p>
                  </div>
                  <div className="rounded-[8px] bg-zinc-50 p-3">
                    <p className="text-[11px] font-black text-zinc-500">채점</p>
                    <p className="mt-1 text-xl font-black text-zinc-950">{detail.graded_count}/{detail.assigned_count}</p>
                  </div>
                  <div className="rounded-[8px] bg-zinc-50 p-3">
                    <p className="text-[11px] font-black text-zinc-500">평균</p>
                    <p className="mt-1 text-xl font-black text-zinc-950">{averageScore == null ? "-" : `${averageScore}점`}</p>
                  </div>
                </div>

                <section className="rounded-[8px] bg-zinc-50 p-3">
                  <h3 className="text-sm font-black text-zinc-950">문항 미리보기</h3>
                  <div className="mt-2 space-y-2">
                    {detail.problems.slice(0, 8).map((problem) => (
                      <article key={problem.problem_id} className="rounded-[8px] bg-white p-3 text-sm ring-1 ring-black/5">
                        <div className="mb-1 text-xs font-black text-zinc-500">문항 {problem.original_problem_number || problem.problem_number}</div>
                        <p className="line-clamp-3 whitespace-pre-wrap font-semibold leading-6 text-zinc-800">{problem.problem_text || "문항 텍스트 없음"}</p>
                      </article>
                    ))}
                    {detail.problems.length > 8 ? <p className="text-xs font-bold text-zinc-500">외 {detail.problems.length - 8}문항</p> : null}
                  </div>
                </section>
              </div>

              <section className="rounded-[8px] bg-zinc-50 p-3">
                <h3 className="text-sm font-black text-zinc-950">학생 결과</h3>
                <div className="mt-2 space-y-2">
                  {detail.students.map((student) => (
                    <article key={student.id || student.result.id} className="rounded-[8px] bg-white p-3 ring-1 ring-black/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-zinc-950">{student.name || "학생"}</p>
                          <p className="mt-1 text-xs font-bold text-zinc-500">{student.result.status === "graded" ? "채점 완료" : "채점 대기"}</p>
                        </div>
                        <span className="shrink-0 text-lg font-black text-zinc-950">{typeof student.result.score === "number" ? `${Math.round(student.result.score)}점` : "-"}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs font-black">
                        <div className="rounded-[7px] bg-zinc-50 py-2 text-zinc-700">정답 {student.result.correct_count}</div>
                        <div className="rounded-[7px] bg-zinc-50 py-2 text-zinc-700">오답 {student.result.wrong_count}</div>
                        <div className="rounded-[7px] bg-zinc-50 py-2 text-zinc-700">총 {student.result.total_count}</div>
                      </div>
                    </article>
                  ))}
                  {!detail.students.length ? <div className="rounded-[8px] bg-white p-4 text-sm font-bold text-zinc-500">아직 배정된 학생 결과가 없습니다.</div> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </section>
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

function scoreText(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}점`;
}

function topRecentScoreStudents(students: StudentCard[]) {
  return [...students]
    .sort((left, right) => {
      const rightScore = typeof right.recent_score === "number" ? right.recent_score : -1;
      const leftScore = typeof left.recent_score === "number" ? left.recent_score : -1;
      return rightScore - leftScore || left.name.localeCompare(right.name);
    })
    .slice(0, 5);
}

function ClassLearningSnapshot({ classId }: { classId: string }) {
  const [classDetail, setClassDetail] = useState<ClassCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!classId) {
      setClassDetail(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getClassDetail(classId)
      .then((detail) => {
        if (!cancelled) setClassDetail(detail);
      })
      .catch(() => {
        if (!cancelled) {
          setClassDetail(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const scoreStudents = useMemo(() => topRecentScoreStudents(classDetail?.students || []), [classDetail?.students]);
  const scoredStudentCount = (classDetail?.students || []).filter((student) => typeof student.recent_score === "number").length;

  return (
    <section className="rounded-[8px] bg-white p-4 ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-zinc-950">클래스 학습 현황</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">{classDetail?.name || "현재 강의 클래스"}</p>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-zinc-100 text-zinc-800">
          <TrendingUp className="h-4 w-4" />
        </div>
      </div>

      {loading ? (
        <div className="mt-3 rounded-[8px] bg-zinc-50 px-3 py-4 text-xs font-bold text-zinc-500">학습 기록을 불러오는 중입니다.</div>
      ) : failed ? (
        <div className="mt-3 rounded-[8px] bg-zinc-50 px-3 py-4 text-xs font-bold text-zinc-500">학습 기록을 불러오지 못했습니다.</div>
      ) : !classDetail ? (
        <div className="mt-3 rounded-[8px] bg-zinc-50 px-3 py-4 text-xs font-bold text-zinc-500">연결된 클래스가 없습니다.</div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[8px] bg-zinc-50 p-2">
              <p className="text-[11px] font-black text-zinc-500">학생</p>
              <p className="mt-1 text-base font-black text-zinc-950">{classDetail.student_count}</p>
            </div>
            <div className="rounded-[8px] bg-zinc-50 p-2">
              <p className="text-[11px] font-black text-zinc-500">최근 평균</p>
              <p className="mt-1 text-base font-black text-zinc-950">{scoreText(classDetail.average_recent_score)}</p>
            </div>
            <div className="rounded-[8px] bg-zinc-50 p-2">
              <p className="text-[11px] font-black text-zinc-500">점수 입력</p>
              <p className="mt-1 text-base font-black text-zinc-950">{scoredStudentCount}</p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-black text-zinc-700">학생별 최근 점수</div>
            <div className="space-y-1">
              {scoreStudents.length ? scoreStudents.map((student) => (
                <div key={student.id} className="flex items-center justify-between gap-2 rounded-[7px] px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate font-bold text-zinc-800">{student.name}</span>
                  <span className={cn("shrink-0 font-black", typeof student.recent_score === "number" ? "text-zinc-950" : "text-zinc-400")}>{scoreText(student.recent_score)}</span>
                </div>
              )) : (
                <div className="rounded-[8px] bg-zinc-50 px-3 py-3 text-xs font-bold text-zinc-500">학생 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LiveLectureContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") || "";
  const classId = searchParams.get("classId") || "";
  const shareOnly = searchParams.get("share") === "1";
  const { event } = useLectureEvent(eventId || null);
  const [now, setNow] = useState(() => Date.now());
  const [sessionEvent, setSessionEvent] = useState<LiveInteractionEvent | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [slideUploadProgress, setSlideUploadProgress] = useState(0);
  const [slidePdf, setSlidePdf] = useState<SlidePdf | null>(null);
  const [pageNotes, setPageNotes] = useState<LecturePageNotes>({});
  const [lessonPlan, setLessonPlan] = useState<LiveLessonPlanItem[]>([]);
  const [lessonPlanDraft, setLessonPlanDraft] = useState<LessonPlanDraft | null>(null);
  const [lessonPlanSaving, setLessonPlanSaving] = useState(false);
  const [lessonPlanError, setLessonPlanError] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [problemSets, setProblemSets] = useState<ProblemSetListItem[]>([]);
  const [testResultItem, setTestResultItem] = useState<LiveLessonPlanItem | null>(null);
  const [testResultDetail, setTestResultDetail] = useState<PaperSessionDetail | null>(null);
  const [testResultLoading, setTestResultLoading] = useState(false);
  const [testResultError, setTestResultError] = useState("");
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
  const savedSessionRef = useRef<{ pageNotes: LecturePageNotes; pageNumber: number }>({ pageNotes: {}, pageNumber: 1 });

  const activeEvent = sessionEvent || event;
  const sessionTitle = activeEvent?.title || "즉시 강의";
  const sessionClassName = activeEvent?.class_name || "클래스 선택 없음";
  const storageKey = liveShareKey(eventId, classId);
  const shareUrl = slideShareUrl(eventId, classId);
  const currentPageNote = pageNotes[String(slidePage)] || "";
  const activeDurationMinutes = useMemo(() => eventDurationMinutes(activeEvent, now), [activeEvent, now]);

  function applyLectureSession(session: LiveLectureSession) {
    const nextSlide = slidePdfFromSession(session);
    const nextPageNotes = normalizeLecturePageNotes(session.lecture.page_notes, session.lecture.notes);
    const nextLessonPlan = normalizeLessonPlanItems(session.lecture.lesson_plan);
    setSessionEvent(session.event);
    setPageNotes(nextPageNotes);
    setLessonPlan(nextLessonPlan);
    setSlidePage(session.lecture.page_number || 1);
    setSlidePdf((current) => {
      if (current?.url && isBlobUrl(current.url)) URL.revokeObjectURL(current.url);
      return nextSlide;
    });
    savedSessionRef.current = {
      pageNotes: nextPageNotes,
      pageNumber: session.lecture.page_number || 1,
    };
    setSessionLoaded(true);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (shareOnly) return;
    if (!eventId) {
      setSessionEvent(null);
      setLessonPlan([]);
      setSessionLoaded(true);
      savedSessionRef.current = { pageNotes: {}, pageNumber: 1 };
      return;
    }
    let cancelled = false;
    setSessionLoaded(false);
    setSessionNotice("");
    async function loadSession() {
      try {
        const session = await getLiveLectureSession(eventId);
        if (!cancelled) applyLectureSession(session);
      } catch {
        if (!cancelled) {
          setSessionLoaded(true);
          setSessionNotice("강의 자료를 불러오지 못했습니다.");
        }
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [eventId, shareOnly]);

  useEffect(() => {
    if (shareOnly) return;
    let cancelled = false;
    async function loadTestSources() {
      try {
        const [batchRows, setRows] = await Promise.all([
          api<Batch[]>("/api/batches").catch(() => []),
          api<ProblemSetListItem[]>("/api/problem-sets").catch(() => []),
        ]);
        if (cancelled) return;
        setBatches(normalizeListResponse<Batch>(batchRows));
        setProblemSets(normalizeListResponse<ProblemSetListItem>(setRows));
      } catch {
        if (!cancelled) {
          setBatches([]);
          setProblemSets([]);
        }
      }
    }
    void loadTestSources();
    return () => {
      cancelled = true;
    };
  }, [shareOnly]);

  useEffect(() => {
    if (!eventId || !sessionLoaded || shareOnly) return;
    if (lecturePageNotesEqual(pageNotes, savedSessionRef.current.pageNotes) && slidePage === savedSessionRef.current.pageNumber) return;
    const timer = window.setTimeout(async () => {
      setSessionSaving(true);
      try {
        const session = await saveLiveLectureSession(eventId, { notes: pageNotes[String(slidePage)] || "", page_notes: pageNotes, page_number: slidePage });
        const nextPageNotes = normalizeLecturePageNotes(session.lecture.page_notes, session.lecture.notes);
        savedSessionRef.current = {
          pageNotes: nextPageNotes,
          pageNumber: session.lecture.page_number || slidePage,
        };
        setSessionEvent(session.event);
        setSessionNotice(session.created_class_default ? "클래스 기본 강의 포맷이 저장되었습니다." : "강의 자료가 저장되었습니다.");
      } catch {
        setSessionNotice("강의 자료를 저장하지 못했습니다.");
      } finally {
        setSessionSaving(false);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [eventId, pageNotes, sessionLoaded, shareOnly, slidePage]);

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
      if (slidePdf?.url && isBlobUrl(slidePdf.url)) URL.revokeObjectURL(slidePdf.url);
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

  async function applySlidePdfFile(file: File) {
    if (!isPdfFile(file)) {
      window.alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    if (eventId) {
      setSlideUploadProgress(1);
      setSessionNotice("");
      try {
        const session = await uploadLiveLectureSlide(eventId, file, setSlideUploadProgress);
        applyLectureSession(session);
        setSessionNotice("슬라이드가 저장되었습니다.");
      } catch {
        setSessionNotice("슬라이드를 업로드하지 못했습니다.");
      } finally {
        setSlideUploadProgress(0);
      }
      return;
    }
    const url = URL.createObjectURL(file);
    setSlidePdf((current) => {
      if (current?.url && isBlobUrl(current.url)) URL.revokeObjectURL(current.url);
      return { url, name: file.name, size: file.size };
    });
    setSlidePage(1);
  }

  function handleSlidePdfInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void applySlidePdfFile(file);
  }

  function draftFromLessonPlanItem(item: LiveLessonPlanItem): LessonPlanDraft {
    return {
      id: item.id,
      title: item.title,
      kind: item.kind,
      startMinute: String(item.start_minute),
      durationMinutes: String(item.duration_minutes),
      paperSessionId: item.paper_session_id || null,
      testSourceKey: "",
    };
  }

  function openNewLessonPlanDraft() {
    const lastEnd = lessonPlan.reduce((max, item) => Math.max(max, item.start_minute + item.duration_minutes), 0);
    const startMinute = Math.min(Math.max(0, activeDurationMinutes - 1), lastEnd);
    setLessonPlanError("");
    setLessonPlanDraft({
      title: "",
      kind: "lesson",
      startMinute: String(startMinute),
      durationMinutes: String(Math.min(30, Math.max(1, activeDurationMinutes - startMinute))),
      testSourceKey: "",
    });
  }

  async function persistLessonPlan(nextPlan: LiveLessonPlanItem[]) {
    if (!eventId) {
      setLessonPlanError("수업 이벤트가 연결되어야 저장할 수 있습니다.");
      setLessonPlanSaving(false);
      return null;
    }
    setLessonPlanSaving(true);
    setLessonPlanError("");
    try {
      const session = await saveLiveLectureSession(eventId, { lesson_plan: nextPlan });
      const normalized = normalizeLessonPlanItems(session.lecture.lesson_plan);
      setLessonPlan(normalized);
      setSessionEvent(session.event);
      setSessionNotice("수업 계획이 저장되었습니다.");
      return normalized;
    } catch {
      setLessonPlanError("수업 계획을 저장하지 못했습니다. 시간을 확인하고 다시 시도해 주세요.");
      return null;
    } finally {
      setLessonPlanSaving(false);
    }
  }

  async function createTimelineTestSession(draft: LessonPlanDraft, startMinute: number, durationMinutes: number) {
    const source = parseTestSourceKey(draft.testSourceKey);
    if (!source) return draft.paperSessionId || null;
    const targetClassId = classId || activeEvent?.class_id || "";
    if (!targetClassId) throw new Error("class-required");
    const scheduledAt = eventMinuteDate(activeEvent, startMinute);
    const dueAt = eventMinuteDate(activeEvent, startMinute + durationMinutes);
    const session = await createPaperSession({
      title: draft.title.trim() || "Preview test",
      source_batch_id: source.type === "batch" ? source.id : null,
      source_problem_set_id: source.type === "problem_set" ? source.id : null,
      session_type: "test",
      target_type: "class",
      class_ids: [targetClassId],
      scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
      due_at: dueAt ? dueAt.toISOString() : null,
      status: "scheduled",
      create_calendar_events: false,
    });
    return session.id;
  }

  async function saveLessonPlanDraft() {
    if (!lessonPlanDraft || lessonPlanSaving) return;
    const title = lessonPlanDraft.title.trim() || LESSON_KIND_LABELS[lessonPlanDraft.kind];
    const startMinute = Number(lessonPlanDraft.startMinute);
    const durationMinutes = Number(lessonPlanDraft.durationMinutes);
    if (!Number.isInteger(startMinute) || !Number.isInteger(durationMinutes) || startMinute < 0 || durationMinutes < 1 || startMinute + durationMinutes > activeDurationMinutes) {
      setLessonPlanError(`계획 블록은 0분부터 ${activeDurationMinutes}분 사이에 있어야 합니다.`);
      return;
    }
    setLessonPlanSaving(true);
    let paperSessionId = lessonPlanDraft.paperSessionId || null;
    if (lessonPlanDraft.kind === "test") {
      if (!paperSessionId && !lessonPlanDraft.testSourceKey) {
        setLessonPlanError("테스트 블록에는 추출 배치 또는 문항 묶음을 선택해야 합니다.");
        setLessonPlanSaving(false);
        return;
      }
      try {
        paperSessionId = await createTimelineTestSession(lessonPlanDraft, startMinute, durationMinutes);
      } catch {
        setLessonPlanError("테스트 세션을 만들지 못했습니다. 클래스에 활성 학생이 있는지 확인해 주세요.");
        setLessonPlanSaving(false);
        return;
      }
      if (!paperSessionId) {
        setLessonPlanError("테스트 세션이 필요합니다.");
        setLessonPlanSaving(false);
        return;
      }
    }
    const item: LiveLessonPlanItem = {
      id: lessonPlanDraft.id || newLessonPlanId(),
      title,
      kind: lessonPlanDraft.kind,
      start_minute: startMinute,
      duration_minutes: durationMinutes,
      paper_session_id: lessonPlanDraft.kind === "test" ? paperSessionId : null,
    };
    const nextPlan = normalizeLessonPlanItems(
      lessonPlanDraft.id
        ? lessonPlan.map((current) => (current.id === lessonPlanDraft.id ? item : current))
        : [...lessonPlan, item]
    );
    const saved = await persistLessonPlan(nextPlan);
    if (saved) setLessonPlanDraft(null);
  }

  function openTestResult(item: LiveLessonPlanItem) {
    if (!item.paper_session_id) {
      setLessonPlanDraft(draftFromLessonPlanItem(item));
      setLessonPlanError("테스트 자료를 먼저 연결해 주세요.");
      return;
    }
    setTestResultItem(item);
    setTestResultDetail(null);
    setTestResultError("");
    setTestResultLoading(true);
    getPaperSessionDetail(item.paper_session_id)
      .then((detail) => setTestResultDetail(detail))
      .catch(() => setTestResultError("테스트 결과를 불러오지 못했습니다."))
      .finally(() => setTestResultLoading(false));
  }

  return (
    <div className="space-y-4">
      {(!sessionLoaded || sessionSaving || sessionNotice) && !shareOnly ? (
        <section className="flex items-center justify-between rounded-[8px] bg-white px-4 py-2 text-xs font-black text-zinc-600 ring-1 ring-black/5">
          <span>{!sessionLoaded ? "강의 자료를 불러오는 중" : sessionSaving ? "강의 자료 저장 중" : sessionNotice}</span>
          {slideUploadProgress ? <span>{slideUploadProgress}%</span> : null}
        </section>
      ) : null}

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
          <input ref={slidePdfInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleSlidePdfInput} />
          <div className="rounded-[8px] bg-white p-4 ring-1 ring-black/5">
            <div className="mb-3 flex items-center justify-end gap-3">
              <div className="flex items-center gap-2 text-[11px] font-black text-zinc-400">
                {sessionSaving ? <span>저장 중</span> : null}
                <span>{slidePage}p</span>
              </div>
            </div>
            <textarea
              value={currentPageNote}
              onChange={(event) => {
                const value = event.target.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                setPageNotes((current) => {
                  const key = String(slidePage);
                  const next = { ...current };
                  if (value.trim()) {
                    next[key] = value;
                  } else {
                    delete next[key];
                  }
                  return next;
                });
              }}
              placeholder="memo"
              className="min-h-[10rem] w-full resize-none rounded-[8px] bg-zinc-100 p-3 text-sm font-medium leading-6 text-zinc-800 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10"
            />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <ClassLearningSnapshot classId={classId || activeEvent?.class_id || ""} />
          <LectureTimeline
            event={activeEvent}
            now={now}
            lessonPlan={lessonPlan}
            saving={lessonPlanSaving}
            onAdd={openNewLessonPlanDraft}
            onEdit={(item) => {
              setLessonPlanError("");
              setLessonPlanDraft(draftFromLessonPlanItem(item));
            }}
            onOpenTest={openTestResult}
          />
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
      {lessonPlanDraft ? (
        <LessonPlanEditorModal
          draft={lessonPlanDraft}
          durationMinutes={activeDurationMinutes}
          batches={batches}
          problemSets={problemSets}
          saving={lessonPlanSaving}
          error={lessonPlanError}
          onChange={(draft) => {
            setLessonPlanError("");
            setLessonPlanDraft(draft);
          }}
          onClose={() => {
            setLessonPlanDraft(null);
            setLessonPlanError("");
          }}
          onSubmit={saveLessonPlanDraft}
        />
      ) : null}
      {testResultItem ? (
        <TestResultModal
          item={testResultItem}
          detail={testResultDetail}
          loading={testResultLoading}
          error={testResultError}
          onClose={() => {
            setTestResultItem(null);
            setTestResultDetail(null);
            setTestResultError("");
          }}
        />
      ) : null}
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
