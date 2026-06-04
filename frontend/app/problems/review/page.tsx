"use client";

import { Suspense, type Dispatch, type PointerEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Code2,
  HelpCircle,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Save,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useReviewHotkeys } from "@/hooks/useReviewHotkeys";
import { api, assetUrl, Batch, KoreanReviewItem, KoreanReviewItemsResponse, KoreanReviewPassageItem, Problem, Tag } from "@/lib/api";
import { inferReviewAutofill } from "@/lib/review/autofill";
import { cn } from "@/lib/utils";

type ProblemPage = { items: Problem[]; total: number; page: number; limit: number; pages: number };
type Facets = { subjects: string[]; units: string[]; problem_types: string[]; sources: string[] };
type SaveState = "idle" | "saving" | "saved" | "error";
type Difficulty = "하" | "중" | "상" | "최상";
type MetadataField = "subject" | "unit" | "problem_type";
type SelectionBox = { x: number; y: number; width: number; height: number };
type OriginalPageTarget = {
  id: string;
  review_page_image_url?: string | null;
  review_page_number?: number | null;
};
type PassageDraft = {
  passage_instruction: string;
  passage_title: string;
  passage_text: string;
  passage_type: string;
};
type MetadataDraft = {
  subject: string;
  unit: string;
  problem_type: string;
  difficulty: Difficulty | "";
  auto_filled: Record<MetadataField, boolean>;
};

const blankTag: Tag = { subject: null, unit: null, difficulty: null, problem_type: null, source: null };
const emptyMetadata: MetadataDraft = {
  subject: "",
  unit: "",
  problem_type: "",
  difficulty: "",
  auto_filled: { subject: false, unit: false, problem_type: false },
};
const difficulties: Difficulty[] = ["하", "중", "상", "최상"];

function normalizeTag(tag: Tag | null | undefined): Tag {
  return { ...blankTag, ...(tag || {}) };
}

function nullable(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function tagPayload(metadata: MetadataDraft, current: Problem | null): Tag {
  return {
    subject: nullable(metadata.subject),
    unit: nullable(metadata.unit),
    difficulty: nullable(metadata.difficulty),
    problem_type: nullable(metadata.problem_type),
    source: normalizeTag(current?.tags).source,
  };
}

function sameTag(a: Tag, b: Tag) {
  return (
    nullable(a.subject) === nullable(b.subject) &&
    nullable(a.unit) === nullable(b.unit) &&
    nullable(a.difficulty) === nullable(b.difficulty) &&
    nullable(a.problem_type) === nullable(b.problem_type) &&
    nullable(a.source) === nullable(b.source)
  );
}

function metadataFromProblem(problem: Problem, batch: Batch | null): MetadataDraft {
  const tag = normalizeTag(problem.tags);
  const inferred = inferReviewAutofill({
    batchName: batch?.name,
    problemText: problem.problem_text,
    sourcePage: problem.review_page_number,
    unitMap: batch?.unit_map,
    subjectCandidates: batch?.subject_candidates,
    unitCandidates: batch?.unit_candidates,
  });

  const subject = tag.subject || inferred.subject || "";
  const unit = tag.unit || inferred.unit || "";
  const problemType = tag.problem_type || inferred.problem_type || "";

  return {
    subject,
    unit,
    problem_type: problemType,
    difficulty: (tag.difficulty as Difficulty | null) || "",
    auto_filled: {
      subject: !tag.subject && Boolean(inferred.subject),
      unit: !tag.unit && Boolean(inferred.unit),
      problem_type: !tag.problem_type && Boolean(inferred.problem_type),
    },
  };
}

function formatProgress(done: number, total: number) {
  return `${done.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")}`;
}

function findNextUnreviewed(problems: Problem[], fromIndex: number) {
  if (!problems.length) return null;
  for (let i = fromIndex + 1; i < problems.length; i += 1) {
    if (problems[i].needs_review) return problems[i];
  }
  for (let i = 0; i <= fromIndex; i += 1) {
    if (problems[i].needs_review) return problems[i];
  }
  return null;
}

function reviewItemId(item: KoreanReviewItem) {
  return item.item_type === "passage" ? `passage:${item.id}` : item.problem.id;
}

function reviewItemNeedsReview(item: KoreanReviewItem) {
  return item.item_type === "passage" ? item.needs_review : item.problem.needs_review;
}

function questionProblemFromItem(item: KoreanReviewItem): Problem | null {
  return item.item_type === "question" ? item.problem : null;
}

function findNextUnreviewedItem(items: KoreanReviewItem[], fromIndex: number) {
  if (!items.length) return null;
  for (let i = fromIndex + 1; i < items.length; i += 1) {
    if (reviewItemNeedsReview(items[i])) return items[i];
  }
  for (let i = 0; i <= fromIndex; i += 1) {
    if (reviewItemNeedsReview(items[i])) return items[i];
  }
  return null;
}

async function fetchAllProblems(batchId: string) {
  const collected: Problem[] = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await api<ProblemPage>(`/api/problems?batch_id=${batchId}&page=${page}&limit=100`);
    collected.push(...data.items);
    pages = data.pages;
    page += 1;
  } while (page <= pages);
  return collected;
}

