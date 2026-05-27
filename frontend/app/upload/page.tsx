"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { FileText, Loader2, LockKeyhole, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArchiveBatchHistory } from "@/components/archive/archive-batch-history";
import { ColorPicker } from "@/components/editor/color-picker";
import { Batch, BatchStatus, SourceType } from "@/lib/api";
import { authHttp } from "@/lib/auth-client";
import { readActiveBatch, rememberActiveBatch } from "@/lib/batch-progress";
import { getRoles, getUsageSummary, UsageSummary } from "@/lib/saas";
import { cn } from "@/lib/utils";

type UploadResponse = { batch_id: string; status: BatchStatus };
type TagColorMap = Record<string, string>;

const SUBJECT_TAG_COLORS_KEY = "tena-forge-upload-subject-tag-colors";
const UNIT_TAG_COLORS_KEY = "tena-forge-upload-unit-tag-colors";
const MB = 1024 * 1024;
const PDF_SAMPLE_BYTES = 16 * MB;
const PDF_FULL_SCAN_LIMIT_BYTES = 80 * MB;
const tagPalette = ["#8b5cf6", "#0ea5e9", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ec4899", "#6366f1", "#06b6d4", "#84cc16"];

type PdfPageEstimate = {
  pages: number | null;
  source: "none" | "pdf" | "size" | "error";
  loading: boolean;
  error?: string;
};

const emptyPdfEstimate: PdfPageEstimate = { pages: null, source: "none", loading: false };

const subjectOptions = [
  { label: "국어", value: "국어" },
  { label: "공수1", value: "공통수학1" },
  { label: "공수2", value: "공통수학2" },
  { label: "수1", value: "수학Ⅰ" },
  { label: "수2", value: "수학Ⅱ" },
  { label: "미적분", value: "미적분" },
  { label: "확통", value: "확률과 통계" },
  { label: "기하", value: "기하" },
];

const commonMathPattern = /공통수학[12]|공통수[12]|공수[12]/g;
const filenameSubjectRules: Array<{ value: string; pattern: RegExp; stripCommon?: boolean }> = [
  { value: "공통수학1", pattern: /공통수학1|공통수1|공수1/ },
  { value: "공통수학2", pattern: /공통수학2|공통수2|공수2/ },
  { value: "수학Ⅰ", pattern: /수학I(?!I)|수I(?!I)|수학1|수1/, stripCommon: true },
  { value: "수학Ⅱ", pattern: /수학II|수II|수학2|수2/, stripCommon: true },
  { value: "미적분", pattern: /미적분|미적/ },
  { value: "확률과 통계", pattern: /확률과통계|확통/ },
  { value: "기하", pattern: /기하|기벡/ },
];

function compactSubjectText(value: string | null | undefined) {
  return (value || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

function inferSubjectsFromFilename(fileName: string | null | undefined) {
  const compacted = compactSubjectText(fileName);
  if (!compacted) return [];
  if (/국어|언어와매체|화법과작문|문학|비문학|독서|KOREAN|LANGUAGE/.test(compacted)) return ["국어"];
  const withoutCommonMath = compacted.replace(commonMathPattern, "");
  const subjects: string[] = [];
  filenameSubjectRules.forEach((rule) => {
    const target = rule.stripCommon ? withoutCommonMath : compacted;
    if (rule.pattern.test(target) && !subjects.includes(rule.value)) subjects.push(rule.value);
  });
  return subjects;
}

function subjectLabel(value: string) {
  return subjectOptions.find((option) => option.value === value)?.label || value;
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function defaultTagColor(value: string, group: "subject" | "unit" | "batch") {
  return tagPalette[hashText(`${group}:${value}`) % tagPalette.length];
}

function readTagColors(key: string): TagColorMap {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTagColors(key: string, colors: TagColorMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(colors));
}

function tagColor(value: string, colors: TagColorMap, group: "subject" | "unit") {
  return colors[value] || defaultTagColor(value, group);
}

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function tagToneStyle(color: string, selected = true): CSSProperties {
  const rgb = hexToRgb(color);
  if (!rgb) return { borderColor: color };
  const alpha = selected ? 0.16 : 0.04;
  const borderAlpha = selected ? 0.58 : 0.24;
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`,
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${borderAlpha})`,
    boxShadow: selected ? `inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 0 1px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06)` : undefined,
  };
}

function nextPaletteColor(current: string) {
  const index = tagPalette.findIndex((color) => color.toLowerCase() === current.toLowerCase());
  return tagPalette[index >= 0 ? (index + 1) % tagPalette.length : hashText(current) % tagPalette.length];
}

function fileNameToBatchName(fileName: string) {
  const cleanName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleanName || fileName.trim();
}

function fileSizeMb(file: File | null) {
  return file ? file.size / MB : 0;
}

function formatCompactNumber(value: number, digits = 1) {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = safe >= 100 ? Math.round(safe) : Math.round(safe * 10 ** digits) / 10 ** digits;
  return rounded.toLocaleString("ko-KR");
}

function decodePdfText(buffer: ArrayBuffer) {
  return new TextDecoder("latin1").decode(buffer);
}

function parsePdfPageCount(text: string) {
  let maxCount = 0;
  const countRegex = /\/Type\s*\/Pages\b[\s\S]{0,1200}?\/Count\s+(\d+)/g;
  for (let match = countRegex.exec(text); match; match = countRegex.exec(text)) {
    maxCount = Math.max(maxCount, Number(match[1]) || 0);
  }
  if (maxCount > 0) return maxCount;
  const pageObjects = text.match(/\/Type\s*\/Page\b/g);
  return pageObjects?.length || 0;
}

function estimatePagesFromSize(file: File) {
  return Math.max(1, Math.ceil(file.size / (0.85 * MB)));
}

async function estimatePdfPageCount(file: File): Promise<PdfPageEstimate> {
  try {
    const head = decodePdfText(await file.slice(0, Math.min(file.size, PDF_SAMPLE_BYTES)).arrayBuffer());
    const tail = file.size > PDF_SAMPLE_BYTES
      ? decodePdfText(await file.slice(Math.max(0, file.size - PDF_SAMPLE_BYTES), file.size).arrayBuffer())
      : "";
    const sampledPages = parsePdfPageCount(`${head}\n${tail}`);
    if (sampledPages > 0) return { pages: sampledPages, source: "pdf", loading: false };

    if (file.size <= PDF_FULL_SCAN_LIMIT_BYTES) {
      const fullPages = parsePdfPageCount(decodePdfText(await file.arrayBuffer()));
      if (fullPages > 0) return { pages: fullPages, source: "pdf", loading: false };
    }

    return { pages: estimatePagesFromSize(file), source: "size", loading: false };
  } catch {
    return { pages: estimatePagesFromSize(file), source: "error", loading: false, error: "페이지 수를 정확히 읽지 못해 파일 크기로 추정했습니다." };
  }
}

function pageEstimateLabel(estimate: PdfPageEstimate, emptyLabel = "-") {
  if (estimate.loading) return "확인 중";
  if (!estimate.pages) return emptyLabel;
  return `${estimate.source === "pdf" ? "" : "약 "}${estimate.pages.toLocaleString("ko-KR")}p`;
}

function likelyHardScan(totalMb: number, totalPages: number) {
  return totalPages > 0 && totalMb / totalPages >= 1;
}

function buildCreditEstimate({
  problem,
  solution,
  subjectEngine,
  problemFile,
  solutionFile,
}: {
  problem: PdfPageEstimate;
  solution: PdfPageEstimate;
  subjectEngine: "math" | "korean";
  problemFile: File | null;
  solutionFile: File | null;
}) {
  if (!problemFile || problem.loading || solution.loading || !problem.pages) return null;
  const problemPages = problem.pages;
  const solutionPages = solutionFile ? solution.pages || 0 : 0;
  const totalPages = problemPages + solutionPages;
  const totalMb = fileSizeMb(problemFile) + fileSizeMb(solutionFile);
  const hardScan = likelyHardScan(totalMb, Math.max(totalPages, 1));
  let problemMultiplier = 1;
  let solutionMultiplier = 1.35;
  if (subjectEngine === "korean") {
    problemMultiplier = hardScan ? 4 : 3;
    solutionMultiplier = 1.5;
  } else if (hardScan) {
    problemMultiplier = 2;
    solutionMultiplier = 2;
  }
  const credits = problemPages * problemMultiplier + solutionPages * solutionMultiplier;
  return {
    credits: Math.round(credits * 10) / 10,
    problemPages,
    solutionPages,
    totalPages,
    totalMb,
    hardScan,
    approximate: problem.source !== "pdf" || (solutionFile ? solution.source !== "pdf" : false),
  };
}

function TagColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 rounded-[7px] border border-white/10 bg-black/25 px-2">
      {tagPalette.slice(0, 6).map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "h-5 w-5 rounded-full border transition hover:scale-105",
            value.toLowerCase() === color ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.16)]" : "border-white/20"
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`${label} ${color}`}
          title={`${label} ${color}`}
        />
      ))}
      <ColorPicker
        value={value}
        onChange={onChange}
        label={`${label} 직접 선택`}
        variant="swatch"
        triggerClassName="ml-1 h-6 w-6"
        showValue={false}
        allowAlpha={false}
        allowTransparent={false}
      />
    </div>
  );
}

