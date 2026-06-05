"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Check, FileText, Loader2, LockKeyhole, Pencil, Plus, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArchiveBatchHistory } from "@/components/archive/archive-batch-history";
import { ColorPicker } from "@/components/editor/color-picker";
import { Batch, BatchStatus, SourceType } from "@/lib/api";
import { authHttp } from "@/lib/auth-client";
import { readActiveBatch, rememberActiveBatch } from "@/lib/batch-progress";
import { SUBJECT_ENGINES, subjectEngineLabel } from "@/lib/plan-pricing";
import type { SubjectEngineCode } from "@/lib/plan-pricing";
import { getRoles, getUsageSummary, UsageSummary } from "@/lib/saas";
import {
  SubjectNode,
  buildSubjectTree,
  isEnglishSubjectValue,
  isKoreanSubjectValue,
  makeSubjectPathValue,
  normalizeSubjectValue,
  splitSubjectPath,
  subjectDisplayLabel,
} from "@/lib/subjectHierarchy";
import { cn } from "@/lib/utils";

type UploadResponse = { batch_id: string; status: BatchStatus };
type TagColorMap = Record<string, string>;

const SUBJECT_TAG_COLORS_KEY = "tena-forge-upload-subject-tag-colors";
const CUSTOM_SUBJECTS_KEY = "tena-forge-upload-custom-subjects-v2";
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
  if (/영어|영문|영문법|독해|어휘|듣기|ENGLISH|READING|GRAMMAR|LISTENING|VOCAB/.test(compacted)) return ["영어"];
  if (/국어|언어와매체|화법과작문|문학|비문학|독서|KOREAN|LANGUAGE/.test(compacted)) return ["국어"];
  const withoutCommonMath = compacted.replace(commonMathPattern, "");
  const subjects: string[] = [];
  filenameSubjectRules.forEach((rule) => {
    const target = rule.stripCommon ? withoutCommonMath : compacted;
    if (rule.pattern.test(target) && !subjects.includes(rule.value)) subjects.push(rule.value);
  });
  return subjects;
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

function readStringList(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map((value) => normalizeSubjectValue(String(value))).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...new Set(values.map(normalizeSubjectValue).filter(Boolean))]));
}

function isSubjectPathMatch(value: string, target: string) {
  const normalizedValue = normalizeSubjectValue(value);
  const normalizedTarget = normalizeSubjectValue(target);
  return normalizedValue === normalizedTarget || normalizedValue.startsWith(`${normalizedTarget} > `);
}