async function patchTagsWithRetry(problemId: string, payload: Tag) {
  try {
    return await api<Tag>(`/api/problems/${problemId}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return api<Tag>(`/api/problems/${problemId}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}

function ProblemReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedBatchIdRef = useRef(searchParams.get("batch_id") || "");
  const requestedBatchId = requestedBatchIdRef.current;

  const [batches, setBatches] = useState<Batch[]>([]);
  const [facets, setFacets] = useState<Facets>({ subjects: [], units: [], problem_types: [], sources: [] });
  const [selectedBatchId, setSelectedBatchId] = useState(requestedBatchId);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [koreanReviewItems, setKoreanReviewItems] = useState<KoreanReviewItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Problem | null>(null);
  const [passageDraft, setPassageDraft] = useState<PassageDraft>({ passage_instruction: "", passage_title: "", passage_text: "", passage_type: "" });
  const [savingPassage, setSavingPassage] = useState(false);
  const [metadata, setMetadata] = useState<MetadataDraft>(emptyMetadata);
  const [problemTextDraft, setProblemTextDraft] = useState("");
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savingProblemText, setSavingProblemText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"review" | "reextract" | "trash" | null>(null);
  const [savedVisualUrl, setSavedVisualUrl] = useState<string | null>(null);
  const [deletingVisual, setDeletingVisual] = useState(false);
  const [selectedProblemIds, setSelectedProblemIds] = useState<string[]>([]);

  const saveTimerRef = useRef<number | null>(null);
  const problemTextSaveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  const problemTextSaveSeqRef = useRef(0);
  const latestProblemTextDraftRef = useRef("");
  const loadedProblemIdRef = useRef<string | null>(null);

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) || null, [batches, selectedBatchId]);
  const isKoreanBatch = selectedBatch?.subject_engine === "korean" || selectedBatch?.subject_engine === "english";
  const reviewItems = useMemo<KoreanReviewItem[]>(
    () => isKoreanBatch ? koreanReviewItems : problems.map((problem) => ({ item_type: "question" as const, id: problem.id, problem })),
    [isKoreanBatch, koreanReviewItems, problems],
  );
  const currentIndex = useMemo(() => reviewItems.findIndex((item) => reviewItemId(item) === currentId), [currentId, reviewItems]);
  const currentReviewItem = currentIndex >= 0 ? reviewItems[currentIndex] : null;
  const currentPassage = currentReviewItem?.item_type === "passage" ? currentReviewItem : null;
  const currentListItem = currentReviewItem?.item_type === "question" ? currentReviewItem.problem : null;
  const passageDraftDirty = Boolean(
    currentPassage &&
      (
        passageDraft.passage_instruction !== (currentPassage.passage_instruction || "") ||
        passageDraft.passage_title !== (currentPassage.passage_title || "") ||
        passageDraft.passage_text !== (currentPassage.passage_text || "") ||
        passageDraft.passage_type !== (currentPassage.passage_type || "")
      ),
  );
  const totalCount = isKoreanBatch ? selectedBatch?.review_item_count || reviewItems.length : selectedBatch?.problem_count || problems.length;
  const reviewedCount = reviewItems.length
    ? reviewItems.filter((item) => !reviewItemNeedsReview(item)).length
    : selectedBatch
      ? Math.max(totalCount - (isKoreanBatch ? selectedBatch.pending_review_item_count ?? selectedBatch.review_count : selectedBatch.review_count), 0)
      : 0;
  const progressPercent = totalCount ? Math.min(100, Math.round((reviewedCount / totalCount) * 100)) : 0;
  const pendingCount = Math.max(totalCount - reviewedCount, 0);

  useEffect(() => {
    const visibleIds = new Set(reviewItems.map(reviewItemId));
    setSelectedProblemIds((currentIds) => currentIds.filter((id) => visibleIds.has(id)));
  }, [reviewItems]);

  const saveMetadataNow = useCallback(
    async (problem = current, nextMetadata = metadata) => {
      if (!problem) return;
      const problemId = problem.id;
      const nextPayload = tagPayload(nextMetadata, problem);
      const original = normalizeTag(problem.tags);
      if (sameTag(nextPayload, original)) {
        setSaveState("saved");
        return;
      }

      const seq = ++saveSeqRef.current;
      setSaveState("saving");
      try {
        const updatedTags = await patchTagsWithRetry(problemId, nextPayload);
        if (seq !== saveSeqRef.current || loadedProblemIdRef.current !== problemId) return;
        const updatedProblem = { ...problem, tags: updatedTags };
        setCurrent(updatedProblem);
        setProblems((prev) => prev.map((item) => (item.id === problemId ? { ...item, tags: updatedTags } : item)));
        setKoreanReviewItems((prev) =>
          prev.map((item) => item.item_type === "question" && item.problem.id === problemId ? { ...item, problem: { ...item.problem, tags: updatedTags } } : item),
        );
        setSaveState("saved");
      } catch {
        if (seq === saveSeqRef.current) {
          setSaveState("error");
          setError("자동 저장에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
        }
      }
    },
    [current, metadata],
  );

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await saveMetadataNow();
  }, [saveMetadataNow]);

  const saveProblemTextNow = useCallback(
    async (problem = current, nextText = problemTextDraft) => {
      if (problemTextSaveTimerRef.current) {
        window.clearTimeout(problemTextSaveTimerRef.current);
        problemTextSaveTimerRef.current = null;
      }
      if (!problem) return true;
      if (!nextText.trim()) {
        setSaveState("error");
        setError("문항 텍스트를 비워둘 수 없습니다.");
        return false;
      }
      if (nextText === (problem.problem_text || "")) {
        return true;
      }

      const seq = ++problemTextSaveSeqRef.current;
      setSavingProblemText(true);
      setSaveState("saving");
      setError(null);
      try {
        const updated = await api<Problem>(`/api/problems/${problem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problem_text: nextText }),
        });
        const isLatestTextSave = seq === problemTextSaveSeqRef.current;
        if (loadedProblemIdRef.current === updated.id) {
          setCurrent(updated);
          if (isLatestTextSave && latestProblemTextDraftRef.current === nextText) {
            setProblemTextDraft(updated.problem_text || "");
          }
        }
        setProblems((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        setKoreanReviewItems((items) =>
          items.map((item) => item.item_type === "question" && item.problem.id === updated.id ? { ...item, problem: { ...item.problem, ...updated } } : item),
        );
        if (isLatestTextSave && latestProblemTextDraftRef.current === nextText) {
          setSaveState("saved");
        }
        return true;
      } catch {
        setSaveState("error");
        setError("문항 텍스트 저장에 실패했습니다. 다시 시도해 주세요.");
        return false;
      } finally {
        setSavingProblemText(false);
      }
    },
    [current, problemTextDraft],
  );

  useEffect(() => {
    api<Facets>("/api/problems/facets").then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingBatches(true);
    api<Batch[]>("/api/batches")
      .then((data) => {
        if (cancelled) return;
        setBatches(data);
        setSelectedBatchId((currentBatchId) => {
          if (requestedBatchId && data.some((batch) => batch.id === requestedBatchId && (batch.review_item_count ?? batch.problem_count) > 0)) return requestedBatchId;
          if (currentBatchId && data.some((batch) => batch.id === currentBatchId && (batch.review_item_count ?? batch.problem_count) > 0)) return currentBatchId;
          return data.find((batch) => (batch.pending_review_item_count ?? batch.review_count) > 0)?.id || data.find((batch) => (batch.review_item_count ?? batch.problem_count) > 0)?.id || "";
        });
      })
      .catch(() => setError("배치 목록을 불러오지 못했습니다."))
      .finally(() => {
        if (!cancelled) setLoadingBatches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    router.replace(`/problems/review?batch_id=${selectedBatchId}`, { scroll: false });
  }, [router, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) {
      setProblems([]);
      setKoreanReviewItems([]);
      setCurrentId(null);
      return;
    }

    let cancelled = false;
    setLoadingProblems(true);
    setError(null);
    const load = isKoreanBatch
      ? api<KoreanReviewItemsResponse>(`/api/batches/${selectedBatchId}/korean/review-items`).then((data) => {
          const questionProblems = data.items.map(questionProblemFromItem).filter((problem): problem is Problem => Boolean(problem));
          return { items: data.items, problems: questionProblems };
        })
      : fetchAllProblems(selectedBatchId).then((data) => ({
          items: data.map((problem) => ({ item_type: "question" as const, id: problem.id, problem })),
          problems: data,
        }));
    load
      .then((data) => {
        if (cancelled) return;
        setKoreanReviewItems(isKoreanBatch ? data.items : []);
        setProblems(data.problems);
        setCurrentId((currentValue) => {
          if (currentValue && data.items.some((item) => reviewItemId(item) === currentValue)) return currentValue;
          const next = data.items.find(reviewItemNeedsReview) || data.items[0];
          return next ? reviewItemId(next) : null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setProblems([]);
          setKoreanReviewItems([]);
          setCurrentId(null);
          setError("문항 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProblems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isKoreanBatch, selectedBatchId]);

  useEffect(() => {
    if (currentPassage) {
      loadedProblemIdRef.current = null;
      setCurrent(null);
      setMetadata(emptyMetadata);
      setProblemTextDraft("");
      setPassageDraft({
        passage_instruction: currentPassage.passage_instruction || "",
        passage_title: currentPassage.passage_title || "",
        passage_text: currentPassage.passage_text || "",
        passage_type: currentPassage.passage_type || "",
      });
      setSolutionOpen(true);
      setRawOpen(false);
      setSaveState("idle");
      setSavedVisualUrl(null);
      setDeletingVisual(false);
      setLoadingCurrent(false);
      return;
    }
    if (!currentListItem?.id) {
      loadedProblemIdRef.current = null;
      setCurrent(null);
      setMetadata(emptyMetadata);
      setProblemTextDraft("");
      setPassageDraft({ passage_instruction: "", passage_title: "", passage_text: "", passage_type: "" });
      setSaveState("idle");
      setSavedVisualUrl(null);
      setDeletingVisual(false);
      return;
    }

    let cancelled = false;
    setLoadingCurrent(true);
    setError(null);
    api<Problem>(`/api/problems/${currentListItem.id}`)
      .then((problem) => {
        if (cancelled) return;
        loadedProblemIdRef.current = problem.id;
        setCurrent(problem);
        setMetadata(metadataFromProblem(problem, selectedBatch));
        setProblemTextDraft(problem.problem_text || "");
        setPassageDraft({ passage_instruction: "", passage_title: "", passage_text: "", passage_type: "" });
        setSolutionOpen(true);
        setRawOpen(false);
        setSaveState("idle");
        setSavedVisualUrl(null);
        setDeletingVisual(false);
      })
      .catch(() => {
        if (!cancelled) setError("현재 문항을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCurrent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentListItem?.id, currentPassage, selectedBatch]);

  useEffect(() => {
    if (!current || current.id !== loadedProblemIdRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveMetadataNow(current, metadata);
    }, 800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [current, metadata, saveMetadataNow]);

  useEffect(() => {
    latestProblemTextDraftRef.current = problemTextDraft;
  }, [problemTextDraft]);

  useEffect(() => {
    if (problemTextSaveTimerRef.current) {
      window.clearTimeout(problemTextSaveTimerRef.current);
      problemTextSaveTimerRef.current = null;
    }
    if (!current || current.id !== loadedProblemIdRef.current) return;
    if (problemTextDraft === (current.problem_text || "")) return;
    if (!problemTextDraft.trim()) return;

    problemTextSaveTimerRef.current = window.setTimeout(() => {
      void saveProblemTextNow(current, problemTextDraft);
    }, 800);

    return () => {
      if (problemTextSaveTimerRef.current) {
        window.clearTimeout(problemTextSaveTimerRef.current);
        problemTextSaveTimerRef.current = null;
      }
    };
  }, [current, problemTextDraft, saveProblemTextNow]);

  const selectBatch = useCallback(
    async (batchId: string) => {
      if (batchId === selectedBatchId) {
        setBatchMenuOpen(false);
        return;
      }
      const textSaved = await saveProblemTextNow();
      if (!textSaved) return;
      await flushPendingSave();
      setSelectedBatchId(batchId);
      setCurrentId(null);
      setBatchMenuOpen(false);
      setSaveState("idle");
    },
    [flushPendingSave, saveProblemTextNow, selectedBatchId],
  );

  const moveToIndex = useCallback(
    async (nextIndex: number) => {
      if (!reviewItems.length) return;
      const textSaved = await saveProblemTextNow();
      if (!textSaved) return;
      await flushPendingSave();
      const bounded = Math.max(0, Math.min(reviewItems.length - 1, nextIndex));
      setCurrentId(reviewItemId(reviewItems[bounded]));
    },
    [flushPendingSave, reviewItems, saveProblemTextNow],
  );

  const openProblemById = useCallback(
    async (problemId: string) => {
      const nextIndex = reviewItems.findIndex((item) => reviewItemId(item) === problemId);
      if (nextIndex < 0) return;
      await moveToIndex(nextIndex);
    },
    [moveToIndex, reviewItems],
  );

  const movePrevious = useCallback(() => {
    void moveToIndex(currentIndex - 1);
  }, [currentIndex, moveToIndex]);

  const moveNext = useCallback(() => {
    void moveToIndex(currentIndex + 1);
  }, [currentIndex, moveToIndex]);

  const updateMetadataField = useCallback((field: MetadataField, value: string) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
      auto_filled: { ...prev.auto_filled, [field]: false },
    }));
  }, []);

  const releaseAutofill = useCallback((field: MetadataField) => {
    setMetadata((prev) => ({ ...prev, auto_filled: { ...prev.auto_filled, [field]: false } }));
  }, []);

  const toggleDifficulty = useCallback((difficulty: Difficulty) => {
    setMetadata((prev) => ({ ...prev, difficulty: prev.difficulty === difficulty ? "" : difficulty }));
  }, []);

  const saveCurrentPassage = useCallback(async () => {
    if (!currentPassage || !selectedBatchId || savingPassage) return true;
    if (!passageDraft.passage_text.trim()) {
      setSaveState("error");
      setError("지문 본문을 비워둘 수 없습니다.");
      return false;
    }
    if (!passageDraftDirty) return true;

    setSavingPassage(true);
    setSaveState("saving");
    setError(null);
    try {
      const updated = await api<Partial<KoreanReviewPassageItem>>(`/api/batches/${selectedBatchId}/korean/passages/${currentPassage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passageDraft),
      });
      const wasPending = currentPassage.needs_review;
      const updatedItem = {
        ...currentPassage,
        passage_instruction: updated.passage_instruction ?? passageDraft.passage_instruction,
        passage_title: updated.passage_title ?? passageDraft.passage_title,
        passage_text: updated.passage_text ?? passageDraft.passage_text,
        passage_type: updated.passage_type ?? passageDraft.passage_type,
        needs_review: updated.needs_review ?? true,
      };
      setKoreanReviewItems((items) =>
        items.map((item) => item.item_type === "passage" && item.id === currentPassage.id ? updatedItem : item),
      );
      if (!wasPending && updatedItem.needs_review) {
        setBatches((prev) =>
          prev.map((batch) =>
            batch.id === selectedBatchId
              ? { ...batch, pending_review_item_count: (batch.pending_review_item_count ?? batch.review_count ?? 0) + 1 }
              : batch,
          ),
        );
      }
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("error");
      setError("지문 저장에 실패했습니다.");
      return false;
    } finally {
      setSavingPassage(false);
    }
  }, [currentPassage, passageDraft, passageDraftDirty, savingPassage, selectedBatchId]);

  const markReviewedAndNext = useCallback(async () => {
    if (!currentReviewItem || busyAction) return;
    if (currentReviewItem.item_type === "passage") {
      const passageSaved = await saveCurrentPassage();
      if (!passageSaved) return;
    } else {
      const textSaved = await saveProblemTextNow();
      if (!textSaved) return;
      await flushPendingSave();
    }
    setBusyAction("review");
    setSaveState("saving");
    setError(null);
    try {
      if (currentReviewItem.item_type === "passage") {
        await api(`/api/batches/${selectedBatchId}/korean/passages/${currentReviewItem.id}/review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ needs_review: false }),
        });
        const updatedItems = reviewItems.map((item) =>
          item.item_type === "passage" && item.id === currentReviewItem.id ? { ...item, needs_review: false } : item,
        );
        setKoreanReviewItems((items) =>
          items.map((item) => item.item_type === "passage" && item.id === currentReviewItem.id ? { ...item, needs_review: false } : item),
        );
        setBatches((prev) =>
          prev.map((batch) =>
            batch.id === selectedBatchId
              ? { ...batch, pending_review_item_count: Math.max((batch.pending_review_item_count ?? batch.review_count ?? 0) - (currentReviewItem.needs_review ? 1 : 0), 0) }
              : batch,
          ),
        );
        const next = findNextUnreviewedItem(updatedItems, currentIndex);
        setCurrentId(next ? reviewItemId(next) : null);
        setSaveState("saved");
        return;
      }
      if (!current) return;
      await api<Problem>(`/api/problems/${current.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needs_review: false }),
      });

      const updatedProblems = problems.map((problem) => (problem.id === current.id ? { ...problem, needs_review: false } : problem));
      const updatedItems = reviewItems.map((item) =>
        item.item_type === "question" && item.problem.id === current.id ? { ...item, problem: { ...item.problem, needs_review: false } } : item,
      );
      setProblems(updatedProblems);
      if (isKoreanBatch) {
        setKoreanReviewItems((items) =>
          items.map((item) => item.item_type === "question" && item.problem.id === current.id ? { ...item, problem: { ...item.problem, needs_review: false } } : item),
        );
      }
      setCurrent((prev) => (prev ? { ...prev, needs_review: false } : prev));
      setBatches((prev) =>
        prev.map((batch) =>
          batch.id === selectedBatchId
            ? {
                ...batch,
                review_count: Math.max((batch.review_count || 0) - 1, 0),
                pending_review_item_count: Math.max((batch.pending_review_item_count ?? batch.review_count ?? 0) - 1, 0),
              }
            : batch,
        ),
      );
      const next = isKoreanBatch ? findNextUnreviewedItem(updatedItems, currentIndex) : findNextUnreviewed(updatedProblems, currentIndex);
      setCurrentId(next ? (isKoreanBatch ? reviewItemId(next as KoreanReviewItem) : (next as Problem).id) : null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setError("검토 완료 처리에 실패했습니다.");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, current, currentIndex, currentReviewItem, flushPendingSave, isKoreanBatch, koreanReviewItems, problems, reviewItems, saveCurrentPassage, saveProblemTextNow, selectedBatchId]);

  const markSelectedReviewed = useCallback(async () => {
    if (!selectedProblemIds.length || busyAction) return;
    const selectedSet = new Set(selectedProblemIds);
    const targets = reviewItems.filter((item) => selectedSet.has(reviewItemId(item)) && reviewItemNeedsReview(item));
    if (!targets.length) {
      setSelectedProblemIds([]);
      return;
    }
    const questionTargets = targets
      .map(questionProblemFromItem)
      .filter((problem): problem is Problem => Boolean(problem));
    const passageTargets = targets.filter((item): item is KoreanReviewPassageItem => item.item_type === "passage");
    if (currentReviewItem?.item_type === "passage" && selectedSet.has(reviewItemId(currentReviewItem))) {
      const passageSaved = await saveCurrentPassage();
      if (!passageSaved) return;
    } else {
      const textSaved = await saveProblemTextNow();
      if (!textSaved) return;
      await flushPendingSave();
    }
    setBusyAction("review");
    setSaveState("saving");
    setError(null);
    try {
      await Promise.all(
        questionTargets.map((problem) =>
          api<Problem>(`/api/problems/${problem.id}/review`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ needs_review: false }),
          }),
        ),
      );
      await Promise.all(
        passageTargets.map((passage) =>
          api(`/api/batches/${selectedBatchId}/korean/passages/${passage.id}/review`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ needs_review: false }),
          }),
        ),
      );

      const updatedProblems = problems.map((problem) =>
        selectedSet.has(problem.id) ? { ...problem, needs_review: false } : problem,
      );
      const updatedItems = reviewItems.map((item) => {
        const id = reviewItemId(item);
        if (!selectedSet.has(id)) return item;
        if (item.item_type === "passage") return { ...item, needs_review: false };
        return { ...item, problem: { ...item.problem, needs_review: false } };
      });
      setProblems(updatedProblems);
      if (isKoreanBatch) {
        setKoreanReviewItems((items) =>
          items.map((item) => {
            const id = reviewItemId(item);
            if (!selectedSet.has(id)) return item;
            if (item.item_type === "passage") return { ...item, needs_review: false };
            return { ...item, problem: { ...item.problem, needs_review: false } };
          }),
        );
      }
      setCurrent((prev) => (prev && selectedSet.has(prev.id) ? { ...prev, needs_review: false } : prev));
      setBatches((prev) =>
        prev.map((batch) =>
          batch.id === selectedBatchId
            ? {
                ...batch,
                review_count: Math.max((batch.review_count || 0) - questionTargets.length, 0),
                pending_review_item_count: Math.max((batch.pending_review_item_count ?? batch.review_count ?? 0) - targets.length, 0),
              }
            : batch,
        ),
      );
      if (currentReviewItem && selectedSet.has(reviewItemId(currentReviewItem))) {
        const next = isKoreanBatch ? findNextUnreviewedItem(updatedItems, currentIndex) : findNextUnreviewed(updatedProblems, currentIndex);
        setCurrentId(next ? (isKoreanBatch ? reviewItemId(next as KoreanReviewItem) : (next as Problem).id) : null);
      }
      setSelectedProblemIds([]);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setError("선택한 문항의 검토 완료 처리에 실패했습니다.");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, currentReviewItem, currentIndex, flushPendingSave, isKoreanBatch, problems, reviewItems, saveCurrentPassage, saveProblemTextNow, selectedBatchId, selectedProblemIds]);

  const requestReextract = useCallback(async () => {
    if (!current || busyAction) return;
    const ok = window.confirm("현재 문항 전체를 원본 페이지 기준으로 다시 추출할까요?");
    if (!ok) return;
    setBusyAction("reextract");
    setError(null);
    try {
      const updated = await api<Problem>(`/api/problems/${current.id}/reextract`, { method: "POST" });
      loadedProblemIdRef.current = updated.id;
      setCurrent(updated);
      setProblemTextDraft(updated.problem_text || "");
      setMetadata(metadataFromProblem(updated, selectedBatch));
      setProblems((prev) => prev.map((problem) => (problem.id === updated.id ? { ...problem, ...updated } : problem)));
      setSaveState("saved");
    } catch {
      setError("재추출에 실패했습니다. 원본 페이지 이미지 또는 AI 설정을 확인해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, current, selectedBatch]);

  const requestTrash = useCallback(async () => {
    if (!current || busyAction) return;
    const ok = window.confirm("현재 문항을 휴지통으로 이동할까요?");
    if (!ok) return;
    setBusyAction("trash");
    setError(null);
    try {
      await api<void>(`/api/problems/${current.id}`, { method: "DELETE" });
      const updatedProblems = problems.filter((problem) => problem.id !== current.id);
      setProblems(updatedProblems);
      setBatches((prev) =>
        prev.map((batch) =>
          batch.id === selectedBatchId
            ? {
                ...batch,
                problem_count: Math.max((batch.problem_count || 0) - 1, 0),
                review_count: current.needs_review ? Math.max((batch.review_count || 0) - 1, 0) : batch.review_count,
              }
            : batch,
        ),
      );
      const next = updatedProblems[Math.min(Math.max(currentIndex, 0), Math.max(updatedProblems.length - 1, 0))];
      setCurrentId(next?.id || null);
      setSaveState("idle");
    } catch {
      setError("문항을 휴지통으로 이동하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, current, currentIndex, problems, selectedBatchId]);

  const deleteSavedVisual = useCallback(async () => {
    if (!current || !savedVisualUrl || busyAction || deletingVisual) return;
    setDeletingVisual(true);
    setSaveState("saving");
    setError(null);
    try {
      const updated = await api<Problem>(`/api/problems/${current.id}/visual`, { method: "DELETE" });
      setCurrent(updated);
      setProblems((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSavedVisualUrl(null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setError("시각자료 삭제에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setDeletingVisual(false);
    }
  }, [busyAction, current, deletingVisual, savedVisualUrl]);

  useReviewHotkeys({
    enabled: Boolean(currentReviewItem),
    shortcutsPaused: helpOpen,
    onComplete: () => void markReviewedAndNext(),
    onNext: moveNext,
    onPrevious: movePrevious,
    onDifficulty: toggleDifficulty,
    onToggleSolution: () => setSolutionOpen((value) => !value),
    onRequestReextract: () => void requestReextract(),
    onRequestTrash: () => void requestTrash(),
    onToggleHelp: () => setHelpOpen((value) => !value),
    onToggleBatchSelector: () => setBatchMenuOpen((value) => !value),
  });

  const manualRetry = useCallback(() => {
    if (currentPassage) void saveCurrentPassage();
    else void saveMetadataNow();
  }, [currentPassage, saveCurrentPassage, saveMetadataNow]);

  const reviewReady = Boolean(selectedBatchId && currentReviewItem && (!loadingCurrent || currentPassage));
  const problemTextDirty = Boolean(current && problemTextDraft !== (current.problem_text || ""));
  const currentPageProblems = useMemo(() => {
    const pageNumber = current?.review_page_number || currentPassage?.review_page_number || currentListItem?.review_page_number;
    if (!pageNumber) return current ? [current] : [];
    const byId = new Map<string, Problem>();
    problems
      .filter((problem) => problem.review_page_number === pageNumber)
      .forEach((problem) => byId.set(problem.id, problem));
    if (current?.review_page_number === pageNumber) byId.set(current.id, current);
    return Array.from(byId.values()).sort((left, right) => {
      if (left.problem_number !== right.problem_number) return left.problem_number - right.problem_number;
      return left.id.localeCompare(right.id);
    });
  }, [current, currentListItem?.review_page_number, currentPassage?.review_page_number, problems]);

  return (
    <div className="min-w-0 space-y-4">
      <ReviewStatusBar
        batches={batches.filter((batch) => (batch.review_item_count ?? batch.problem_count) > 0)}
        selectedBatch={selectedBatch}
        batchMenuOpen={batchMenuOpen}
        setBatchMenuOpen={setBatchMenuOpen}
        onSelectBatch={(batchId) => void selectBatch(batchId)}
        loadingBatches={loadingBatches}
        progressLabel={formatProgress(reviewedCount, totalCount)}
        progressPercent={progressPercent}
        saveState={saveState}
        onRetrySave={manualRetry}
        onOpenHelp={() => setHelpOpen(true)}
        onComplete={() => void markReviewedAndNext()}
        completeDisabled={!reviewReady || busyAction === "review"}
        pendingCount={pendingCount}
      />

      {selectedBatchId && reviewItems.length && !loadingProblems ? (
        <ReviewProblemSelector
          items={reviewItems}
          currentId={currentId}
          selectedIds={selectedProblemIds}
          onSelectionChange={setSelectedProblemIds}
          onOpenProblem={(problemId) => void openProblemById(problemId)}
          onMarkSelectedReviewed={() => void markSelectedReviewed()}
          markingSelected={busyAction === "review"}
        />
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!selectedBatchId && !loadingBatches ? (
        <EmptyState title="검토할 배치를 선택해 주세요" description="상단 배치 선택에서 업로드된 배치를 고르면 첫 미검토 문항부터 바로 시작합니다." />
      ) : loadingProblems ? (
        <EmptyState loading title="문항 목록을 불러오는 중" description="배치 안의 문항을 검토 순서로 정렬하고 있습니다." />
      ) : !currentId ? (
        <EmptyState
          title="이 배치의 검토가 끝났습니다"
          description="남은 미검토 문항이 없습니다. 다른 배치를 선택하거나 문항 아카이브에서 전체 문항을 확인할 수 있습니다."
          actionHref={selectedBatchId ? `/problems?batch_id=${selectedBatchId}` : "/problems"}
          actionLabel="문항 아카이브 보기"
        />
      ) : (
        <div className="grid min-h-[calc(100vh-190px)] gap-4 xl:grid-cols-2">
          <OriginalPagePanel
            problem={current || currentPassage}
            loading={loadingCurrent}
            pageProblems={currentPageProblems}
            currentProblemId={currentId}
            cropProblemId={current?.id || null}
            onOpenProblem={(problemId) => void openProblemById(problemId)}
            onVisualSaved={(updated) => {
              setCurrent(updated);
              setProblems((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
              setSavedVisualUrl(updated.visual_url || null);
              setSaveState("saved");
            }}
          />
          {currentPassage ? (
            <PassageReviewPanel
              passage={currentPassage}
              draft={passageDraft}
              dirty={passageDraftDirty}
              saving={savingPassage}
              onDraftChange={setPassageDraft}
              onSave={() => void saveCurrentPassage()}
            />
          ) : (
            <ExtractionPanel
              problem={current}
              loading={loadingCurrent}
              problemTextDraft={problemTextDraft}
              problemTextDirty={problemTextDirty}
              savingProblemText={savingProblemText}
              metadata={metadata}
              facets={facets}
              solutionOpen={solutionOpen}
              rawOpen={rawOpen}
              setRawOpen={setRawOpen}
              setSolutionOpen={setSolutionOpen}
              onProblemTextChange={setProblemTextDraft}
              onProblemTextSave={() => void saveProblemTextNow()}
              onMetadataChange={updateMetadataField}
              onReleaseAutofill={releaseAutofill}
              onDifficulty={toggleDifficulty}
              onReextract={() => void requestReextract()}
              onTrash={() => void requestTrash()}
              reextracting={busyAction === "reextract"}
              trashing={busyAction === "trash"}
              savedVisualUrl={savedVisualUrl}
              deletingVisual={deletingVisual}
              onVisualDelete={() => void deleteSavedVisual()}
            />
          )}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-300">⌨</span> Enter 완료·다음, ←→ 이동, 1·2·3·4 난이도, Space 해설, R 재추출, Delete 휴지통, ? 도움말
      </div>

      <HotkeyHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

export default function ProblemReviewPage() {
  return (
    <Suspense fallback={<EmptyState loading title="검토 화면 준비 중" description="배치와 문항 정보를 불러오고 있습니다." />}>
      <ProblemReviewClient />
    </Suspense>
  );
}

function ReviewStatusBar({
  batches,
  selectedBatch,
  batchMenuOpen,
  setBatchMenuOpen,
  onSelectBatch,
  loadingBatches,
  progressLabel,
  progressPercent,
  saveState,
  onRetrySave,
  onOpenHelp,
  onComplete,
  completeDisabled,
  pendingCount,
}: {
  batches: Batch[];
  selectedBatch: Batch | null;
  batchMenuOpen: boolean;
  setBatchMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  onSelectBatch: (batchId: string) => void;
  loadingBatches: boolean;
  progressLabel: string;
  progressPercent: number;
  saveState: SaveState;
  onRetrySave: () => void;
  onOpenHelp: () => void;
  onComplete: () => void;
  completeDisabled: boolean;
  pendingCount: number;
}) {
  return (
    <div className="sticky top-[65px] z-30 flex min-h-14 flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#0b0a12]/95 px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="relative">
        <button
          type="button"
          className="flex h-10 min-w-[250px] max-w-[360px] items-center justify-between gap-3 rounded-[7px] border border-white/10 bg-white/[0.05] px-3 text-left text-sm text-slate-100 hover:border-violet-300/35"
          onClick={() => setBatchMenuOpen((value) => !value)}
          aria-expanded={batchMenuOpen}
        >
          <span className="min-w-0 truncate">
            <span className="mr-2 text-xs text-slate-500">배치</span>
            {loadingBatches ? "불러오는 중" : selectedBatch?.name || "선택 필요"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
        {batchMenuOpen ? (
          <div className="absolute left-0 top-12 z-40 max-h-[360px] w-[420px] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-white/10 bg-[#0a0911] p-2 shadow-2xl">
            {batches.length ? (
              batches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[7px] px-3 py-2 text-left text-sm transition hover:bg-white/[0.07]",
                    selectedBatch?.id === batch.id && "bg-violet-400/14 text-violet-100",
                  )}
                  onClick={() => onSelectBatch(batch.id)}
                >
                  {(() => {
                    const itemCount = batch.review_item_count ?? batch.problem_count;
                    const pendingItems = batch.pending_review_item_count ?? batch.review_count;
                    return (
                      <>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{batch.name}</span>
                    <span className="text-xs text-slate-500">
                      전체 {itemCount.toLocaleString("ko-KR")} · 대기 {pendingItems.toLocaleString("ko-KR")}
                    </span>
                  </span>
                  <Badge variant={pendingItems > 0 ? "warning" : "success"}>{pendingItems} 대기</Badge>
                      </>
                    );
                  })()}
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-slate-500">검토 가능한 배치가 없습니다.</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2">
        <span className="text-sm font-semibold text-slate-100">{progressLabel}</span>
        <div className="h-2 w-[180px] overflow-hidden rounded-full bg-white/10" aria-label="검토 진행률">
          <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="text-xs text-slate-500">{pendingCount.toLocaleString("ko-KR")} 남음</span>
      </div>

      <SaveStateIndicator state={saveState} onRetry={onRetrySave} />

      <div className="flex items-center gap-2 rounded-[7px] border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs text-slate-400">
        <Users className="h-3.5 w-3.5" />
        <span>협업자 없음</span>
        {/* TODO: Wire presence avatars when a batch presence endpoint exists. */}
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 text-xs text-slate-500">
        <span>← 이전</span>
        <span>R 재추출</span>
        <span>⌫ 휴지통</span>
        <button type="button" className="inline-flex items-center gap-1 hover:text-slate-300" onClick={onOpenHelp}>
          <HelpCircle className="h-3.5 w-3.5" /> ?
        </button>
      </div>

      <Button className="ml-auto h-10 shrink-0" onClick={onComplete} disabled={completeDisabled}>
        <CheckCircle2 className="h-4 w-4" />
        검토 완료 후 다음
        <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px]">↵</kbd>
      </Button>
    </div>
  );
}

function SaveStateIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const config = {
    idle: { color: "bg-slate-500", label: "대기 중" },
    saving: { color: "bg-slate-400", label: "저장 중..." },
    saved: { color: "bg-emerald-400", label: "저장됨" },
    error: { color: "bg-red-400", label: "저장 실패" },
  }[state];
  return (
    <div className="flex items-center gap-2 rounded-[7px] border border-white/10 bg-white/[0.035] px-3 py-2 text-sm">
      {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" /> : <span className={cn("h-2 w-2 rounded-full", config.color)} />}
      <span className={state === "error" ? "text-red-200" : "text-slate-200"}>{config.label}</span>
      {state === "error" ? (
        <button type="button" className="text-xs font-semibold text-violet-200 hover:text-violet-100" onClick={onRetry}>
          재시도
        </button>
      ) : null}
    </div>
  );
}

function sameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const lookup = new Set(left);
  return right.every((id) => lookup.has(id));
}

function ReviewProblemSelector({
  items,
  currentId,
  selectedIds,
  onSelectionChange,
  onOpenProblem,
  onMarkSelectedReviewed,
  markingSelected,
}: {
  items: KoreanReviewItem[];
  currentId: string | null;
  selectedIds: string[];
  onSelectionChange: Dispatch<SetStateAction<string[]>>;
  onOpenProblem: (itemId: string) => void;
  onMarkSelectedReviewed: () => void;
  markingSelected: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const clickProblemIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const selectedIdsRef = useRef(selectedIds);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [dragBox, setDragBox] = useState<SelectionBox | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [suppressClick, setSuppressClick] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const currentIndex = useMemo(() => items.findIndex((item) => reviewItemId(item) === currentId), [items, currentId]);
  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;
  const selectedNeedsReviewCount = useMemo(
    () => items.filter((item) => selectedSet.has(reviewItemId(item)) && reviewItemNeedsReview(item)).length,
    [items, selectedSet],
  );
  const pendingCount = useMemo(() => items.filter(reviewItemNeedsReview).length, [items]);

  function moveBy(delta: number) {
    if (!items.length) return;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.min(items.length - 1, Math.max(0, baseIndex + delta));
    const next = items[nextIndex];
    if (next) onOpenProblem(reviewItemId(next));
  }

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  function toggleSelection(itemId: string, checked?: boolean) {
    onSelectionChange((currentIds) => {
      const shouldSelect = checked ?? !currentIds.includes(itemId);
      if (shouldSelect) return currentIds.includes(itemId) ? currentIds : [...currentIds, itemId];
      return currentIds.filter((id) => id !== itemId);
    });
  }

  function selectItemsInViewportBox(box: SelectionBox) {
    const selectionRect = {
      left: box.x,
      right: box.x + box.width,
      top: box.y,
      bottom: box.y + box.height,
    };
    const nextIds = items
      .filter((item) => {
        const element = itemRefs.current[reviewItemId(item)];
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.left < selectionRect.right && rect.right > selectionRect.left && rect.top < selectionRect.bottom && rect.bottom > selectionRect.top;
      })
      .map(reviewItemId);
    if (sameIdSet(nextIds, selectedIdsRef.current)) return;
    selectedIdsRef.current = nextIds;
    onSelectionChange(nextIds);
  }

  function updateDragBox(currentX: number, currentY: number) {
    const container = containerRef.current;
    const start = dragStartRef.current;
    if (!container || !start) return;
    const rect = container.getBoundingClientRect();
    const viewportBox = {
      x: Math.min(start.x, currentX),
      y: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    };
    const localBox = {
      x: viewportBox.x - rect.left + container.scrollLeft,
      y: viewportBox.y - rect.top + container.scrollTop,
      width: viewportBox.width,
      height: viewportBox.height,
    };
    setDragBox(localBox);
    selectItemsInViewportBox(viewportBox);
  }

  function scheduleDragUpdate(currentX: number, currentY: number) {
    pendingPointerRef.current = { x: currentX, y: currentY };
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const point = pendingPointerRef.current;
      if (!point) return;
      updateDragBox(point.x, point.y);
    });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-review-selector-control='true']")) return;
    clickProblemIdRef.current = target.closest<HTMLElement>("[data-review-problem-card-id]")?.dataset.reviewProblemCardId || null;
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClickRef.current = false;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    setDragBox(null);
    setIsDragSelecting(false);
    pendingPointerRef.current = null;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 8 && !isDragSelecting) return;
    clickProblemIdRef.current = null;
    if (!isDragSelecting) {
      setIsDragSelecting(true);
      suppressClickRef.current = true;
      setSuppressClick(true);
    }
    scheduleDragUpdate(event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;
    const clickProblemId = clickProblemIdRef.current;
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    pendingPointerRef.current = null;
    if (isDragSelecting) {
      updateDragBox(event.clientX, event.clientY);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
        setSuppressClick(false);
      }, 120);
    } else if (clickProblemId) {
      onOpenProblem(clickProblemId);
    }
    dragStartRef.current = null;
    clickProblemIdRef.current = null;
    setIsDragSelecting(false);
    setDragBox(null);
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className={cn("flex flex-wrap items-center justify-between gap-3", expanded && "mb-3")}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-white">검토 항목 선택</h2>
          <span className="rounded-[6px] border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-slate-300">
            {currentItem ? `${currentIndex + 1}/${items.length} · ${currentItem.item_type === "passage" ? "지문" : `#${currentItem.problem.problem_number}`}` : `0/${items.length}`}
          </span>
          <span className="rounded-[6px] border border-amber-300/15 bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-100">
            대기 {pendingCount.toLocaleString("ko-KR")}
          </span>
          {(currentItem?.item_type === "passage" ? currentItem.review_page_number : currentItem?.problem.review_page_number) ? (
            <span className="rounded-[6px] border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-slate-400">
              {currentItem?.item_type === "passage" ? currentItem.review_page_number : currentItem?.problem.review_page_number}p
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedIds.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[7px] border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-sm text-violet-100">
              <CheckSquare className="h-4 w-4" />
              <span className="font-semibold">{selectedIds.length}개 선택됨</span>
              <Button size="sm" disabled={markingSelected || selectedNeedsReviewCount === 0} onClick={onMarkSelectedReviewed}>
                {markingSelected ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                선택 검토 완료
              </Button>
              <button type="button" className="px-1 text-xs font-semibold text-slate-400 hover:text-white" onClick={() => onSelectionChange([])}>
                선택 해제
              </button>
            </div>
          ) : null}
          <Button size="sm" variant="outline" disabled={currentIndex <= 0} onClick={() => moveBy(-1)}>
            이전
          </Button>
          <Button size="sm" variant="outline" disabled={currentIndex < 0 || currentIndex >= items.length - 1} onClick={() => moveBy(1)}>
            다음
          </Button>
          <Button size="sm" variant={expanded ? "secondary" : "outline"} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
            {expanded ? "접기" : "전체 보기"}
          </Button>
        </div>
      </div>
      <div className="hidden">
        <div>
          <h2 className="text-sm font-bold text-white">검토 항목 선택</h2>
        </div>
        {selectedIds.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[7px] border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-sm text-violet-100">
            <CheckSquare className="h-4 w-4" />
            <span className="font-semibold">{selectedIds.length}개 선택됨</span>
            <Button size="sm" disabled={markingSelected || selectedNeedsReviewCount === 0} onClick={onMarkSelectedReviewed}>
              {markingSelected ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              선택 검토 완료
            </Button>
            <button type="button" className="px-1 text-xs font-semibold text-slate-400 hover:text-white" onClick={() => onSelectionChange([])}>
              선택 해제
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className={cn("relative max-h-[170px] select-none overflow-auto rounded-lg border border-white/10 bg-black/20 p-2", !expanded && "hidden")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {dragBox ? (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-violet-300 bg-violet-400/15"
            style={{ left: dragBox.x, top: dragBox.y, width: dragBox.width, height: dragBox.height }}
          />
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {items.map((item) => {
            const itemId = reviewItemId(item);
            const selected = selectedSet.has(itemId);
            const current = itemId === currentId;
            const isPassage = item.item_type === "passage";
            const problem = questionProblemFromItem(item);
            const itemNeedsReview = reviewItemNeedsReview(item);
            const title = isPassage ? (item.passage_title || item.passage_instruction || "지문") : `#${problem?.problem_number || "-"}`;
            const subtitle = isPassage
              ? `${item.linked_questions.length.toLocaleString("ko-KR")}문항 연결`
              : `${problem?.review_page_number ? `${problem.review_page_number}p · ` : ""}${problem?.tags?.subject || "과목 미지정"}`;
            return (
              <article
                key={itemId}
                ref={(element) => { itemRefs.current[itemId] = element; }}
                data-review-problem-card-id={itemId}
                role="button"
                tabIndex={0}
                aria-label={`${isPassage ? "지문" : `${problem?.problem_number || ""}번 문항`} 검토로 이동`}
                className={cn(
                  "relative cursor-pointer rounded-[7px] border bg-white/[0.04] p-2 pl-9 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
                  current && "border-violet-300/60 bg-violet-400/12",
                  selected && "border-sky-300/60 bg-sky-400/12",
                  !current && !selected && "border-white/10 hover:border-white/20 hover:bg-white/[0.07]",
                )}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (suppressClick || suppressClickRef.current) return;
                  onOpenProblem(itemId);
                }}
              >
                <label
                  data-review-selector-control="true"
                  className="absolute left-2 top-2 grid h-5 w-5 place-items-center rounded border border-white/15 bg-black/25"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-violet-400"
                    checked={selected}
                    onChange={(event) => toggleSelection(itemId, event.target.checked)}
                    aria-label={`${isPassage ? "지문" : `${problem?.problem_number || ""}번 문항`} 선택`}
                  />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-bold text-white">{title}</span>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", itemNeedsReview ? "bg-amber-300/12 text-amber-100" : "bg-emerald-300/12 text-emerald-100")}>
                    {itemNeedsReview ? "대기" : "완료"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                  {isPassage ? "국어 지문 · " : ""}
                  {subtitle}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PassageReviewPanel({
  passage,
  draft,
  dirty,
  saving,
  onDraftChange,
  onSave,
}: {
  passage: KoreanReviewPassageItem;
  draft: PassageDraft;
  dirty: boolean;
  saving: boolean;
  onDraftChange: Dispatch<SetStateAction<PassageDraft>>;
  onSave: () => void;
}) {
  function updateField(field: keyof PassageDraft, value: string) {
    onDraftChange((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="flex min-h-[680px] flex-col gap-3 rounded-lg border border-sky-300/20 bg-sky-400/[0.045] p-3">
      <div className="rounded-lg border border-sky-300/20 bg-[#0e1220]">
        <div className="flex items-center justify-between gap-3 border-b border-sky-300/15 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">국어 지문</h2>
            <Badge variant={passage.needs_review ? "error" : "success"}>{passage.needs_review ? "검토 필요" : "검토 완료"}</Badge>
            {dirty ? <Badge variant="warning">수정 중</Badge> : null}
          </div>
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving || !draft.passage_text.trim() || !dirty}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </Button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-400">지문 유형</span>
            <Input value={draft.passage_type} onChange={(event) => updateField("passage_type", event.target.value)} placeholder="문학, 독서, 화법과 작문 등" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-400">제목</span>
            <Input value={draft.passage_title} onChange={(event) => updateField("passage_title", event.target.value)} placeholder="지문 제목" />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-400">안내문</span>
            <Input value={draft.passage_instruction} onChange={(event) => updateField("passage_instruction", event.target.value)} placeholder="[1~3] 다음 글을 읽고 물음에 답하시오." />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-400">본문</span>
            <textarea
              className="min-h-[420px] w-full resize-y rounded-[7px] border border-white/10 bg-black/35 p-3 text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300/60 focus:ring-2 focus:ring-sky-400/15"
              value={draft.passage_text}
              onChange={(event) => updateField("passage_text", event.target.value)}
              placeholder="지문 본문"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#11101a] p-4">
        <div className="mb-3 text-sm font-bold text-white">연결 문항</div>
        {passage.linked_questions.length ? (
          <div className="flex flex-wrap gap-2">
            {passage.linked_questions.map((question) => (
              <span key={question.question_id} className="rounded-[7px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                #{question.problem_number || question.question_number}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">연결된 문항이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function OriginalPagePanel({
  problem,
  loading,
  pageProblems,
  currentProblemId,
  cropProblemId,
  onOpenProblem,
  onVisualSaved,
}: {
  problem: OriginalPageTarget | null;
  loading: boolean;
  pageProblems: Problem[];
  currentProblemId: string | null;
  cropProblemId: string | null;
  onOpenProblem: (problemId: string) => void;
  onVisualSaved: (problem: Problem) => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [savingCrop, setSavingCrop] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const [pageSwitcherIntroVisible, setPageSwitcherIntroVisible] = useState(false);
  const [pageSwitcherHovered, setPageSwitcherHovered] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pageSwitcherTimerRef = useRef<number | null>(null);

  const imageUrl = problem?.review_page_image_url || null;

  useEffect(() => {
    setSelection(null);
    setDragStart(null);
    setCropError(null);
    setSavingCrop(false);
  }, [problem?.id]);

  useEffect(() => {
    if (pageSwitcherTimerRef.current) window.clearTimeout(pageSwitcherTimerRef.current);
    setPageSwitcherHovered(false);

    if (pageProblems.length <= 1) {
      setPageSwitcherIntroVisible(false);
      return undefined;
    }

    setPageSwitcherIntroVisible(true);
    pageSwitcherTimerRef.current = window.setTimeout(() => {
      setPageSwitcherIntroVisible(false);
      pageSwitcherTimerRef.current = null;
    }, 2600);

    return () => {
      if (pageSwitcherTimerRef.current) {
        window.clearTimeout(pageSwitcherTimerRef.current);
        pageSwitcherTimerRef.current = null;
      }
    };
  }, [currentProblemId, pageProblems.length]);

  function pointFromEvent(event: PointerEvent<HTMLDivElement>) {
    const image = imageRef.current;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(event.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(event.clientY - rect.top, rect.height)),
    };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageUrl || !cropProblemId || event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setDragStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setSelection({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      width: Math.abs(point.x - dragStart.x),
      height: Math.abs(point.y - dragStart.y),
    });
  }

  function onPointerUp() {
    setDragStart(null);
  }

  async function saveVisualCrop() {
    const image = imageRef.current;
    if (!cropProblemId || !image || !selection || selection.width <= 16 || selection.height <= 16) return;
    const rect = image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;

    setSavingCrop(true);
    setCropError(null);
    try {
      const updated = await api<Problem>(`/api/problems/${cropProblemId}/visual-crop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: Math.round(selection.x * scaleX),
          y: Math.round(selection.y * scaleY),
          width: Math.round(selection.width * scaleX),
          height: Math.round(selection.height * scaleY),
        }),
      });
      setSelection(null);
      onVisualSaved(updated);
    } catch (error) {
      setCropError(error instanceof Error ? error.message : "시각 자료 저장에 실패했습니다.");
    } finally {
      setSavingCrop(false);
    }
  }

  const showSelectionAction = cropProblemId && selection && selection.width > 16 && selection.height > 16;
  const pageSwitcherOpen = pageSwitcherIntroVisible || pageSwitcherHovered;

  return (
    <section className="flex min-h-[680px] flex-col rounded-lg border border-white/10 bg-white/[0.035]">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-white/10 px-4">
        <div>
          <h2 className="text-sm font-bold text-white">원본 페이지 p.{problem?.review_page_number || "-"}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="축소" onClick={() => setZoom((value) => Math.max(50, value - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(100)}>
            맞춤
          </Button>
          <Button size="icon" variant="outline" aria-label="확대" onClick={() => setZoom((value) => Math.min(180, value + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-start justify-center overflow-auto bg-[#07070c] p-4"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loading ? (
          <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            원본 페이지를 불러오는 중
          </div>
        ) : imageUrl ? (
          <div className="relative">
            <img
              ref={imageRef}
              src={assetUrl(imageUrl)}
              alt={`원본 페이지 ${problem?.review_page_number || ""}`}
              className="select-none rounded bg-white shadow-[0_18px_55px_rgba(0,0,0,0.42)]"
              style={{ width: `${zoom}%`, maxWidth: "none" }}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
            />
            {pageProblems.length > 1 ? (
              <div
                className="absolute right-3 top-3 z-10 min-h-9 w-48"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onMouseEnter={() => setPageSwitcherHovered(true)}
                onMouseLeave={() => setPageSwitcherHovered(false)}
                onFocusCapture={() => setPageSwitcherHovered(true)}
                onBlurCapture={() => setPageSwitcherHovered(false)}
              >
                <button
                  type="button"
                  aria-label="같은 페이지 문항 목록 열기"
                  className={cn(
                    "absolute right-0 top-0 rounded-full border border-white/10 bg-[#090912]/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300 shadow-xl backdrop-blur transition",
                    pageSwitcherOpen ? "pointer-events-none scale-95 opacity-0" : "opacity-70 hover:border-violet-300/40 hover:bg-violet-400/12 hover:text-white hover:opacity-100",
                  )}
                >
                  같은 페이지 {pageProblems.length}
                </button>
                <div
                  className={cn(
                    "flex max-h-[calc(100vh-16rem)] flex-col gap-1 overflow-auto rounded-lg border border-white/15 bg-[#090912]/88 p-2 shadow-2xl backdrop-blur transition duration-200",
                    pageSwitcherOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
                  )}
                >
                  <div className="px-1 pb-1 text-[11px] font-semibold text-slate-400">같은 페이지 문항</div>
                  {pageProblems.map((pageProblem) => {
                    const active = pageProblem.id === currentProblemId;
                    const label = pageProblem.tags?.unit || pageProblem.tags?.subject || (pageProblem.needs_review ? "검토 필요" : "검토 완료");
                    return (
                      <button
                        key={pageProblem.id}
                        type="button"
                        className={cn(
                          "rounded-[7px] border px-2 py-1.5 text-left transition",
                          active
                            ? "border-violet-300/70 bg-violet-400/20 text-white"
                            : "border-white/10 bg-white/[0.055] text-slate-200 hover:border-violet-300/45 hover:bg-violet-400/12",
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenProblem(pageProblem.id);
                        }}
                      >
                        <span className="block text-xs font-bold">#{pageProblem.problem_number}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selection && imageRef.current ? (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-violet-400 bg-violet-400/15"
                style={{
                  left: imageRef.current.offsetLeft + selection.x,
                  top: imageRef.current.offsetTop + selection.y,
                  width: selection.width,
                  height: selection.height,
                }}
              />
            ) : null}
            {showSelectionAction && imageRef.current ? (
              <div
                className="absolute z-10 rounded-lg border border-violet-300/40 bg-[#100b1f] p-2 shadow-2xl"
                onPointerDown={(event) => event.stopPropagation()}
                style={{
                  left: imageRef.current.offsetLeft + selection.x,
                  top: imageRef.current.offsetTop + selection.y + selection.height + 8,
                }}
              >
                <Button
                  size="sm"
                  onClick={saveVisualCrop}
                  disabled={savingCrop}
                >
                  {savingCrop ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  시각 자료로 저장
                </Button>
              </div>
            ) : null}
            {cropError ? (
              <div className="absolute left-3 top-3 z-10 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 shadow-xl">
                {cropError}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[560px] w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-center text-sm text-slate-500">
            검토용 원본 페이지 이미지가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function ExtractionPanel({
  problem,
  loading,
  problemTextDraft,
  problemTextDirty,
  savingProblemText,
  metadata,
  facets,
  solutionOpen,
  rawOpen,
  setRawOpen,
  setSolutionOpen,
  onProblemTextChange,
  onProblemTextSave,
  onMetadataChange,
  onReleaseAutofill,
  onDifficulty,
  onReextract,
  onTrash,
  reextracting,
  trashing,
  savedVisualUrl,
  deletingVisual,
  onVisualDelete,
}: {
  problem: Problem | null;
  loading: boolean;
  problemTextDraft: string;
  problemTextDirty: boolean;
  savingProblemText: boolean;
  metadata: MetadataDraft;
  facets: Facets;
  solutionOpen: boolean;
  rawOpen: boolean;
  setRawOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setSolutionOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  onProblemTextChange: (value: string) => void;
  onProblemTextSave: () => void;
  onMetadataChange: (field: MetadataField, value: string) => void;
  onReleaseAutofill: (field: MetadataField) => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onReextract: () => void;
  onTrash: () => void;
  reextracting: boolean;
  trashing: boolean;
  savedVisualUrl: string | null;
  deletingVisual: boolean;
  onVisualDelete: () => void;
}) {
  const solution = problem?.solution_steps || "";
  const solutionPreview = solution ? solution.split(/\r?\n/).slice(0, 2).join("\n") : "해설 데이터 없음";

  return (
    <section className="flex min-h-[680px] flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="rounded-lg border border-white/10 bg-[#11101a]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">본문</h2>
            <Badge variant={problem?.needs_review ? "error" : "success"}>{problem?.needs_review ? "검토 필요" : "검토 완료"}</Badge>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[6px] border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/[0.06]"
            onClick={() => setRawOpen((value) => !value)}
          >
            <Code2 className="h-3.5 w-3.5" />
            코드
            <ChevronDown className={cn("h-3.5 w-3.5 transition", rawOpen && "rotate-180")} />
          </button>
        </div>
        <div className="min-h-[220px] bg-white p-5 text-slate-950">
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              문항을 불러오는 중
            </div>
          ) : (
            <>
              <div className="mb-3 text-sm font-semibold text-slate-500">문항 {problem?.problem_number}</div>
              <MathText className="tena-math-review text-[15px] leading-8" value={problemTextDraft || "문항 내용이 비어 있습니다."} />
            </>
          )}
        </div>
        <div className="border-t border-white/10 bg-[#0c0b13] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">문항 텍스트</span>
              {problemTextDirty ? <Badge variant="warning">수정 중</Badge> : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onProblemTextSave}
              disabled={loading || savingProblemText || !problemTextDraft.trim() || !problemTextDirty}
            >
              {savingProblemText ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              저장
            </Button>
          </div>
          <textarea
            aria-label="문항 텍스트 수정"
            className="min-h-36 w-full resize-y rounded-[7px] border border-white/10 bg-black/35 p-3 font-mono text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-300/60 focus:ring-2 focus:ring-violet-400/15"
            value={problemTextDraft}
            onChange={(event) => onProblemTextChange(event.target.value)}
            disabled={loading || !problem}
            placeholder="문항 내용이 비어 있습니다."
          />
        </div>
        {rawOpen ? (
          <pre className="max-h-48 overflow-auto border-t border-white/10 bg-black/40 p-4 text-xs leading-5 text-slate-300">
            {problemTextDraft || ""}
          </pre>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <InfoCard title="정답">
          <div className="text-lg font-bold text-white">{problem?.answer || "정답 데이터 없음"}</div>
          <div className="mt-1 text-xs text-slate-500">{problem?.answer ? "해설 PDF에서 추출됨" : "정답 데이터가 아직 없습니다."}</div>
        </InfoCard>

        <InfoCard
          title="해설"
          action={
            <button type="button" className="text-xs font-semibold text-violet-200 hover:text-violet-100" onClick={() => setSolutionOpen((value) => !value)}>
              {solutionOpen ? "접기" : "펴서 보기"} (Space)
            </button>
          }
        >
          <div className={cn("text-sm leading-7 text-slate-200", !solutionOpen && "max-h-14 overflow-hidden text-slate-400")}>
            <MathText value={solutionOpen ? solution || "해설 데이터 없음" : solutionPreview} />
          </div>
        </InfoCard>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#11101a] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">메타데이터</h3>
            <p className="mt-1 text-xs text-slate-500">자동 채움됨. 회색은 자동, 밝은 글자는 직접 입력입니다.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReextract} disabled={reextracting || !problem?.review_page_image_url}>
              {reextracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              재추출
            </Button>
            <Button size="sm" variant="outline" className="border-red-400/25 text-red-100" onClick={onTrash} disabled={trashing || !problem}>
              {trashing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              휴지통
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MetadataInput
            label="과목"
            value={metadata.subject}
            autoFilled={metadata.auto_filled.subject}
            options={facets.subjects}
            onChange={(value) => onMetadataChange("subject", value)}
            onRelease={() => onReleaseAutofill("subject")}
          />
          <MetadataInput
            label="단원"
            value={metadata.unit}
            autoFilled={metadata.auto_filled.unit}
            options={facets.units}
            onChange={(value) => onMetadataChange("unit", value)}
            onRelease={() => onReleaseAutofill("unit")}
          />
          <MetadataInput
            label="유형"
            value={metadata.problem_type}
            autoFilled={metadata.auto_filled.problem_type}
            options={facets.problem_types}
            onChange={(value) => onMetadataChange("problem_type", value)}
            onRelease={() => onReleaseAutofill("problem_type")}
          />
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-slate-400">난이도 - 직접 선택 (1·2·3·4 키)</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {difficulties.map((difficulty, index) => (
              <button
                key={difficulty}
                type="button"
                className={cn(
                  "h-12 rounded-[7px] border text-sm font-bold transition",
                  metadata.difficulty === difficulty
                    ? "border-violet-300/60 bg-violet-500 text-white shadow-[0_12px_30px_rgba(124,58,237,0.26)]"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]",
                )}
                onClick={() => onDifficulty(difficulty)}
              >
                {difficulty} ({index + 1})
              </button>
            ))}
          </div>
        </div>

        {savedVisualUrl ? (
          <div className="mt-4 w-full max-w-sm rounded-lg border border-emerald-300/25 bg-emerald-400/[0.06] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                시각자료 추가됨
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-red-400/25 px-2 text-xs text-red-100 hover:border-red-300/40"
                onClick={onVisualDelete}
                disabled={deletingVisual}
              >
                {deletingVisual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                삭제
              </Button>
            </div>
            <div className="overflow-hidden rounded border border-white/10 bg-white">
              <img src={assetUrl(savedVisualUrl)} alt="추가된 시각자료" className="max-h-40 w-full object-contain" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InfoCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#11101a] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function MetadataInput({
  label,
  value,
  autoFilled,
  options,
  onChange,
  onRelease,
}: {
  label: string;
  value: string;
  autoFilled: boolean;
  options: string[];
  onChange: (value: string) => void;
  onRelease: () => void;
}) {
  const id = `review-${label}`;
  return (
    <label className="block text-sm font-medium text-slate-300">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span>{label}</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-slate-500 hover:bg-white/[0.07] hover:text-slate-200"
          onClick={onRelease}
          aria-label={`${label} 자동 채움 해제`}
          title="자동 채움 해제"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
      </span>
      <Input
        value={value}
        list={`${id}-options`}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "border-white/10 bg-black/30",
          autoFilled ? "text-slate-400 placeholder:text-slate-600" : "text-slate-50",
        )}
        placeholder="비어 있음"
      />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}

function EmptyState({
  title,
  loading,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  loading?: boolean;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[460px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] p-8 text-center">
      <div className="max-w-md">
        {loading ? <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-violet-200" /> : <CheckCircle2 className="mx-auto mb-4 h-7 w-7 text-violet-200" />}
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="mt-5 inline-flex">
            <Button>{actionLabel}</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function HotkeyHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const rows = [
    ["Enter", "검토 완료 후 다음 미검토 문항으로 이동"],
    ["→ / ←", "다음 / 이전 문항 이동"],
    ["1 · 2 · 3 · 4", "난이도 하 / 중 / 상 / 최상 선택, 같은 키를 다시 누르면 해제"],
    ["Space", "해설 펴기 / 접기"],
    ["R", "현재 문항 전체 재추출 확인"],
    ["Backspace / Delete", "휴지통 이동 확인"],
    ["?", "단축키 도움말"],
    ["Esc", "배치 선택 열기 / 닫기"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <div className="pr-8">
          <h2 className="text-lg font-bold text-white">검토 단축키</h2>
        </div>
        <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
          {rows.map(([key, description]) => (
            <div key={key} className="grid grid-cols-[150px_1fr] border-b border-white/10 last:border-b-0">
              <div className="bg-white/[0.04] px-4 py-3 font-mono text-sm font-bold text-violet-100">{key}</div>
              <div className="px-4 py-3 text-sm text-slate-300">{description}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