function EditableTagChip({
  label,
  color,
  onColorChange,
  onRemove,
}: {
  label: string;
  color: string;
  onColorChange: (color: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="inline-flex h-8 items-center gap-2 rounded-[7px] border px-2 text-xs font-semibold text-slate-50"
      style={tagToneStyle(color)}
    >
      <ColorPicker
        value={color}
        onChange={onColorChange}
        label={`${label} 색상`}
        variant="swatch"
        triggerClassName="h-5 w-5"
        showValue={false}
        allowAlpha={false}
        allowTransparent={false}
      />
      <span>{label}</span>
      <button type="button" className="rounded p-0.5 text-slate-100 transition hover:bg-white/10" onClick={onRemove} aria-label={`${label} 제거`}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DropZone({
  label,
  helper,
  file,
  required = false,
  onChange
}: {
  label: string;
  helper: string;
  file: File | null;
  required?: boolean;
  onChange: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function pickFile(nextFile: File | null) {
    if (!nextFile) {
      onChange(null);
      return;
    }
    if (nextFile.type !== "application/pdf" && !nextFile.name.toLowerCase().endsWith(".pdf")) {
      window.alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    onChange(nextFile);
  }

  return (
    <div className="space-y-2">
      <label
        className={cn(
          "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/12 bg-white/[0.035] p-6 text-center transition-colors hover:border-violet-400/60 hover:bg-white/[0.055]",
          isDragging && "border-violet-400 bg-violet-500/10 text-white ring-2 ring-violet-400/25"
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          pickFile(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <UploadCloud className="mb-3 h-9 w-9 text-violet-300" />
        <span className="font-semibold text-white">
          {label} {required && <span className="text-red-300">*</span>}
        </span>
        <span className="mt-2 text-sm text-slate-400">{file ? file.name : isDragging ? "여기에 PDF를 놓으세요" : helper}</span>
        <span className="mt-1 text-xs text-slate-500">클릭해서 선택하거나 PDF를 끌어다 놓을 수 있습니다.</span>
        <input className="hidden" type="file" accept="application/pdf" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
      </label>
      {file && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
          선택 취소
        </Button>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [batchName, setBatchName] = useState("");
  const [autoBatchName, setAutoBatchName] = useState("");
  const [problemPdf, setProblemPdf] = useState<File | null>(null);
  const [solutionPdf, setSolutionPdf] = useState<File | null>(null);
  const [problemPdfEstimate, setProblemPdfEstimate] = useState<PdfPageEstimate>(emptyPdfEstimate);
  const [solutionPdfEstimate, setSolutionPdfEstimate] = useState<PdfPageEstimate>(emptyPdfEstimate);
  const [subjectEngine, setSubjectEngine] = useState<"math" | "korean">("math");
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [batchAccentColor, setBatchAccentColor] = useState(() => defaultTagColor("new-batch", "batch"));
  const [batchColorTouched, setBatchColorTouched] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customSubjectColor, setCustomSubjectColor] = useState(tagPalette[0]);
  const [unitInput, setUnitInput] = useState("");
  const [unitInputColor, setUnitInputColor] = useState(tagPalette[1]);
  const [unitCandidates, setUnitCandidates] = useState<string[]>([]);
  const [subjectTagColors, setSubjectTagColors] = useState<TagColorMap>({});
  const [unitTagColors, setUnitTagColors] = useState<TagColorMap>({});
  const sourceType: SourceType = "self_created";
  const sourceLabel = "";
  const [rightsNote, setRightsNote] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [historyBatchSnapshot, setHistoryBatchSnapshot] = useState<Batch | null>(null);
  const [message, setMessage] = useState("");
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const activeBatchId = readActiveBatch();
    if (activeBatchId) setBatchId(activeBatchId);
  }, []);

  useEffect(() => {
    getUsageSummary().then(setUsageSummary).catch(() => setUsageSummary(null));
    getRoles().then((data) => setRoles(data.roles || [])).catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    setSubjectTagColors(readTagColors(SUBJECT_TAG_COLORS_KEY));
    setUnitTagColors(readTagColors(UNIT_TAG_COLORS_KEY));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!problemPdf) {
      setProblemPdfEstimate(emptyPdfEstimate);
      return () => {
        cancelled = true;
      };
    }
    setProblemPdfEstimate({ pages: null, source: "none", loading: true });
    estimatePdfPageCount(problemPdf).then((estimate) => {
      if (!cancelled) setProblemPdfEstimate(estimate);
    });
    return () => {
      cancelled = true;
    };
  }, [problemPdf]);

  useEffect(() => {
    let cancelled = false;
    if (!solutionPdf) {
      setSolutionPdfEstimate(emptyPdfEstimate);
      return () => {
        cancelled = true;
      };
    }
    setSolutionPdfEstimate({ pages: null, source: "none", loading: true });
    estimatePdfPageCount(solutionPdf).then((estimate) => {
      if (!cancelled) setSolutionPdfEstimate(estimate);
    });
    return () => {
      cancelled = true;
    };
  }, [solutionPdf]);

  function toggleSubject(subject: string) {
    if (subject === "국어") setSubjectEngine("korean");
    setSelectedSubjects((current) => (current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject]));
  }

  function addCustomSubject() {
    const subject = customSubject.trim();
    if (!subject || selectedSubjects.includes(subject)) return;
    setSelectedSubjects((current) => [...current, subject]);
    updateSubjectTagColor(subject, customSubjectColor);
    setCustomSubject("");
    setCustomSubjectColor((current) => nextPaletteColor(current));
  }

  function addUnitCandidate() {
    const units = unitInput
      .split(/[,，\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!units.length) return;
    const newUnits = units.filter((unit) => !unitCandidates.includes(unit));
    setUnitCandidates((current) => [...current, ...units.filter((unit) => !current.includes(unit))]);
    if (newUnits.length) {
      setUnitTagColors((currentColors) => {
        const nextColors = { ...currentColors };
        newUnits.forEach((unit) => {
          nextColors[unit] = nextColors[unit] || unitInputColor;
        });
        writeTagColors(UNIT_TAG_COLORS_KEY, nextColors);
        return nextColors;
      });
    }
    setUnitInput("");
    setUnitInputColor((current) => nextPaletteColor(current));
  }

  function removeUnitCandidate(unit: string) {
    setUnitCandidates((current) => current.filter((item) => item !== unit));
  }

  function updateSubjectTagColor(subject: string, color: string) {
    setSubjectTagColors((current) => {
      const next = { ...current, [subject]: color };
      writeTagColors(SUBJECT_TAG_COLORS_KEY, next);
      return next;
    });
  }

  function updateUnitTagColor(unit: string, color: string) {
    setUnitTagColors((current) => {
      const next = { ...current, [unit]: color };
      writeTagColors(UNIT_TAG_COLORS_KEY, next);
      return next;
    });
  }

  function updateBatchName(value: string) {
    setBatchName(value);
    if (!batchColorTouched && value.trim()) setBatchAccentColor(defaultTagColor(value.trim(), "batch"));
  }

  function updateBatchAccentColor(color: string) {
    setBatchColorTouched(true);
    setBatchAccentColor(color);
  }

  function handleProblemPdfChange(file: File | null) {
    const nextAutoBatchName = file ? fileNameToBatchName(file.name) : "";
    const inferredSubjects = inferSubjectsFromFilename(file?.name);
    setProblemPdf(file);
    if (!batchColorTouched && nextAutoBatchName) setBatchAccentColor(defaultTagColor(nextAutoBatchName, "batch"));
    setBatchName((current) => {
      const trimmed = current.trim();
      if (!file) return autoBatchName && trimmed === autoBatchName ? "" : current;
      if (!trimmed || trimmed === autoBatchName) return nextAutoBatchName;
      return current;
    });
    if (inferredSubjects.length) {
      setSelectedSubjects((current) => [...current, ...inferredSubjects.filter((subject) => !current.includes(subject))]);
      if (inferredSubjects.includes("국어")) setSubjectEngine("korean");
    }
    setAutoBatchName(nextAutoBatchName);
  }

  async function submit() {
    const typedUnits = unitInput
      .split(/[,，\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const finalUnitCandidates = [...unitCandidates, ...typedUnits.filter((unit) => !unitCandidates.includes(unit))];
    if (typedUnits.length) {
      setUnitCandidates(finalUnitCandidates);
      setUnitInput("");
    }
    if (selectedEngineLocked) {
      setMessage("선택한 과목 엔진은 현재 플랜에서 잠겨 있습니다. 결제 화면에서 엔진을 추가해주세요.");
      return;
    }
    if (!batchName || !problemPdf || !rightsConfirmed || !selectedSubjects.length) return;
    setSubmitting(true);
    setUploadPercent(0);
    setMessage("업로드 중입니다.");
    const form = new FormData();
    form.append("batch_name", batchName);
    form.append("problem_pdf", problemPdf);
    form.append("source_type", sourceType);
    form.append("source_label", sourceLabel);
    form.append("rights_confirmed", String(rightsConfirmed));
    form.append("rights_note", rightsNote);
    form.append("accent_color", batchAccentColor);
    form.append("subject_candidates", JSON.stringify(selectedSubjects));
    form.append("unit_candidates", JSON.stringify(finalUnitCandidates));
    form.append("subject_engine", subjectEngine);
    if (solutionPdf) form.append("solution_pdf", solutionPdf);
    let data: UploadResponse;
    try {
      const response = await authHttp.post<UploadResponse>("/api/batches/upload", form, {
        onUploadProgress: (event) => {
          if (!event.total) return;
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          setUploadPercent(percent);
          setMessage(percent >= 100 ? "업로드 완료. 아카이빙 작업을 시작하는 중입니다." : `PDF 업로드 중입니다. ${percent}%`);
        },
      });
      data = response.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      setSubmitting(false);
      setUploadPercent(null);
      setMessage(typeof detail === "string" ? detail : "업로드에 실패했습니다.");
      return;
    }
    setSubmitting(false);
    setUploadPercent(null);
    setBatchId(data.batch_id);
    rememberActiveBatch(data.batch_id);
    setMessage("업로드 완료. 아래 아카이빙 기록에서 진행률을 확인할 수 있습니다.");
  }

  const handleActiveBatchSnapshot = useCallback((batch: Batch | null) => {
    setHistoryBatchSnapshot(batch);
  }, []);

  const currentStatus = historyBatchSnapshot?.id === batchId ? historyBatchSnapshot.status : null;
  const enabledSubjectEngines = usageSummary?.subscription?.enabled_subject_engines || usageSummary?.plan.enabled_subject_engines || ["math"];
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const selectedEngineLocked = !isAdmin && Boolean(usageSummary) && !enabledSubjectEngines.includes(subjectEngine);

  useEffect(() => {
    if (isAdmin || !usageSummary || enabledSubjectEngines.includes(subjectEngine)) return;
    const nextEngine = enabledSubjectEngines.find((engine): engine is "math" | "korean" => engine === "math" || engine === "korean") || "math";
    setSubjectEngine(nextEngine);
  }, [enabledSubjectEngines, isAdmin, subjectEngine, usageSummary]);

  const creditEstimate = useMemo(
    () => buildCreditEstimate({
      problem: problemPdfEstimate,
      solution: solutionPdfEstimate,
      subjectEngine,
      problemFile: problemPdf,
      solutionFile: solutionPdf,
    }),
    [problemPdfEstimate, solutionPdfEstimate, subjectEngine, problemPdf, solutionPdf]
  );
  const creditsRemaining = usageSummary?.extraction_credits_remaining ?? (
    usageSummary ? Math.max((usageSummary.monthly_credit_limit || 0) - (usageSummary.extraction_credits_used || 0), 0) : null
  );
  const creditsAfterUpload = creditEstimate && creditsRemaining !== null ? Math.max(creditsRemaining - creditEstimate.credits, 0) : null;
  const creditEstimateExceedsRemaining = Boolean(creditEstimate && creditsRemaining !== null && creditEstimate.credits > creditsRemaining);
  const canSubmit = Boolean(batchName && problemPdf && selectedSubjects.length && rightsConfirmed && !submitting && !selectedEngineLocked);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="hidden">
        <div className="inline-flex items-center gap-2 rounded-md border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
          <ShieldCheck className="h-4 w-4" />
          권리 보유 자료 문항화
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white">내 자료 아카이빙</h1>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>새 아카이브 배치</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input className="min-w-0 flex-1" placeholder="배치 이름" value={batchName} onChange={(event) => updateBatchName(event.target.value)} />
            <TagColorPicker value={batchAccentColor} onChange={updateBatchAccentColor} label="배치 색상" />
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <h2 className="text-sm font-bold text-white">Subject Engine</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: "math" as const, label: "Math" },
                { value: "korean" as const, label: "Korean Language" },
              ].map((engine) => {
                const locked = !isAdmin && Boolean(usageSummary) && !enabledSubjectEngines.includes(engine.value);
                const selected = subjectEngine === engine.value;
                return (
                  <button
                    key={engine.value}
                    type="button"
                    disabled={locked}
                    className={cn(
                      "rounded-[8px] border px-3 py-2 text-sm font-semibold transition",
                      selected ? "border-violet-300/70 bg-violet-500/20 text-violet-50" : "border-white/10 bg-black/20 text-slate-300 hover:border-white/25",
                      locked && "cursor-not-allowed opacity-45"
                    )}
                    onClick={() => {
                      setSubjectEngine(engine.value);
                      if (engine.value === "korean" && !selectedSubjects.includes("국어")) {
                        setSelectedSubjects((current) => [...current, "국어"]);
                      }
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {locked ? <LockKeyhole className="h-3.5 w-3.5" /> : null}
                      {engine.label}{locked ? " · Locked" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedEngineLocked ? <p className="mt-3 text-xs text-amber-200">선택한 엔진은 현재 플랜에서 사용할 수 없습니다.</p> : null}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <h2 className="text-sm font-bold text-white">분류 기준</h2>

            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-400">과목 후보</div>
                <div className="flex flex-wrap gap-2">
                  {subjectOptions.map((subject) => {
                    const selected = selectedSubjects.includes(subject.value);
                    const color = tagColor(subject.value, subjectTagColors, "subject");
                    return (
                      <button
                        key={subject.value}
                        type="button"
                        className={cn(
                          "inline-flex h-9 items-center gap-2 rounded-[7px] border px-3 text-sm font-semibold transition hover:brightness-110",
                          selected ? "text-white" : "text-slate-300"
                        )}
                        style={tagToneStyle(color, selected)}
                        onClick={() => toggleSubject(subject.value)}
                      >
                        <span className="h-2.5 w-2.5 rounded-full border border-white/30" style={{ backgroundColor: color }} />
                        {subject.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="min-w-0 flex-1"
                    placeholder="직접 입력할 과목"
                    value={customSubject}
                    onChange={(event) => setCustomSubject(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomSubject();
                      }
                    }}
                  />
                  <TagColorPicker value={customSubjectColor} onChange={setCustomSubjectColor} label="과목 태그 색상" />
                  <Button type="button" variant="outline" onClick={addCustomSubject}>추가</Button>
                </div>
                {selectedSubjects.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedSubjects.map((subject) => {
                      const color = tagColor(subject, subjectTagColors, "subject");
                      return (
                        <EditableTagChip
                          key={subject}
                          label={subjectLabel(subject)}
                          color={color}
                          onColorChange={(nextColor) => updateSubjectTagColor(subject, nextColor)}
                          onRemove={() => toggleSubject(subject)}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-slate-400">단원 후보</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="min-w-0 flex-1"
                    placeholder="예: 지수함수와 로그함수, 삼각함수, 수열"
                    value={unitInput}
                    onChange={(event) => setUnitInput(event.target.value)}
                    onBlur={addUnitCandidate}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addUnitCandidate();
                      }
                    }}
                  />
                  <TagColorPicker value={unitInputColor} onChange={setUnitInputColor} label="단원 태그 색상" />
                  <Button type="button" variant="outline" onClick={addUnitCandidate}>추가</Button>
                </div>
                <p className="mt-1 text-xs text-slate-500">쉼표로 여러 단원을 한 번에 입력할 수 있습니다. 단원 후보가 있으면 AI가 문항별로 가장 가까운 단원을 고릅니다.</p>
                {unitCandidates.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unitCandidates.map((unit) => {
                      const color = tagColor(unit, unitTagColors, "unit");
                      return (
                        <EditableTagChip
                          key={unit}
                          label={unit}
                          color={color}
                          onColorChange={(nextColor) => updateUnitTagColor(unit, nextColor)}
                          onRemove={() => removeUnitCandidate(unit)}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <DropZone label="문제 PDF" helper="문제 PDF" file={problemPdf} required onChange={handleProblemPdfChange} />
            <DropZone label="해설 PDF" helper="해설 PDF" file={solutionPdf} onChange={setSolutionPdf} />
          </div>

          {problemPdf ? (
            <div className="rounded-lg border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.18),rgba(255,255,255,0.035)_52%,rgba(0,0,0,0.18))] p-4 shadow-[0_18px_52px_rgba(76,29,149,0.16)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-200">
                    <Sparkles className="h-4 w-4" />
                    예상 credits
                  </div>
                  <div className="mt-2 text-3xl font-black text-white">
                    {creditEstimate ? `${formatCompactNumber(creditEstimate.credits)} credits` : "계산 중"}
                  </div>
                </div>
                <div className="rounded-[8px] border border-white/10 bg-black/25 px-3 py-2 text-right">
                  <div className="text-xs font-semibold text-slate-500">남은 credits</div>
                  <div className="mt-1 text-sm font-black text-white">
                    {creditsRemaining === null ? "불러오는 중" : `${formatCompactNumber(creditsRemaining)} → ${formatCompactNumber(creditsAfterUpload ?? creditsRemaining)}`}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-300 sm:grid-cols-4">
                <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">문제 {pageEstimateLabel(problemPdfEstimate)}</div>
                <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">해설 {solutionPdf ? pageEstimateLabel(solutionPdfEstimate) : "-"}</div>
                <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">파일 {formatCompactNumber(fileSizeMb(problemPdf) + fileSizeMb(solutionPdf))}MB</div>
                <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">{creditEstimate?.hardScan ? "스캔 가중치 적용" : subjectEngine === "korean" ? "국어 엔진 가중치" : "기본 가중치"}</div>
              </div>
              {creditEstimate?.approximate || problemPdfEstimate.error || solutionPdfEstimate.error ? (
                <p className="mt-3 text-xs font-semibold text-amber-200">페이지 수를 정확히 읽기 어려운 PDF는 파일 크기 기준으로 보수 추정합니다.</p>
              ) : null}
              {creditEstimateExceedsRemaining ? (
                <p className="mt-3 text-xs font-semibold text-red-200">현재 남은 credits보다 예상 소모량이 큽니다. 플랜 사용량을 확인해주세요.</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-violet-200" />
              업로드 권리 확인
            </h2>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <p>업로드하는 자료는 본인이 직접 제작했거나, 저장·변환·재구성·출력에 사용할 권리를 보유한 자료여야 합니다.</p>
              <p>시중 교재, 인강 교재, 타 학원 자료, 유료 문제집, 해설, 이미지, 도표 등을 권한 없이 업로드하거나 문항화하여 사용하는 것은 제한됩니다.</p>
              <p className="text-xs text-slate-500">권리 없는 자료를 업로드하여 발생하는 법적 책임은 업로드한 사용자에게 있으며, Tena Forge는 신고 또는 확인 절차에 따라 해당 자료의 이용을 제한할 수 있습니다.</p>
            </div>
            <label className="mt-4 flex items-start gap-3 rounded-md border border-white/10 bg-black/30 p-3 text-sm text-slate-200">
              <input className="mt-1" type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
              <span>본인은 이 자료를 직접 제작했거나, Tena Forge에서 업로드·추출·저장·재구성·출력할 권리를 보유하고 있음을 확인합니다.</span>
            </label>
            <textarea
              className="mt-3 min-h-20 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400"
              placeholder="선택 사항: 라이선스 범위, 제작자, 내부 관리 메모 등을 남겨두세요."
              value={rightsNote}
              onChange={(event) => setRightsNote(event.target.value)}
            />
          </div>

          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            아카이빙 시작
          </Button>
          {uploadPercent !== null ? (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-violet-400 transition-all duration-300" style={{ width: `${uploadPercent}%` }} />
              </div>
              <p className="text-xs text-slate-500">{uploadPercent >= 100 ? "서버에서 배치 생성 중" : `업로드 ${uploadPercent}%`}</p>
            </div>
          ) : null}
          {message ? <p className="text-sm text-slate-400">{message}</p> : null}
        </CardContent>
      </Card>

      <ArchiveBatchHistory compact refreshKey={`${batchId || ""}-${currentStatus || ""}`} activeBatchId={batchId} onActiveBatchSnapshot={handleActiveBatchSnapshot} />
    </div>
  );
}
