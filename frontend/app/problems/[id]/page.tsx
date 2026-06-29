"use client";

import type { ChangeEvent, DragEvent, PointerEvent } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ImagePlus, RefreshCcw, Save, Trash2 } from "lucide-react";

import { MathText } from "@/components/math-text";
import { ProblemVisualRenderer, shouldPreferProblemVisualSchema } from "@/components/problem-visual-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, assetUrl, Problem, Tag, uploadProblemVisual } from "@/lib/api";
import { normalizeProblemSourceLabel } from "@/lib/source-label";

type Facets = { subjects: string[]; units: string[]; problem_types: string[]; sources: string[] };
type Point = { x: number; y: number };
type Selection = { x: number; y: number; width: number; height: number };
type ProblemNavigation = { previous_id: string | null; next_id: string | null; position: number | null; total: number };

const emptyTags: Tag = { subject: "", unit: "", difficulty: "", problem_type: "", source: "" };
const difficulties = ["2점", "3점", "4점"];
const visualUploadTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const visualUploadExtensions = [".png", ".jpg", ".jpeg", ".webp"];
const visualUploadMaxBytes = 10 * 1024 * 1024;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function nullable(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : "";
}

function normalizedTags(tag: Tag | null | undefined): Tag {
  return {
    subject: nullable(tag?.subject),
    unit: nullable(tag?.unit),
    difficulty: nullable(tag?.difficulty),
    problem_type: nullable(tag?.problem_type),
    source: nullable(tag?.source),
  };
}

function stringOptions(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizedFacets(value: Partial<Facets> | null | undefined): Facets {
  return {
    subjects: stringOptions(value?.subjects),
    units: stringOptions(value?.units),
    problem_types: stringOptions(value?.problem_types),
    sources: stringOptions(value?.sources),
  };
}

function sameTags(a: Tag | null | undefined, b: Tag | null | undefined) {
  const left = normalizedTags(a);
  const right = normalizedTags(b);
  return (
    left.subject === right.subject &&
    left.unit === right.unit &&
    left.difficulty === right.difficulty &&
    left.problem_type === right.problem_type &&
    left.source === right.source
  );
}

function safeReturnHref(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function validateVisualFile(file: File) {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
  if (!visualUploadTypes.has(file.type) && !visualUploadExtensions.includes(extension)) {
    return "PNG, JPG, WebP 이미지만 추가할 수 있습니다.";
  }
  if (file.size > visualUploadMaxBytes) {
    return "이미지 파일은 10MB 이하만 추가할 수 있습니다.";
  }
  return "";
}

export default function ProblemDetailPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted-foreground">문항을 불러오는 중입니다.</div>}>
      <ProblemDetailContent />
    </Suspense>
  );
}

function ProblemDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageRef = useRef<HTMLImageElement>(null);
  const visualFileInputRef = useRef<HTMLInputElement>(null);
  const textAutoSaveTimerRef = useRef<number | null>(null);
  const tagAutoSaveTimerRef = useRef<number | null>(null);
  const textSaveSeqRef = useRef(0);
  const tagSaveSeqRef = useRef(0);
  const latestDraftTextRef = useRef("");
  const latestTagsRef = useRef<Tag>(emptyTags);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [navigation, setNavigation] = useState<ProblemNavigation | null>(null);
  const [facets, setFacets] = useState<Facets>({ subjects: [], units: [], problem_types: [], sources: [] });
  const [tags, setTags] = useState<Tag>(emptyTags);
  const [draftText, setDraftText] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [savingCrop, setSavingCrop] = useState(false);
  const [uploadingVisual, setUploadingVisual] = useState(false);
  const [visualUploadProgress, setVisualUploadProgress] = useState(0);
  const [visualDragActive, setVisualDragActive] = useState(false);
  const [deletingVisual, setDeletingVisual] = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingProblem, setDeletingProblem] = useState(false);
  const returnHref = useMemo(() => safeReturnHref(searchParams.get("returnTo")), [searchParams]);
  const contextQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("returnTo");
    return params.toString();
  }, [searchParams]);
  const hasFilterContext = useMemo(() => {
    const params = new URLSearchParams(contextQuery);
    params.delete("page");
    return Boolean(params.toString());
  }, [contextQuery]);
  const navigationQuerySuffix = contextQuery ? `?${contextQuery}` : "";
  const detailQuerySuffix = useMemo(() => {
    const params = new URLSearchParams(contextQuery);
    if (returnHref) params.set("returnTo", returnHref);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [contextQuery, returnHref]);
  const archiveHref = returnHref || `/problems${navigationQuerySuffix}`;

  useEffect(() => {
    setProblem(null);
    setLoadError(null);
    setActionError("");

    api<Problem>(`/api/problems/${params.id}`)
      .then((data) => {
        setProblem(data);
        setDraftText(data.problem_text);
        setDraftAnswer(data.answer || "");
        setTags(normalizedTags(data.tags));
      })
      .catch((error) => {
        const status = error?.response?.status;
        setLoadError(
          status === 404
            ? "이 문항을 찾을 수 없거나 현재 로그인한 계정에서 접근할 수 없습니다."
            : "문항 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
        );
      });

    api<Facets>("/api/problems/facets").then((data) => setFacets(normalizedFacets(data))).catch(() => undefined);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    setNavigation(null);
    api<ProblemNavigation>(`/api/problems/${params.id}/navigation${navigationQuerySuffix}`)
      .then((data) => {
        if (!cancelled) setNavigation(data);
      })
      .catch(() => {
        if (!cancelled) setNavigation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, navigationQuerySuffix]);

  function imagePoint(event: PointerEvent<HTMLDivElement>): Point {
    const image = imageRef.current;
    if (!image) return { x: 0, y: 0 };
    const rect = image.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  }

  function startCrop(event: PointerEvent<HTMLDivElement>) {
    if (!cropSourceUrl || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = imagePoint(event);
    setActionError("");
    setDragStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = imagePoint(event);
    setSelection({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    });
  }

  const saveProblemText = useCallback(async (nextText = draftText) => {
    if (textAutoSaveTimerRef.current) {
      window.clearTimeout(textAutoSaveTimerRef.current);
      textAutoSaveTimerRef.current = null;
    }
    if (!problem) return true;
    if (!nextText.trim()) {
      setActionError("문항 텍스트를 비워둘 수 없습니다.");
      return false;
    }
    if (nextText === (problem.problem_text || "")) {
      return true;
    }
    const seq = ++textSaveSeqRef.current;
    setSavingText(true);
    setActionError("");
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_text: nextText }),
      });
      const isLatestSave = seq === textSaveSeqRef.current;
      setProblem(updated);
      if (isLatestSave && latestDraftTextRef.current === nextText) {
        setDraftText(updated.problem_text);
      }
      return true;
    } catch {
      setActionError("문항 저장에 실패했습니다.");
      return false;
    } finally {
      setSavingText(false);
    }
  }, [draftText, problem]);

  const reextractProblem = useCallback(async () => {
    if (!problem || !problem.review_page_image_url || reextracting) return;
    setReextracting(true);
    setActionError("");
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}/reextract`, { method: "POST" });
      setProblem({ ...updated, needs_review: true });
      setDraftText(updated.problem_text);
      setDraftAnswer(updated.answer || "");
      setTags(normalizedTags(updated.tags));
      api<Problem>(`/api/problems/${updated.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needs_review: true }),
      })
        .then((marked) => setProblem(marked))
        .catch(() => undefined);
    } catch (error: any) {
      setActionError(
        error?.response?.data?.detail ||
          "AI 재추출에 실패했습니다. 원본 페이지 이미지와 API 설정을 확인해주세요."
      );
    } finally {
      setReextracting(false);
    }
  }, [problem, reextracting]);

  async function saveCrop() {
    const image = imageRef.current;
    if (!problem || !image || !selection || selection.width < 10 || selection.height < 10) return;
    setSavingCrop(true);
    setActionError("");
    const rect = image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}/visual-crop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: Math.round(selection.x * scaleX),
          y: Math.round(selection.y * scaleY),
          width: Math.round(selection.width * scaleX),
          height: Math.round(selection.height * scaleY),
        }),
      });
      setProblem(updated);
      setSelection(null);
    } catch {
      setActionError("시각 자료 영역 저장에 실패했습니다.");
    } finally {
      setSavingCrop(false);
    }
  }

  async function uploadVisualFile(file: File | null | undefined) {
    if (!problem || !file || uploadingVisual) return;
    const validationError = validateVisualFile(file);
    if (validationError) {
      setActionError(validationError);
      return;
    }
    setUploadingVisual(true);
    setVisualUploadProgress(0);
    setVisualDragActive(false);
    setActionError("");
    try {
      const updated = await uploadProblemVisual(problem.id, file, setVisualUploadProgress);
      setProblem(updated);
      setSelection(null);
    } catch (error: any) {
      setActionError(error?.response?.data?.detail || error?.message || "그림 추가에 실패했습니다.");
    } finally {
      setUploadingVisual(false);
      setVisualUploadProgress(0);
      if (visualFileInputRef.current) visualFileInputRef.current.value = "";
    }
  }

  function handleVisualFileChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadVisualFile(event.target.files?.[0]);
  }

  function handleVisualDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!uploadingVisual) setVisualDragActive(true);
  }

  function handleVisualDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setVisualDragActive(false);
  }

  function handleVisualDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setVisualDragActive(false);
    void uploadVisualFile(event.dataTransfer.files?.[0]);
  }

  const saveProblemAnswer = useCallback(async (nextAnswer = draftAnswer) => {
    if (!problem) return true;
    if (nextAnswer === (problem.answer || "")) {
      return true;
    }
    setSavingAnswer(true);
    setActionError("");
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: nextAnswer.trim() ? nextAnswer : null }),
      });
      setProblem(updated);
      setDraftAnswer(updated.answer || "");
      return true;
    } catch {
      setActionError("정답 저장에 실패했습니다.");
      return false;
    } finally {
      setSavingAnswer(false);
    }
  }, [draftAnswer, problem]);

  async function deleteVisual() {
    if (!problem || !problem.visual_url) return;
    setDeletingVisual(true);
    setActionError("");
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}/visual`, { method: "DELETE" });
      setProblem(updated);
      setSelection(null);
    } catch {
      setActionError("저장된 사진 삭제에 실패했습니다.");
    } finally {
      setDeletingVisual(false);
    }
  }

  const saveTags = useCallback(async (nextTags = tags) => {
    if (tagAutoSaveTimerRef.current) {
      window.clearTimeout(tagAutoSaveTimerRef.current);
      tagAutoSaveTimerRef.current = null;
    }
    if (!problem) return true;
    if (sameTags(nextTags, problem.tags)) {
      setTags(normalizedTags(problem.tags));
      return true;
    }
    const seq = ++tagSaveSeqRef.current;
    setSavingTags(true);
    setActionError("");
    try {
      const saved = await api<Tag>(`/api/problems/${problem.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextTags),
      });
      const isLatestSave = seq === tagSaveSeqRef.current;
      if (isLatestSave && sameTags(latestTagsRef.current, nextTags)) {
        setTags(normalizedTags(saved));
      }
      setProblem((current) => (current ? { ...current, tags: saved } : current));
      return true;
    } catch {
      setActionError("태그 저장에 실패했습니다.");
      return false;
    } finally {
      setSavingTags(false);
    }
  }, [problem, tags]);

  useEffect(() => {
    latestDraftTextRef.current = draftText;
  }, [draftText]);

  useEffect(() => {
    latestTagsRef.current = tags;
  }, [tags]);

  useEffect(() => {
    if (textAutoSaveTimerRef.current) {
      window.clearTimeout(textAutoSaveTimerRef.current);
      textAutoSaveTimerRef.current = null;
    }
    if (!problem) return;
    if (!draftText.trim()) return;
    if (draftText === (problem.problem_text || "")) return;

    textAutoSaveTimerRef.current = window.setTimeout(() => {
      void saveProblemText(draftText);
    }, 800);

    return () => {
      if (textAutoSaveTimerRef.current) {
        window.clearTimeout(textAutoSaveTimerRef.current);
        textAutoSaveTimerRef.current = null;
      }
    };
  }, [draftText, problem, saveProblemText]);

  useEffect(() => {
    if (tagAutoSaveTimerRef.current) {
      window.clearTimeout(tagAutoSaveTimerRef.current);
      tagAutoSaveTimerRef.current = null;
    }
    if (!problem || sameTags(tags, problem.tags)) return;

    tagAutoSaveTimerRef.current = window.setTimeout(() => {
      void saveTags(tags);
    }, 800);

    return () => {
      if (tagAutoSaveTimerRef.current) {
        window.clearTimeout(tagAutoSaveTimerRef.current);
        tagAutoSaveTimerRef.current = null;
      }
    };
  }, [problem, saveTags, tags]);

  const saveCurrentProblem = useCallback(async () => {
    if (!problem || savingReview) return false;
    const textSaved = await saveProblemText();
    if (!textSaved) return false;
    const answerSaved = await saveProblemAnswer();
    if (!answerSaved) return false;
    const tagsSaved = await saveTags();
    if (!tagsSaved) return false;
    setSavingReview(true);
    setActionError("");
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needs_review: false }),
      });
      setProblem(updated);
      setDraftText(updated.problem_text);
      setDraftAnswer(updated.answer || "");
      setTags(normalizedTags(updated.tags));
      return true;
    } catch {
      setActionError("저장 상태를 반영하지 못했습니다.");
      return false;
    } finally {
      setSavingReview(false);
    }
  }, [problem, saveProblemAnswer, saveProblemText, saveTags, savingReview]);

  const openProblem = useCallback(async (problemId: string | null) => {
    if (!problemId) return;
    const saved = await saveCurrentProblem();
    if (!saved) return;
    router.push(`/problems/${problemId}${detailQuerySuffix}`);
  }, [detailQuerySuffix, router, saveCurrentProblem]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      const saveShortcut = key === "s" && (event.ctrlKey || event.metaKey);
      if (saveShortcut) {
        event.preventDefault();
        void saveCurrentProblem();
        return;
      }
      if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

      if (key === "arrowleft") {
        if (!navigation?.previous_id) return;
        event.preventDefault();
        void openProblem(navigation.previous_id);
        return;
      }
      if (key === "arrowright") {
        if (!navigation?.next_id) return;
        event.preventDefault();
        void openProblem(navigation.next_id);
        return;
      }
      if (key === "s") {
        event.preventDefault();
        void saveCurrentProblem();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        void reextractProblem();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigation?.next_id, navigation?.previous_id, openProblem, reextractProblem, saveCurrentProblem]);

  async function confirmRemoveProblem() {
    if (!problem) return;
    setDeletingProblem(true);
    setActionError("");
    try {
      await api(`/api/problems/${problem.id}`, { method: "DELETE" });
      setDeleteConfirmOpen(false);
      router.push(archiveHref);
    } catch {
      setActionError("문항 삭제에 실패했습니다.");
    } finally {
      setDeletingProblem(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 rounded-xl bg-white px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-950">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-950">문항을 열 수 없습니다</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{loadError}</p>
        </div>
        <Button variant="outline" onClick={() => router.push(archiveHref)}>
          <ArrowLeft className="h-4 w-4" />
          문항 아카이브로 돌아가기
        </Button>
      </div>
    );
  }

  if (!problem) {
    return <div className="py-20 text-center text-muted-foreground">문항을 불러오는 중입니다.</div>;
  }

  const cropSourceUrl = problem.review_page_image_url || problem.visual_url;
  const hasStructuredVisual = shouldPreferProblemVisualSchema(problem.visual_schema, Boolean(problem.visual_url));
  const sourceLabel = normalizeProblemSourceLabel(
    tags.source || problem.source_label || `${problem.review_page_number ? `${problem.review_page_number}페이지 / ` : ""}${problem.problem_number}번`
  );
  const navigationLabel =
    navigation?.position && navigation.total
      ? `${navigation.position} / ${navigation.total}`
      : navigation?.total === 0
        ? "조건 내 문항 없음"
        : "위치 계산 중";
  const hasUnsavedEdits = draftText !== (problem.problem_text || "") || draftAnswer !== (problem.answer || "") || !sameTags(tags, problem.tags);
  const hasPendingSave = hasUnsavedEdits || problem.needs_review;
  const savingAny = savingText || savingAnswer || savingTags || savingReview;
  const saveStatusLabel = savingAny ? "저장 중" : hasPendingSave ? "저장 필요" : "저장됨";
  const saveStatusVariant = savingAny || hasPendingSave ? "warning" : "success";

  return (
    <div className="min-w-0 space-y-4">
      <div className="sticky top-[65px] z-30 flex min-h-14 flex-wrap items-center gap-3 rounded-lg bg-white px-3 py-2 backdrop-blur-xl">
        <Button variant="outline" onClick={() => router.push(archiveHref)}>
          <ArrowLeft className="h-4 w-4" />
          문항 아카이브
        </Button>
        <div className="rounded-[7px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">
          {hasFilterContext ? "현재 검색 조건 기준" : "전체 문항 기준"} {navigationLabel}
        </div>
        <Badge variant={saveStatusVariant}>{saveStatusLabel}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => openProblem(navigation?.previous_id || null)} disabled={!navigation?.previous_id}>
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          <Button variant="outline" onClick={() => openProblem(navigation?.next_id || null)} disabled={!navigation?.next_id}>
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => void saveCurrentProblem()} disabled={savingAny || !hasPendingSave}>
            <Save className="h-4 w-4" />
            저장
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-800">
          <AlertTriangle className="h-4 w-4" />
          {actionError}
        </div>
      ) : null}

      <div className="grid min-h-[calc(100vh-190px)] gap-4 xl:grid-cols-2">
        <section className="flex min-h-[680px] flex-col rounded-lg bg-white">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-950">원본 페이지 p.{problem.review_page_number || "-"}</h2>
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">{sourceLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cropSourceUrl ? (
                <Button size="sm" onClick={saveCrop} disabled={!selection || selection.width < 10 || selection.height < 10 || savingCrop}>
                  <Save className="h-4 w-4" />
                  저장
                </Button>
              ) : null}
            </div>
          </div>

          <div
            className={`relative flex flex-1 items-start justify-center overflow-auto bg-zinc-100 p-4 ${cropSourceUrl ? "cursor-crosshair" : ""}`}
            onPointerDown={startCrop}
            onPointerMove={moveCrop}
            onPointerUp={() => setDragStart(null)}
            onPointerCancel={() => setDragStart(null)}
          >
            {cropSourceUrl ? (
              <div className="relative">
                <img
                  ref={imageRef}
                  src={assetUrl(cropSourceUrl)}
                  alt={`${problem.problem_number}번 원본 페이지`}
                  className="select-none rounded bg-white"
                  draggable={false}
                />
                {selection ? (
                  <div
                    className="absolute border-2 border-dashed border-zinc-400 bg-zinc-400/15"
                    style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-[560px] w-full items-center justify-center rounded-lg bg-zinc-50 text-center text-sm font-semibold text-zinc-500">
                검토용 원본 페이지 이미지가 없습니다.
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[680px] flex-col gap-3 rounded-lg bg-white p-3">
          <div className="rounded-lg bg-zinc-50">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-950">본문</h2>
                {draftText !== problem.problem_text ? <Badge variant="warning">수정 중</Badge> : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={reextractProblem}
                disabled={reextracting || !problem.review_page_image_url}
                title={!problem.review_page_image_url ? "검토용 원본 페이지 이미지가 있는 문항만 재추출할 수 있습니다." : undefined}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${reextracting ? "animate-spin" : ""}`} />
                재추출
              </Button>
            </div>
            <div className="min-h-[220px] bg-white p-5 text-zinc-950">
              <div className="mb-3 text-sm font-semibold text-zinc-500">문항 {problem.problem_number}</div>
              <MathText className="tena-math-review text-[15px] leading-8" value={draftText || "문항 내용이 비어 있습니다."} />
            </div>
            <div className="bg-zinc-100 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-950">문항 텍스트</span>
                <Button size="sm" variant="outline" onClick={() => void saveProblemText()} disabled={savingText || !draftText.trim() || draftText === problem.problem_text}>
                  <Save className="h-3.5 w-3.5" />
                  저장
                </Button>
              </div>
              <textarea
                aria-label="문항 텍스트 수정"
                className="min-h-36 w-full resize-y rounded-[7px] border-0 bg-white p-3 font-mono text-sm leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                placeholder="문항 내용이 비어 있습니다."
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg bg-zinc-50 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-zinc-950">정답</h3>
                <Button size="sm" variant="outline" onClick={() => void saveProblemAnswer()} disabled={savingAnswer || draftAnswer === (problem.answer || "")}>
                  <Save className="h-3.5 w-3.5" />
                  저장
                </Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="min-h-28 rounded-[7px] bg-white p-3 text-sm leading-7 text-zinc-950">
                  {draftAnswer.trim() ? (
                    <MathText className="tena-math-review text-[15px] leading-8" value={draftAnswer} />
                  ) : (
                    <span className="text-zinc-500">정답 데이터 없음</span>
                  )}
                </div>
                <textarea
                  aria-label="정답 LaTeX 원문 수정"
                  className="min-h-28 w-full resize-y rounded-[7px] border-0 bg-white p-3 font-mono text-sm leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:ring-2 focus:ring-black/10"
                  value={draftAnswer}
                  onChange={(event) => setDraftAnswer(event.target.value)}
                  placeholder="LaTeX 원문을 입력하세요."
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-50 p-4">
            <input
              ref={visualFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={handleVisualFileChange}
            />
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-950">문항 그림</h3>
                {uploadingVisual ? <p className="mt-1 text-xs font-semibold text-zinc-500">업로드 중 {visualUploadProgress}%</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => visualFileInputRef.current?.click()} disabled={uploadingVisual}>
                  <ImagePlus className="h-3.5 w-3.5" />
                  {problem.visual_url ? "교체" : "추가"}
                </Button>
                {problem.visual_url ? (
                  <Button size="sm" variant="outline" onClick={deleteVisual} disabled={deletingVisual || uploadingVisual}>
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </Button>
                ) : null}
              </div>
            </div>
            <div
              className={`rounded-lg p-2 transition ${
                visualDragActive
                  ? "bg-zinc-200"
                  : problem.visual_url
                    ? "bg-white"
                    : "bg-white"
              }`}
              onDragOver={handleVisualDragOver}
              onDragLeave={handleVisualDragLeave}
              onDrop={handleVisualDrop}
            >
              {hasStructuredVisual ? (
                <ProblemVisualRenderer schema={problem.visual_schema} mathModel={problem.math_model} className="max-h-64 w-full rounded object-contain" />
              ) : problem.visual_url ? (
                <img src={assetUrl(problem.visual_url)} alt="문항 그림" className="max-h-52 w-full rounded object-contain" />
              ) : (
                <button
                  type="button"
                  className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-[7px] text-center text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
                  onClick={() => visualFileInputRef.current?.click()}
                  disabled={uploadingVisual}
                >
                  <ImagePlus className="h-5 w-5" />
                  <span className="font-semibold">{uploadingVisual ? `업로드 중 ${visualUploadProgress}%` : "그림 파일 추가"}</span>
                  <span className="text-xs text-zinc-500">PNG, JPG, WebP</span>
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-zinc-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-950">메타데이터</h3>
                <p className="mt-1 text-xs font-semibold text-zinc-500">문항 정보와 태그를 검토 화면과 같은 위치에서 수정합니다.</p>
              </div>
              <Button size="sm" onClick={() => void saveTags()} disabled={savingTags}>
                <Save className="h-3.5 w-3.5" />
                태그 저장
              </Button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <TagInput label="과목" listId="subjects" value={tags.subject || ""} options={facets.subjects} onChange={(value) => setTags({ ...tags, subject: value })} />
              <TagInput label="단원" listId="units" value={tags.unit || ""} options={facets.units} onChange={(value) => setTags({ ...tags, unit: value })} />
              <TagInput label="문항 유형" listId="types" value={tags.problem_type || ""} options={facets.problem_types} onChange={(value) => setTags({ ...tags, problem_type: value })} />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_2fr]">
              <TagInput label="출처" listId="sources" value={tags.source || ""} options={facets.sources} onChange={(value) => setTags({ ...tags, source: value })} />
              <div>
                <div className="mb-2 text-xs font-semibold text-zinc-500">난이도</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {difficulties.map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      className={`h-10 rounded-[7px] text-sm font-bold transition ${
                        tags.difficulty === difficulty
                          ? "bg-black text-white"
                          : "bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                      }`}
                      onClick={() => setTags({ ...tags, difficulty })}
                    >
                      {difficulty}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg bg-zinc-50 p-4 text-sm">
              <h3 className="mb-3 text-sm font-bold text-zinc-950">문항 정보</h3>
              <InfoRow label="문항 번호" value={`${problem.problem_number}번`} />
              <InfoRow label="원본 페이지" value={problem.review_page_number ? `${problem.review_page_number}페이지` : "미기록"} />
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <h3 className="mb-3 text-sm font-bold text-zinc-950">관리</h3>
              <Button variant="destructive" className="w-full" onClick={() => setDeleteConfirmOpen(true)} disabled={deletingProblem}>
                <Trash2 className="h-4 w-4" />
                문항 삭제
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => !deletingProblem && setDeleteConfirmOpen(open)}>
        <DialogContent className="max-w-md bg-white text-zinc-950">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black">문항 삭제</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {problem.problem_number}번 문항을 삭제합니다. 세트나 시험지에 들어간 항목에서도 빠질 수 있으며, 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
            <div className="rounded-[8px] bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">
              출처: {sourceLabel || "출처 미지정"}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={deletingProblem} onClick={() => setDeleteConfirmOpen(false)}>
                취소
              </Button>
              <Button type="button" variant="destructive" disabled={deletingProblem} onClick={confirmRemoveProblem}>
                {deletingProblem ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md bg-white px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-zinc-950">{value}</span>
    </div>
  );
}

function TagInput({
  label,
  listId,
  value,
  options,
  onChange,
}: {
  label: string;
  listId: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const safeOptions = Array.isArray(options) ? options : [];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input list={listId} value={value} onChange={(event) => onChange(event.target.value)} />
      <datalist id={listId}>
        {safeOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