function replaceSubjectPathPrefix(value: string, oldPrefix: string, newPrefix: string) {
  const normalizedValue = normalizeSubjectValue(value);
  const normalizedOld = normalizeSubjectValue(oldPrefix);
  const normalizedNew = normalizeSubjectValue(newPrefix);
  if (!isSubjectPathMatch(normalizedValue, normalizedOld)) return normalizedValue;
  return normalizeSubjectValue(`${normalizedNew}${normalizedValue.slice(normalizedOld.length)}`);
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

const languageSubjectByEngine: Partial<Record<SubjectEngineCode, string>> = {
  korean: "국어",
  english: "영어",
};

function isLanguagePassageEngine(engine: SubjectEngineCode) {
  return engine === "korean" || engine === "english";
}

function subjectEngineForSubject(subject: string): SubjectEngineCode | null {
  if (isKoreanSubjectValue(subject)) return "korean";
  if (isEnglishSubjectValue(subject)) return "english";
  return null;
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
  subjectEngine: SubjectEngineCode;
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
  if (isLanguagePassageEngine(subjectEngine)) {
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

function SubjectTreeSelector({
  nodes,
  selectedSubjects,
  subjectTagColors,
  onToggleSubject,
  onAddSubject,
  onRenameSubject,
  onDeleteSubject,
}: {
  nodes: SubjectNode[];
  selectedSubjects: string[];
  subjectTagColors: TagColorMap;
  onToggleSubject: (subject: string) => void;
  onAddSubject: (subject: string, color: string) => void;
  onRenameSubject: (oldSubject: string, newSubject: string, color: string) => void;
  onDeleteSubject: (subject: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addTarget, setAddTarget] = useState<"root" | string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState(tagPalette[0]);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState(tagPalette[0]);

  function nodeValue(node: SubjectNode) {
    return normalizeSubjectValue(node.value || node.label);
  }

  function openDraft(target: "root" | string) {
    setEditing(true);
    setAddTarget(target);
    setEditTarget(null);
    setDraftLabel("");
  }

  function openEdit(subject: string, label: string, color: string) {
    setEditing(true);
    setAddTarget(null);
    setEditTarget(subject);
    setEditLabel(label);
    setEditColor(color);
  }

  function commitDraft(target: "root" | string) {
    const label = normalizeSubjectValue(draftLabel);
    if (!label) return;
    const subject = target === "root" ? label : normalizeSubjectValue(makeSubjectPathValue(target, label));
    if (!subject) return;
    onAddSubject(subject, draftColor);
    setAddTarget(null);
    setDraftLabel("");
    setDraftColor((current) => nextPaletteColor(current));
  }

  function commitEdit(subject: string) {
    const label = normalizeSubjectValue(editLabel);
    if (!label) return;
    const path = splitSubjectPath(subject);
    const parent = path.slice(0, -1).join(" > ");
    const nextSubject = parent ? makeSubjectPathValue(parent, label) : label;
    onRenameSubject(subject, nextSubject, editColor);
    setEditTarget(null);
    setEditLabel("");
  }

  function deleteSubject(subject: string, label: string) {
    if (!window.confirm(`${label} 항목과 하위 항목을 삭제할까요?`)) return;
    onDeleteSubject(subject);
    if (addTarget && isSubjectPathMatch(addTarget, subject)) setAddTarget(null);
    if (editTarget && isSubjectPathMatch(editTarget, subject)) setEditTarget(null);
  }

  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-black/10 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-300">과목 분류</p>
          <p className="mt-1 text-xs text-slate-500">업로드할 자료에 맞춰 직접 추가해 주세요.</p>
        </div>
        <button
          type="button"
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border transition",
            editing ? "border-violet-300/60 bg-violet-400/20 text-violet-100 shadow-[0_0_22px_rgba(139,92,246,0.24)]" : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/[0.07] hover:text-white"
          )}
          onClick={() => {
            setEditing((current) => !current);
            setAddTarget(null);
            setDraftLabel("");
            setEditTarget(null);
            setEditLabel("");
          }}
          aria-label={editing ? "과목 편집 종료" : "과목 편집"}
          title={editing ? "과목 편집 종료" : "과목 편집"}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="max-w-full overflow-hidden">
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] items-start gap-3">
        {nodes.map((node) => {
          const nodeKey = nodeValue(node);
          const groupColor = tagColor(nodeKey, subjectTagColors, "subject");
          return (
            <div key={nodeKey} className="min-w-0 rounded-[8px] bg-white/[0.018] p-3">
              {editing && editTarget === nodeKey ? (
                <SubjectEditRow
                  value={editLabel}
                  color={editColor}
                  placeholder="상위 항목 이름"
                  label="상위 항목 수정"
                  onChange={setEditLabel}
                  onColorChange={setEditColor}
                  onSubmit={() => commitEdit(nodeKey)}
                  onCancel={() => setEditTarget(null)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: groupColor }} />
                  <button
                    type="button"
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-base font-black transition hover:text-white",
                      selectedSubjects.includes(nodeKey) ? "text-white" : "text-slate-100"
                    )}
                    onClick={() => onToggleSubject(nodeKey)}
                  >
                    {node.label}
                  </button>
                  {editing ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-black/25 text-slate-200 transition hover:border-violet-300/50 hover:bg-violet-400/15 hover:text-white"
                        onClick={() => openEdit(nodeKey, node.label, groupColor)}
                        aria-label={`${node.label} 수정`}
                        title={`${node.label} 수정`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "grid h-7 w-7 place-items-center rounded-full border transition hover:border-violet-300/50 hover:bg-violet-400/15 hover:text-white",
                          addTarget === nodeKey ? "border-violet-300/70 bg-violet-400/20 text-violet-50" : "border-white/12 bg-black/25 text-slate-200"
                        )}
                        onClick={() => openDraft(nodeKey)}
                        aria-label={`${node.label} 하위 항목 추가`}
                        title={`${node.label} 하위 항목 추가`}
                        aria-pressed={addTarget === nodeKey}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-black/25 text-rose-200 transition hover:border-rose-300/50 hover:bg-rose-500/15 hover:text-rose-50"
                        onClick={() => deleteSubject(nodeKey, node.label)}
                        aria-label={`${node.label} 삭제`}
                        title={`${node.label} 삭제`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
              <div className="relative mt-3 min-h-16 pl-5">
                <span className="absolute left-[9px] top-0 h-full w-1 rounded-full opacity-80" style={{ backgroundColor: groupColor }} />
                <div className="space-y-2">
                  {node.children?.map((child) => (
                    <SubjectFolderRow
                      key={nodeValue(child)}
                      node={child}
                      level={1}
                      branchColor={groupColor}
                      subjectTagColors={subjectTagColors}
                      selectedSubjects={selectedSubjects}
                      editing={editing}
                      addTarget={addTarget}
                      draftLabel={draftLabel}
                      draftColor={draftColor}
                      onToggle={onToggleSubject}
                      onOpenDraft={openDraft}
                      onOpenEdit={openEdit}
                      onDelete={deleteSubject}
                      onDraftLabelChange={setDraftLabel}
                      onDraftColorChange={setDraftColor}
                      onCommitDraft={commitDraft}
                      editTarget={editTarget}
                      editLabel={editLabel}
                      editColor={editColor}
                      onEditLabelChange={setEditLabel}
                      onEditColorChange={setEditColor}
                      onCommitEdit={commitEdit}
                      onCancelEdit={() => setEditTarget(null)}
                    />
                  ))}
                  {editing && addTarget === nodeKey ? (
                    <SubjectDraftRow
                      value={draftLabel}
                      color={draftColor}
                      placeholder="하위항목"
                      label={`${node.label} 하위 항목`}
                      onChange={setDraftLabel}
                      onColorChange={setDraftColor}
                      onSubmit={() => commitDraft(nodeKey)}
                    />
                  ) : null}
                  {!node.children?.length && !(editing && addTarget === nodeKey) ? (
                    <div className="py-2 text-xs font-semibold text-slate-600">하위 항목 없음</div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {editing ? (
          addTarget === "root" ? (
            <div className="min-w-0 rounded-[8px] border border-dashed border-violet-300/40 bg-violet-400/[0.06] p-3">
              <SubjectDraftRow
                value={draftLabel}
                color={draftColor}
                placeholder="상위 항목 이름"
                label="상위 항목 이름"
                onChange={setDraftLabel}
                onColorChange={setDraftColor}
                onSubmit={() => commitDraft("root")}
              />
            </div>
          ) : (
            <div className="min-w-0 rounded-[8px] border border-dashed border-white/10 bg-white/[0.025] p-3">
              <button
                type="button"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] text-sm font-black text-slate-100 transition hover:border-violet-300/40 hover:bg-violet-400/10"
                onClick={() => openDraft("root")}
              >
                <Plus className="h-5 w-5" />
                상위 항목 추가
              </button>
            </div>
          )
        ) : null}

        {!nodes.length && !editing ? (
          <button
            type="button"
            className="flex min-h-24 items-center justify-center gap-2 rounded-[8px] border border-dashed border-white/12 bg-white/[0.025] px-3 py-4 text-sm font-bold text-slate-300 transition hover:border-violet-300/40 hover:bg-violet-400/10 hover:text-violet-50 md:col-span-2 xl:col-span-3"
            onClick={() => {
              openDraft("root");
            }}
          >
            <Plus className="h-4 w-4" />
            첫 과목 또는 자료 묶음 추가
          </button>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function SubjectFolderRow({
  node,
  level,
  branchColor,
  subjectTagColors,
  selectedSubjects,
  editing,
  addTarget,
  draftLabel,
  draftColor,
  editTarget,
  editLabel,
  editColor,
  onToggle,
  onOpenDraft,
  onOpenEdit,
  onDelete,
  onDraftLabelChange,
  onDraftColorChange,
  onCommitDraft,
  onEditLabelChange,
  onEditColorChange,
  onCommitEdit,
  onCancelEdit,
}: {
  node: SubjectNode;
  level: number;
  branchColor: string;
  subjectTagColors: TagColorMap;
  selectedSubjects: string[];
  editing: boolean;
  addTarget: "root" | string | null;
  draftLabel: string;
  draftColor: string;
  editTarget: string | null;
  editLabel: string;
  editColor: string;
  onToggle: (subject: string) => void;
  onOpenDraft: (target: string) => void;
  onOpenEdit: (subject: string, label: string, color: string) => void;
  onDelete: (subject: string, label: string) => void;
  onDraftLabelChange: (value: string) => void;
  onDraftColorChange: (color: string) => void;
  onCommitDraft: (target: string) => void;
  onEditLabelChange: (value: string) => void;
  onEditColorChange: (color: string) => void;
  onCommitEdit: (subject: string) => void;
  onCancelEdit: () => void;
}) {
  const value = normalizeSubjectValue(node.value || node.label);
  const color = tagColor(value, subjectTagColors, "subject");
  const selected = selectedSubjects.includes(value);
  const indent = Math.min(level - 1, 2) * 1.1;

  return (
    <div className="space-y-2">
      {editing && editTarget === value ? (
        <div className="relative" style={{ marginLeft: `${indent}rem`, width: `calc(100% - ${indent}rem)` }}>
          <span className="absolute -left-[15px] top-5 h-0.5 w-3 rounded-full opacity-80" style={{ backgroundColor: branchColor }} />
          <SubjectEditRow
            value={editLabel}
            color={editColor}
            placeholder="항목 이름"
            label={`${node.label} 수정`}
            onChange={onEditLabelChange}
            onColorChange={onEditColorChange}
            onSubmit={() => onCommitEdit(value)}
            onCancel={onCancelEdit}
          />
        </div>
      ) : (
        <div className="relative flex items-center gap-1.5" style={{ marginLeft: `${indent}rem`, width: `calc(100% - ${indent}rem)` }}>
          <span className="absolute -left-[15px] top-1/2 h-0.5 w-3 -translate-y-1/2 rounded-full opacity-80" style={{ backgroundColor: branchColor }} />
          <button
            type="button"
            className={cn(
              "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[7px] px-2 text-left text-sm font-bold transition hover:bg-white/[0.04]",
              selected ? "text-white" : "text-slate-300 hover:text-white"
            )}
            onClick={() => onToggle(value)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: color }} />
            <span className="truncate">{node.label}</span>
          </button>
          {editing ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-black/25 text-slate-200 transition hover:border-violet-300/50 hover:bg-violet-400/15 hover:text-white"
                onClick={() => onOpenEdit(value, node.label, color)}
                aria-label={`${node.label} 수정`}
                title={`${node.label} 수정`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-black/25 text-slate-200 transition hover:border-violet-300/50 hover:bg-violet-400/15 hover:text-white"
                onClick={() => onOpenDraft(value)}
                aria-label={`${node.label} 하위 항목 추가`}
                title={`${node.label} 하위 항목 추가`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-full border border-white/12 bg-black/25 text-rose-200 transition hover:border-rose-300/50 hover:bg-rose-500/15 hover:text-rose-50"
                onClick={() => onDelete(value, node.label)}
                aria-label={`${node.label} 삭제`}
                title={`${node.label} 삭제`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      )}
      {editing && addTarget === value ? (
        <div style={{ marginLeft: `${Math.min(level, 3) * 0.85}rem` }}>
          <SubjectDraftRow
            value={draftLabel}
            color={draftColor}
            placeholder={level === 1 ? "하하위항목" : "하위항목"}
            label={level === 1 ? `${node.label} 하하위 항목` : `${node.label} 하위 항목`}
            onChange={onDraftLabelChange}
            onColorChange={onDraftColorChange}
            onSubmit={() => onCommitDraft(value)}
          />
        </div>
      ) : null}
      {node.children?.map((child) => (
        <SubjectFolderRow
          key={normalizeSubjectValue(child.value || child.label)}
          node={child}
          level={level + 1}
          branchColor={branchColor}
          subjectTagColors={subjectTagColors}
          selectedSubjects={selectedSubjects}
          editing={editing}
          addTarget={addTarget}
          draftLabel={draftLabel}
          draftColor={draftColor}
          editTarget={editTarget}
          editLabel={editLabel}
          editColor={editColor}
          onToggle={onToggle}
          onOpenDraft={onOpenDraft}
          onOpenEdit={onOpenEdit}
          onDelete={onDelete}
          onDraftLabelChange={onDraftLabelChange}
          onDraftColorChange={onDraftColorChange}
          onCommitDraft={onCommitDraft}
          onEditLabelChange={onEditLabelChange}
          onEditColorChange={onEditColorChange}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
        />
      ))}
    </div>
  );
}

function SubjectDraftRow({
  value,
  color,
  placeholder,
  label,
  onChange,
  onColorChange,
  onSubmit,
}: {
  value: string;
  color: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-[7px] border border-dashed border-violet-300/30 bg-violet-400/[0.055] p-2 shadow-[0_12px_26px_rgba(76,29,149,0.12)]">
      <Input
        autoFocus
        aria-label={label}
        className="h-10 w-full border-white/10 bg-black/30 text-sm font-semibold text-white placeholder:text-slate-500"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TagColorPicker value={color} onChange={onColorChange} label={`${placeholder} 색상`} />
        </div>
        <Button type="button" size="sm" variant="outline" className="h-10 w-10 shrink-0 px-0" onClick={onSubmit}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SubjectEditRow({
  value,
  color,
  placeholder,
  label,
  onChange,
  onColorChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  color: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-[7px] border border-violet-300/35 bg-violet-400/[0.07] p-2 shadow-[0_12px_26px_rgba(76,29,149,0.12)]">
      <Input
        autoFocus
        aria-label={label}
        className="h-10 w-full border-white/10 bg-black/30 text-sm font-semibold text-white placeholder:text-slate-500"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TagColorPicker value={color} onChange={onColorChange} label={`${placeholder} 색상`} />
        </div>
        <Button type="button" size="sm" variant="outline" className="h-10 w-10 shrink-0 px-0" onClick={onSubmit}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10 w-10 shrink-0 px-0" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DropZone({
  label,
  file,
  required = false,
  onChange
}: {
  label: string;
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
        {file || isDragging ? <span className="mt-2 text-sm text-slate-400">{file ? file.name : "여기에 PDF를 놓으세요"}</span> : null}
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
  const [subjectEngine, setSubjectEngine] = useState<SubjectEngineCode>("math");
  const [subjectEngineTouched, setSubjectEngineTouched] = useState(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [batchAccentColor, setBatchAccentColor] = useState(() => defaultTagColor("new-batch", "batch"));
  const [batchColorTouched, setBatchColorTouched] = useState(false);
  const [customSubjectOptions, setCustomSubjectOptions] = useState<string[]>([]);
  const [subjectTagColors, setSubjectTagColors] = useState<TagColorMap>({});
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
    setCustomSubjectOptions(readStringList(CUSTOM_SUBJECTS_KEY));
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

  function applyInferredSubjectEngine(engine: SubjectEngineCode) {
    if (!subjectEngineTouched) setSubjectEngine(engine);
  }

  function selectSubjectEngine(engine: SubjectEngineCode) {
    setSubjectEngineTouched(true);
    setSubjectEngine(engine);
  }

  function toggleSubject(subject: string) {
    const normalized = normalizeSubjectValue(subject);
    if (!normalized) return;
    const inferredEngine = subjectEngineForSubject(normalized);
    if (inferredEngine) applyInferredSubjectEngine(inferredEngine);
    setSelectedSubjects((current) => (current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized]));
  }

  function addCustomSubject(subjectValue: string, color: string) {
    const subject = normalizeSubjectValue(subjectValue);
    if (!subject) return;
    setSelectedSubjects((current) => (current.includes(subject) ? current : [...current, subject]));
    setCustomSubjectOptions((current) => {
      const next = current.includes(subject) ? current : [...current, subject];
      writeStringList(CUSTOM_SUBJECTS_KEY, next);
      return next;
    });
    const inferredEngine = subjectEngineForSubject(subject);
    if (inferredEngine) applyInferredSubjectEngine(inferredEngine);
    updateSubjectTagColor(subject, color);
  }

  function renameCustomSubject(oldSubjectValue: string, newSubjectValue: string, color: string) {
    const oldSubject = normalizeSubjectValue(oldSubjectValue);
    const newSubject = normalizeSubjectValue(newSubjectValue);
    if (!oldSubject || !newSubject) return;

    setSelectedSubjects((current) => {
      const next = current.map((subject) => (isSubjectPathMatch(subject, oldSubject) ? replaceSubjectPathPrefix(subject, oldSubject, newSubject) : subject));
      return [...new Set(next)];
    });
    setCustomSubjectOptions((current) => {
      const hasTarget = current.some((subject) => isSubjectPathMatch(subject, oldSubject));
      const next = (hasTarget ? current : [...current, oldSubject]).map((subject) => (isSubjectPathMatch(subject, oldSubject) ? replaceSubjectPathPrefix(subject, oldSubject, newSubject) : subject));
      writeStringList(CUSTOM_SUBJECTS_KEY, next);
      return [...new Set(next)];
    });
    setSubjectTagColors((current) => {
      const next: TagColorMap = {};
      Object.entries(current).forEach(([subject, subjectColor]) => {
        if (isSubjectPathMatch(subject, oldSubject)) {
          const nextSubject = replaceSubjectPathPrefix(subject, oldSubject, newSubject);
          next[nextSubject] = subject === oldSubject ? color : subjectColor;
          return;
        }
        next[subject] = subjectColor;
      });
      next[newSubject] = color;
      writeTagColors(SUBJECT_TAG_COLORS_KEY, next);
      return next;
    });
  }

  function deleteCustomSubject(subjectValue: string) {
    const subject = normalizeSubjectValue(subjectValue);
    if (!subject) return;
    setSelectedSubjects((current) => current.filter((item) => !isSubjectPathMatch(item, subject)));
    setCustomSubjectOptions((current) => {
      const next = current.filter((item) => !isSubjectPathMatch(item, subject));
      writeStringList(CUSTOM_SUBJECTS_KEY, next);
      return next;
    });
    setSubjectTagColors((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([item]) => !isSubjectPathMatch(item, subject)));
      writeTagColors(SUBJECT_TAG_COLORS_KEY, next);
      return next;
    });
  }

  function updateSubjectTagColor(subject: string, color: string) {
    setSubjectTagColors((current) => {
      const next = { ...current, [subject]: color };
      writeTagColors(SUBJECT_TAG_COLORS_KEY, next);
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
      const nextSubjects = inferredSubjects.map(normalizeSubjectValue).filter(Boolean);
      setSelectedSubjects((current) => [...current, ...nextSubjects.filter((subject) => !current.includes(subject))]);
      const inferredEngine = nextSubjects.map(subjectEngineForSubject).find(Boolean);
      if (inferredEngine) applyInferredSubjectEngine(inferredEngine);
    }
    setAutoBatchName(nextAutoBatchName);
  }

  async function submit() {
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
    form.append("unit_candidates", JSON.stringify([]));
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
  const enabledSubjectEngines = useMemo(
    () => usageSummary?.subscription?.enabled_subject_engines || usageSummary?.plan.enabled_subject_engines || ["math"],
    [usageSummary],
  );
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  const selectedEngineLocked = !isAdmin && Boolean(usageSummary) && !enabledSubjectEngines.includes(subjectEngine);
  const subjectTree = useMemo(() => buildSubjectTree(customSubjectOptions), [customSubjectOptions]);

  useEffect(() => {
    if (isAdmin || !usageSummary || enabledSubjectEngines.includes(subjectEngine)) return;
    const nextEngine = enabledSubjectEngines.find((engine): engine is SubjectEngineCode => engine === "math" || engine === "korean" || engine === "english") || "math";
    setSubjectEngine(nextEngine);
    setSubjectEngineTouched(false);
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
  const creditEstimatePanel = problemPdf ? (
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
      <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-300 sm:grid-cols-2">
        <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">문제 {pageEstimateLabel(problemPdfEstimate)}</div>
        <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">해설 {solutionPdf ? pageEstimateLabel(solutionPdfEstimate) : "-"}</div>
        <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">파일 {formatCompactNumber(fileSizeMb(problemPdf) + fileSizeMb(solutionPdf))}MB</div>
        <div className="rounded-[7px] border border-white/10 bg-black/20 px-3 py-2">{creditEstimate?.hardScan ? "스캔 가중치 적용" : isLanguagePassageEngine(subjectEngine) ? `${subjectEngineLabel(subjectEngine)} 가중치` : "기본 가중치"}</div>
      </div>
      {creditEstimate?.approximate || problemPdfEstimate.error || solutionPdfEstimate.error ? (
        <p className="mt-3 text-xs font-semibold text-amber-200">페이지 수를 정확히 읽기 어려운 PDF는 파일 크기 기준으로 보수 추정합니다.</p>
      ) : null}
      {creditEstimateExceedsRemaining ? (
        <p className="mt-3 text-xs font-semibold text-red-200">현재 남은 credits보다 예상 소모량이 큽니다. 플랜 사용량을 확인해주세요.</p>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <section className="hidden">
        <div className="inline-flex items-center gap-2 rounded-md border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
          <ShieldCheck className="h-4 w-4" />
          권리 보유 자료 문항화
        </div>
        <h1 className="mt-4 text-3xl font-bold text-white">내 자료 아카이빙</h1>
      </section>

      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input className="min-w-0 flex-1" placeholder="배치 이름" value={batchName} onChange={(event) => updateBatchName(event.target.value)} />
                <TagColorPicker value={batchAccentColor} onChange={updateBatchAccentColor} label="배치 색상" />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h2 className="text-sm font-bold text-white">Subject Engine</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUBJECT_ENGINES.map((engine) => {
                    const locked = !isAdmin && Boolean(usageSummary) && !enabledSubjectEngines.includes(engine.code);
                    const selected = subjectEngine === engine.code;
                    return (
                      <button
                        key={engine.code}
                        type="button"
                        disabled={locked}
                        className={cn(
                          "rounded-[8px] border px-3 py-2 text-sm font-semibold transition",
                          selected ? "border-violet-300/70 bg-violet-500/20 text-violet-50" : "border-white/10 bg-black/20 text-slate-300 hover:border-white/25",
                          locked && "cursor-not-allowed opacity-45"
                        )}
                        onClick={() => {
                          selectSubjectEngine(engine.code);
                          const languageSubject = languageSubjectByEngine[engine.code];
                          if (languageSubject && !selectedSubjects.includes(languageSubject)) {
                            setSelectedSubjects((current) => [...current, languageSubject]);
                          }
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {locked ? <LockKeyhole className="h-3.5 w-3.5" /> : null}
                          {subjectEngineLabel(engine.code)}{locked ? " · Locked" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedEngineLocked ? <p className="mt-3 text-xs text-amber-200">선택한 엔진은 현재 플랜에서 사용할 수 없습니다.</p> : null}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="space-y-4">
                  <div>
                    <SubjectTreeSelector
                      nodes={subjectTree}
                      selectedSubjects={selectedSubjects}
                      subjectTagColors={subjectTagColors}
                      onToggleSubject={toggleSubject}
                      onAddSubject={addCustomSubject}
                      onRenameSubject={renameCustomSubject}
                      onDeleteSubject={deleteCustomSubject}
                    />
                    {selectedSubjects.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedSubjects.map((subject) => {
                          const color = tagColor(subject, subjectTagColors, "subject");
                          return (
                            <EditableTagChip
                              key={subject}
                              label={subjectDisplayLabel(subject)}
                              color={color}
                              onColorChange={(nextColor) => updateSubjectTagColor(subject, nextColor)}
                              onRemove={() => toggleSubject(subject)}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-400">배치 메모</span>
                    <textarea
                      className="min-h-20 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400"
                      placeholder="선택 사항: 배치에 남겨둘 메모를 입력하세요."
                      value={rightsNote}
                      onChange={(event) => setRightsNote(event.target.value)}
                    />
                  </label>

                  {creditEstimatePanel}
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-5 xl:sticky xl:top-20 xl:self-start">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <DropZone label="문제 PDF" file={problemPdf} required onChange={handleProblemPdfChange} />
                <DropZone label="해설 PDF" file={solutionPdf} onChange={setSolutionPdf} />
              </div>

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
          </div>

          <Button className="w-full" onClick={submit} disabled={!canSubmit}>
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
            </div>
          </div>
        </CardContent>
      </Card>

      <ArchiveBatchHistory compact refreshKey={`${batchId || ""}-${currentStatus || ""}`} activeBatchId={batchId} onActiveBatchSnapshot={handleActiveBatchSnapshot} />
    </div>
  );
}
