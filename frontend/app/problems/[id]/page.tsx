"use client";

import type { PointerEvent } from "react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Code2, Crop, Eye, RefreshCcw, Save, Trash2, X } from "lucide-react";

import { MathText } from "@/components/math-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, assetUrl, Problem, Tag } from "@/lib/api";

type Facets = { subjects: string[]; units: string[]; problem_types: string[]; sources: string[] };
type Point = { x: number; y: number };
type Selection = { x: number; y: number; width: number; height: number };
type ProblemNavigation = { previous_id: string | null; next_id: string | null; position: number | null; total: number };

const emptyTags: Tag = { subject: "", unit: "", difficulty: "", problem_type: "", source: "" };
const difficulties = ["하", "중", "상", "최상"];

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
  const [savingText, setSavingText] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [savingCrop, setSavingCrop] = useState(false);
  const [reextracting, setReextracting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const contextQuery = useMemo(() => searchParams.toString(), [searchParams]);
  const hasFilterContext = useMemo(() => {
    const params = new URLSearchParams(contextQuery);
    params.delete("page");
    return Boolean(params.toString());
  }, [contextQuery]);
  const detailQuerySuffix = contextQuery ? `?${contextQuery}` : "";
  const archiveHref = `/problems${detailQuerySuffix}`;

  useEffect(() => {
    setProblem(null);
    setLoadError(null);
    setActionError("");

    api<Problem>(`/api/problems/${params.id}`)
      .then((data) => {
        setProblem(data);
        setDraftText(data.problem_text);
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

    api<Facets>("/api/problems/facets").then(setFacets).catch(() => undefined);
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    setNavigation(null);
    api<ProblemNavigation>(`/api/problems/${params.id}/navigation${detailQuerySuffix}`)
      .then((data) => {
        if (!cancelled) setNavigation(data);
      })
      .catch(() => {
        if (!cancelled) setNavigation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, detailQuerySuffix]);

  async function openProblem(problemId: string | null) {
    if (!problemId) return;
    const textSaved = await saveProblemText();
    if (!textSaved) return;
    const tagsSaved = await saveTags();
    if (!tagsSaved) return;
    router.push(`/problems/${problemId}${detailQuerySuffix}`);
  }

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
    if (!cropMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = imagePoint(event);
    setDragStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    if (!cropMode || !dragStart) return;
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

  async function reextractProblem() {
    if (!problem || !problem.review_page_image_url) return;
    setReextracting(true);
    setActionError("");
    try {
      const updated = await api<Problem>(`/api/problems/${problem.id}/reextract`, { method: "POST" });
      setProblem(updated);
      setDraftText(updated.problem_text);
    } catch (error: any) {
      setActionError(
        error?.response?.data?.detail ||
          "AI 재추출에 실패했습니다. 원본 페이지 이미지와 API 설정을 확인해주세요."
      );
    } finally {
      setReextracting(false);
    }
  }

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
      setCropMode(false);
    } catch {
      setActionError("시각 자료 영역 저장에 실패했습니다.");
    } finally {
      setSavingCrop(false);
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

  async function completeReview() {
    if (!problem) return;
    const textSaved = await saveProblemText();
    if (!textSaved) return;
    const tagsSaved = await saveTags();
    if (!tagsSaved) return;
    const updated = await api<Problem>(`/api/problems/${problem.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ needs_review: false }),
    });
    setProblem(updated);
  }

  async function removeProblem() {
    if (!problem) return;
    await api(`/api/problems/${problem.id}`, { method: "DELETE" });
    router.push(archiveHref);
  }

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-white/[0.045] px-6 py-16 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-400/30 bg-red-500/10 text-red-200">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">문항을 열 수 없습니다</h1>
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
  const sourceLabel =
    tags.source || problem.source_label || `${problem.review_page_number ? `${problem.review_page_number}페이지 / ` : ""}${problem.problem_number}번`;
  const navigationLabel =
    navigation?.position && navigation.total
      ? `${navigation.position} / ${navigation.total}`
      : navigation?.total === 0
        ? "조건 내 문항 없음"
        : "위치 계산 중";

  return (
    <div className="space-y-4">
      <div className="sticky top-[65px] z-30 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#12101c]/95 p-3 shadow-[0_16px_44px_rgba(0,0,0,0.28)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={() => router.push(archiveHref)}>
          <ArrowLeft className="h-4 w-4" />
          문항 아카이브
        </Button>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
            {hasFilterContext ? "현재 검색 조건 기준" : "전체 문항 기준"} {navigationLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => openProblem(navigation?.previous_id || null)} disabled={!navigation?.previous_id}>
            <ChevronLeft className="h-4 w-4" />
            이전 문항
          </Button>
          <Button variant="outline" onClick={() => openProblem(navigation?.next_id || null)} disabled={!navigation?.next_id}>
            다음 문항
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-4">
        {problem.needs_review && (
          <div className="flex flex-col gap-3 rounded-lg border border-violet-500/40 bg-violet-500/15 p-4 text-violet-100 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              검토가 필요한 문항입니다.
            </div>
            <Button variant="outline" onClick={completeReview}>
              검토 완료
            </Button>
          </div>
        )}

        <Card className="overflow-hidden border-violet-300/25 bg-white/[0.045]">
          <CardHeader className="border-b border-violet-300/15 bg-violet-300/[0.035]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Eye className="h-5 w-5 text-violet-200" />
                  문항 미리보기
                </CardTitle>
              </div>
              <Badge variant="secondary">읽기 전용</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="rounded-md border border-violet-300/20 bg-black/25 p-4 text-base leading-8">
              <MathText className="tena-math-review" value={draftText} />
            </div>

            {problem.review_page_image_url && (
              <div className="space-y-3 rounded-lg border border-violet-300/20 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">원본 페이지 비교</h2>
                  </div>
                  <Badge variant="warning">검토용</Badge>
                </div>
                <div className="max-h-[720px] overflow-auto rounded-md border border-white/10 bg-black/35 p-2">
                  <img
                    src={assetUrl(problem.review_page_image_url)}
                    alt={`원본 ${problem.review_page_number || ""}페이지`}
                    className="mx-auto w-full max-w-3xl rounded-sm"
                    draggable={false}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-sky-300/30 bg-sky-300/[0.035] shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <CardHeader className="border-b border-sky-300/20 bg-sky-300/[0.05]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Code2 className="h-5 w-5 text-sky-200" />
                  문항 수정
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {draftText !== problem.problem_text && <Badge variant="warning">수정 중</Badge>}
                <Button
                  type="button"
                  variant="outline"
                  onClick={reextractProblem}
                  disabled={reextracting || !problem.review_page_image_url}
                  title={!problem.review_page_image_url ? "검토용 원본 페이지 이미지가 있는 문항만 재추출할 수 있습니다." : undefined}
                >
                  <RefreshCcw className={`h-4 w-4 ${reextracting ? "animate-spin" : ""}`} />
                  {reextracting ? "재추출 중" : "AI로 다시 추출"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="space-y-3 rounded-lg border border-sky-300/20 bg-black/30 p-4">
              <textarea
                aria-label="문항 수정 입력"
                className="min-h-56 w-full rounded-md border border-white/10 bg-black/40 p-4 font-mono text-sm leading-7 text-slate-100 outline-none focus-visible:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-400/20"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />
              {actionError && <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{actionError}</p>}
              <Button onClick={() => void saveProblemText()} disabled={savingText || !draftText.trim() || draftText === problem.problem_text}>
                <Save className="h-4 w-4" />
                문항 저장
              </Button>
            </div>
          </CardContent>
        </Card>

        {cropSourceUrl && (
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Crop className="h-5 w-5 text-violet-200" />
                시각 자료 편집
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={cropMode ? "secondary" : "outline"}
                    onClick={() => {
                      setCropMode(!cropMode);
                      setSelection(null);
                    }}
                  >
                    <Crop className="h-4 w-4" />
                    영역 자르기
                  </Button>
                  <Button onClick={saveCrop} disabled={!selection || selection.width < 10 || selection.height < 10 || savingCrop}>
                    <Save className="h-4 w-4" />
                    자른 영역 저장
                  </Button>
                  {cropMode && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCropMode(false);
                        setSelection(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                      취소
                    </Button>
                  )}
                </div>

                <div
                  className={`relative select-none overflow-hidden rounded-lg border bg-muted ${cropMode ? "cursor-crosshair" : ""}`}
                  onPointerDown={startCrop}
                  onPointerMove={moveCrop}
                  onPointerUp={() => setDragStart(null)}
                  onPointerCancel={() => setDragStart(null)}
                >
                  <img ref={imageRef} src={assetUrl(cropSourceUrl)} alt={`${problem.problem_number}번 시각 자료`} className="block w-full" draggable={false} />
                  {cropMode && <div className="absolute inset-0 bg-black/20" />}
                  {selection && <div className="absolute border-2 border-primary bg-primary/15" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }} />}
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">원본 크게 보기</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <div className="max-h-[75vh] overflow-auto">
                      <img src={assetUrl(cropSourceUrl)} alt={`${problem.problem_number}번 시각 자료 확대`} className="mx-auto max-w-full" />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>문항 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="출처" value={sourceLabel} />
            <InfoRow label="문항 번호" value={`${problem.problem_number}번`} />
            <InfoRow label="원본 페이지" value={problem.review_page_number ? `${problem.review_page_number}페이지` : "미기록"} />
            <InfoRow label="검토 상태" value={problem.needs_review ? "검토 필요" : "검토 완료"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>태그 편집</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TagInput label="출처" listId="sources" value={tags.source || ""} options={facets.sources} onChange={(value) => setTags({ ...tags, source: value })} />
            <TagInput label="과목" listId="subjects" value={tags.subject || ""} options={facets.subjects} onChange={(value) => setTags({ ...tags, subject: value })} />
            <TagInput label="단원" listId="units" value={tags.unit || ""} options={facets.units} onChange={(value) => setTags({ ...tags, unit: value })} />
            <div className="space-y-2">
              <label className="text-sm font-medium">난이도</label>
              <div className="grid grid-cols-4 gap-1">
                {difficulties.map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    className={`h-9 rounded-md border text-sm transition-colors ${
                      tags.difficulty === difficulty ? "border-primary bg-primary text-primary-foreground" : "bg-card/70 hover:bg-accent"
                    }`}
                    onClick={() => setTags({ ...tags, difficulty })}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>
            </div>
            <TagInput label="문항 유형" listId="types" value={tags.problem_type || ""} options={facets.problem_types} onChange={(value) => setTags({ ...tags, problem_type: value })} />
            <Button className="w-full" onClick={() => void saveTags()} disabled={savingTags}>
              <Save className="h-4 w-4" />
              태그 저장
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="hidden">
          <TabsList className="w-full">
            <TabsTrigger className="flex-1" value="hidden">
              <Eye className="mr-2 h-4 w-4" />
              정답 숨김
            </TabsTrigger>
            <TabsTrigger className="flex-1" value="answer">정답 보기</TabsTrigger>
          </TabsList>
          <TabsContent value="hidden" className="mt-3" />
          <TabsContent value="answer" className="mt-3">
            <Card>
              <CardHeader>
                <CardTitle>정답 및 해설</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-sm text-muted-foreground">정답</span>
                  <div className="text-xl font-bold">
                    <MathText value={problem.answer || "미확인"} />
                  </div>
                </div>
                <Separator />
                <div className="text-sm leading-7">
                  <MathText value={problem.solution_steps || "해설이 없습니다."} />
                </div>
                {problem.key_concept && (
                  <Badge variant="secondary">
                    <MathText value={problem.key_concept} />
                  </Badge>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button variant="destructive" className="w-full" onClick={removeProblem}>
          <Trash2 className="h-4 w-4" />
          문항 삭제
        </Button>
      </aside>
    </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right text-slate-100">{value}</span>
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
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input list={listId} value={value} onChange={(event) => onChange(event.target.value)} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
