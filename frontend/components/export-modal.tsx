"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

import { TemplatePageView } from "@/components/templates/visual-template-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExamTemplate, VisualPagePlan, api, downloadExport } from "@/lib/api";
import { ClassCard, StudentCard, createPaperSession, getStudentExamStatsSeries, getStudentManagementDashboard } from "@/lib/studentManagement";
import { collectVisualTemplateManualVariables, createDynamicPreviewPages } from "@/lib/visualTemplateEngine";
import { PAGE_SIZES, TemplateSet } from "@/lib/visualTemplateTypes";
import { HubTemplate, listMyTemplates, listPublicTemplates } from "@/lib/templateHub";

export type ExportTemplateKind = "visual" | "legacy" | "html";

export type ExportedProblemSetInfo = {
  source: "set" | "selection";
  problemSetId?: string | null;
  problemIds?: string[];
  count: number;
  examTitle: string;
  templateTitle?: string | null;
  templateKind?: ExportTemplateKind;
  output?: string;
  includeSolution: boolean;
  includeMissingSolutionMetadata: boolean;
};

type ExportTemplateOption = {
  id: string;
  kind: ExportTemplateKind;
  title: string;
  description?: string | null;
  badge: string;
  templateSet?: TemplateSet;
  legacy?: ExamTemplate;
  hub?: HubTemplate;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", ".") : value;
}

function timeLabel(startTime: string, endTime: string) {
  const start = startTime.trim();
  const end = endTime.trim();
  if (start && end) return `${start} ~ ${end}`;
  return start || end;
}

function dateTimeLabel(date: string, startTime: string, endTime: string) {
  return [dateLabel(date), timeLabel(startTime, endTime)].filter(Boolean).join(" ");
}

function getVisualTemplateSet(template: HubTemplate): TemplateSet | null {
  const schema = template.schema_json as { visualTemplateSet?: unknown } | null;
  const visual = schema?.visualTemplateSet;
  if (!visual || typeof visual !== "object") return null;
  const candidate = visual as TemplateSet;
  if (!Array.isArray(candidate.pages) || !candidate.defaultPageSize) return null;
  return candidate;
}

function studentExamStatsBindings(templateSet?: TemplateSet | null) {
  const bindings = new Map<string, { key: string; start_date?: string; end_date?: string }>();
  for (const page of templateSet?.pages || []) {
    for (const element of page.elements || []) {
      if (element.type !== "examStatsChart" || element.dataSource !== "studentExamHistory") continue;
      const key = element.dataVariableKey || "exam_stats_series_json";
      bindings.set(`${key}:${element.xAxisDateStart || ""}:${element.xAxisDateEnd || ""}`, {
        key,
        start_date: element.xAxisDateStart || undefined,
        end_date: element.xAxisDateEnd || undefined,
      });
    }
  }
  return Array.from(bindings.values());
}

function dedupeHubTemplates(items: HubTemplate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function templateCategoryLabel(value: string) {
  return {
    exam: "시험지",
    workbook: "교재",
    worksheet: "워크북",
    wrong_answer_note: "오답노트",
    solution_book: "답안지",
    concept_note: "개념노트",
    unit_test: "단원평가지",
    cover: "표지",
  }[value] || value;
}

function outputLabel(kind?: ExportTemplateKind) {
  return kind === "html" ? "HTML" : "PDF";
}

function findPageId(templateSet: TemplateSet | null | undefined, roles: string[]) {
  return templateSet?.pages.find((page) => roles.includes(page.role))?.id || templateSet?.pages[0]?.id || "";
}

function VisualTemplatePreview({ templateSet }: { templateSet: TemplateSet }) {
  const page = useMemo(() => createDynamicPreviewPages(templateSet)[0] || templateSet.pages[0], [templateSet]);
  const size = page?.pageSize || templateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
  const previewWidth = 340;
  const scale = Math.min(0.42, previewWidth / Math.max(size.width, 1));
  const scaledWidth = size.width * scale;
  const scaledHeight = size.height * scale;
  if (!page) return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">미리보기 없음</div>;

  return (
    <div className="relative flex h-full w-full items-start justify-center overflow-hidden bg-[#111318] px-4 py-3">
      <div className="relative shrink-0" style={{ width: scaledWidth, height: scaledHeight }}>
        <TemplatePageView templateSet={templateSet} page={page} scale={scale} scaleOrigin="top-left" selectedIds={[]} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111318] to-transparent" />
    </div>
  );
}

function PageSelect({
  label,
  value,
  onChange,
  templateSet,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  templateSet: TemplateSet;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
      {label}
      <select
        className="h-9 rounded-md border border-white/10 bg-[#10131b] px-2 text-sm text-slate-100 outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">페이지 선택</option>
        {templateSet.pages.map((page, index) => (
          <option key={page.id} value={page.id}>
            {index + 1}. {page.name} / {page.role}
          </option>
        ))}
      </select>
    </label>
  );
}

function LegacyTemplatePreview({ template }: { template: ExamTemplate }) {
  return (
    <div className="flex h-full flex-col bg-white p-4 text-[#111827]">
      <div className="border-b-2 border-[#111827] pb-3 text-center text-sm font-black">{template.academy_name || "Tena Forge"}</div>
      <div className="mt-5 grid flex-1 grid-cols-2 gap-3">
        {Array.from({ length: Math.max(1, template.problems_per_page) }).map((_, index) => (
          <div key={index} className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 h-3 w-12 rounded bg-slate-900" />
            <div className="space-y-1">
              <div className="h-2 rounded bg-slate-200" />
              <div className="h-2 rounded bg-slate-200" />
              <div className="h-2 w-2/3 rounded bg-slate-200" />
            </div>
            <div className="mt-4 h-10 rounded border border-dashed border-slate-300" />
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-[10px] text-slate-400">PDF Legacy</div>
    </div>
  );
}

export function ExportModal({
  open,
  onOpenChange,
  source,
  problemSetId,
  problemIds,
  count,
  initialTemplateId,
  hideTemplateSelection = false,
  onExported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: "set" | "selection";
  problemSetId?: string | null;
  problemIds?: string[];
  count: number;
  initialTemplateId?: string | null;
  hideTemplateSelection?: boolean;
  onExported?: (item: ExportedProblemSetInfo) => void;
}) {
  const [legacyTemplates, setLegacyTemplates] = useState<ExamTemplate[]>([]);
  const [hubTemplates, setHubTemplates] = useState<HubTemplate[]>([]);
  const [selectedKind, setSelectedKind] = useState<ExportTemplateKind>("visual");
  const [selectedId, setSelectedId] = useState("");
  const [examTitle, setExamTitle] = useState("시험지");
  const [className, setClassName] = useState("");
  const [studentName, setStudentName] = useState("");
  const [date, setDate] = useState(today());
  const [examStartTime, setExamStartTime] = useState("");
  const [examEndTime, setExamEndTime] = useState("");
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({});
  const [documentKind, setDocumentKind] = useState<"exam" | "textbook">("exam");
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  const [includeAnswerPage, setIncludeAnswerPage] = useState(false);
  const [coverPageId, setCoverPageId] = useState("");
  const [firstProblemPageId, setFirstProblemPageId] = useState("");
  const [bodyProblemPageId, setBodyProblemPageId] = useState("");
  const [leftInnerPageId, setLeftInnerPageId] = useState("");
  const [rightInnerPageId, setRightInnerPageId] = useState("");
  const [answerPageId, setAnswerPageId] = useState("");
  const [assignEnabled, setAssignEnabled] = useState(false);
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);
  const [assignType, setAssignType] = useState("test");
  const [loading, setLoading] = useState(false);
  const examTime = timeLabel(examStartTime, examEndTime);
  const examDateTime = dateTimeLabel(date, examStartTime, examEndTime);

  useEffect(() => {
    if (!open) return;

    setAssignEnabled(false);
    setAssignClassId("");
    setAssignStudentIds([]);
    setAssignType("test");

    api<ExamTemplate[]>("/api/templates")
      .then((data) => {
        setLegacyTemplates(data);
        if (hideTemplateSelection) {
          const preferred = data.find((template) => template.id === initialTemplateId) || data[0];
          if (preferred) {
            setSelectedKind("legacy");
            setSelectedId(preferred.id);
          }
        }
      })
      .catch(() => setLegacyTemplates([]));

    if (!hideTemplateSelection) {
      Promise.all([
        listMyTemplates().catch(() => [] as HubTemplate[]),
        listPublicTemplates({ sort: "most_used" }).catch(() => [] as HubTemplate[]),
      ]).then(([mine, publicItems]) => setHubTemplates(dedupeHubTemplates([...mine, ...publicItems])));
    }

    getStudentManagementDashboard()
      .then((dashboard) => setClasses(dashboard.classes))
      .catch(() => setClasses([]));
  }, [open, initialTemplateId, hideTemplateSelection]);

  const options = useMemo<ExportTemplateOption[]>(() => {
    const visual = hubTemplates
      .map((template) => ({ template, templateSet: getVisualTemplateSet(template) }))
      .filter((item): item is { template: HubTemplate; templateSet: TemplateSet } => !!item.templateSet)
      .map((item) => ({
        id: item.template.id,
        kind: "visual" as const,
        title: item.template.title,
        description: item.template.description,
        badge: templateCategoryLabel(item.template.category),
        templateSet: item.templateSet,
        hub: item.template,
      }));

    const html = hubTemplates
      .filter((template) => !getVisualTemplateSet(template))
      .map((template) => ({
        id: template.id,
        kind: "html" as const,
        title: template.title,
        description: template.description,
        badge: "HTML",
        hub: template,
      }));

    const legacy = legacyTemplates.map((template) => ({
      id: template.id,
      kind: "legacy" as const,
      title: template.name,
      description: template.academy_name || "이전 시험지 템플릿",
      badge: `${template.problems_per_page}문항/쪽`,
      legacy: template,
    }));

    return hideTemplateSelection ? legacy : [...visual, ...legacy, ...html];
  }, [hideTemplateSelection, hubTemplates, legacyTemplates]);

  useEffect(() => {
    if (!open || hideTemplateSelection) return;
    if (selectedId && options.some((option) => option.id === selectedId && option.kind === selectedKind)) return;
    const firstVisual = options.find((option) => option.kind === "visual");
    const first = firstVisual || options[0];
    if (first) {
      setSelectedKind(first.kind);
      setSelectedId(first.id);
    }
  }, [open, hideTemplateSelection, options, selectedId, selectedKind]);

  const selected = options.find((option) => option.id === selectedId && option.kind === selectedKind);
  const visualOptions = options.filter((option) => option.kind === "visual");
  const legacyOptions = options.filter((option) => option.kind === "legacy");
  const htmlOptions = options.filter((option) => option.kind === "html");
  const manualVariables = useMemo(() => collectVisualTemplateManualVariables(selected?.templateSet), [selected?.templateSet]);
  const statsBindings = useMemo(() => studentExamStatsBindings(selected?.templateSet), [selected?.templateSet]);
  const assignClass = classes.find((classRow) => classRow.id === assignClassId) || null;
  const assignableStudents = useMemo<StudentCard[]>(() => {
    const pool = assignClass ? assignClass.students : classes.flatMap((classRow) => classRow.students);
    const seen = new Set<string>();
    return pool.filter((student) => {
      if (seen.has(student.id)) return false;
      seen.add(student.id);
      return true;
    });
  }, [assignClass, classes]);
  const assignTargetCount = assignStudentIds.length || (assignClassId ? 1 : 0);

  useEffect(() => {
    const templateSet = selected?.kind === "visual" ? selected.templateSet : null;
    if (!templateSet) return;
    const nextKind = templateSet.category === "textbook" ? "textbook" : "exam";
    setDocumentKind(nextKind);
    setCoverPageId(findPageId(templateSet, ["cover"]));
    setFirstProblemPageId(findPageId(templateSet, ["exam", "problem", "textbookInner", "textbookLeft"]));
    setBodyProblemPageId(findPageId(templateSet, ["problem", "exam", "textbookInner", "textbookLeft"]));
    setLeftInnerPageId(findPageId(templateSet, ["textbookLeft", "textbookInner", "problem"]));
    setRightInnerPageId(findPageId(templateSet, ["textbookRight", "textbookInner", "problem"]));
    setAnswerPageId(findPageId(templateSet, ["answer"]));
    setIncludeCoverPage(nextKind === "textbook" && !!templateSet.pages.find((page) => page.role === "cover"));
  }, [selected?.id, selected?.kind, selected?.templateSet]);

  useEffect(() => {
    setCustomVariables((current) => {
      const next: Record<string, string> = {};
      for (const key of manualVariables) next[key] = current[key] || "";
      return next;
    });
  }, [manualVariables]);

  function selectOption(option: ExportTemplateOption) {
    setSelectedKind(option.kind);
    setSelectedId(option.id);
  }

  function changeAssignClass(classId: string) {
    setAssignClassId(classId);
    setAssignStudentIds([]);
    const classRow = classes.find((row) => row.id === classId);
    if (classRow && !className.trim()) setClassName(classRow.name);
  }

  function toggleAssignStudent(student: StudentCard) {
    const exists = assignStudentIds.includes(student.id);
    const next = exists ? assignStudentIds.filter((id) => id !== student.id) : [...assignStudentIds, student.id];
    setAssignStudentIds(next);
    if (!exists && next.length === 1 && !studentName.trim()) setStudentName(student.name);
  }

  const visualPagePlan = useMemo<VisualPagePlan | null>(() => {
    if (selected?.kind !== "visual" || !selected.templateSet) return null;
    return {
      document_kind: documentKind,
      include_cover: includeCoverPage,
      cover_page_id: includeCoverPage ? coverPageId || null : null,
      first_problem_page_id: documentKind === "exam" ? firstProblemPageId || null : null,
      body_problem_page_id: bodyProblemPageId || leftInnerPageId || null,
      left_inner_page_id: documentKind === "textbook" ? leftInnerPageId || null : null,
      right_inner_page_id: documentKind === "textbook" ? rightInnerPageId || null : null,
      solution_page_id: null,
      answer_page_id: includeAnswerPage ? answerPageId || null : null,
    };
  }, [answerPageId, bodyProblemPageId, coverPageId, documentKind, firstProblemPageId, includeAnswerPage, includeCoverPage, leftInnerPageId, rightInnerPageId, selected?.kind, selected?.templateSet]);

  const visualPagePlanMissing = selected?.kind === "visual" && (
    (documentKind === "exam" && (!firstProblemPageId || !bodyProblemPageId)) ||
    (documentKind === "textbook" && !bodyProblemPageId && !leftInnerPageId && !rightInnerPageId) ||
    (includeCoverPage && !coverPageId) ||
    (includeAnswerPage && !answerPageId)
  );

  async function submit() {
    if (!selected || !examTitle.trim() || loading || visualPagePlanMissing) return;
    setLoading(true);
    try {
      let resolvedCustomVariables = customVariables;
      if (statsBindings.length && assignStudentIds.length === 1) {
        const statsVariables = await Promise.all(
          statsBindings.map(async (binding) => {
            const series = await getStudentExamStatsSeries(assignStudentIds[0], {
              start_date: binding.start_date,
              end_date: binding.end_date,
            });
            return [binding.key, JSON.stringify(series)] as const;
          })
        );
        resolvedCustomVariables = { ...customVariables, ...Object.fromEntries(statsVariables) };
      }
      await downloadExport({
        source,
        problem_set_id: source === "set" ? problemSetId || null : null,
        problem_ids: source === "selection" ? problemIds || [] : null,
        template_id: selected.kind === "legacy" ? selected.id : null,
        hub_template_id: selected.kind === "visual" || selected.kind === "html" ? selected.id : null,
        exam_title: examTitle,
        class_name: className,
        student_name: studentName,
        date,
        exam_start_time: examStartTime,
        exam_end_time: examEndTime,
        exam_time: examTime,
        exam_datetime: examDateTime,
        custom_variables: resolvedCustomVariables,
        visual_page_plan: visualPagePlan,
        include_solution: false,
        include_missing_solution_metadata: false,
      });
      if (assignEnabled && assignTargetCount > 0) {
        await createPaperSession({
          title: examTitle.trim(),
          source_problem_set_id: source === "set" ? problemSetId || null : null,
          problem_ids: source === "selection" ? problemIds || [] : undefined,
          session_type: assignType,
          class_ids: assignClassId && !assignStudentIds.length ? [assignClassId] : [],
          student_membership_ids: assignStudentIds,
          scheduled_at: date ? `${date}T00:00:00` : null,
          status: "exported",
          create_calendar_events: true,
        });
      }
      onExported?.({
        source,
        problemSetId,
        problemIds,
        count,
        examTitle: examTitle.trim(),
        templateTitle: selected.title,
        templateKind: selected.kind,
        output: outputLabel(selected.kind),
        includeSolution: false,
        includeMissingSolutionMetadata: false,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl bg-[#0b0d12] text-slate-100">
        <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div>
              <h2 className="text-lg font-semibold text-white">내보내기 설정</h2>
            </div>
            <Input placeholder="시험지명" value={examTitle} onChange={(event) => setExamTitle(event.target.value)} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Input placeholder="반" value={className} onChange={(event) => setClassName(event.target.value)} />
              <Input placeholder="이름" value={studentName} onChange={(event) => setStudentName(event.target.value)} />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">시험 일시</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="시험 일자" />
                <Input type="time" value={examStartTime} onChange={(event) => setExamStartTime(event.target.value)} aria-label="시험 시작 시간" />
                <Input type="time" value={examEndTime} onChange={(event) => setExamEndTime(event.target.value)} aria-label="시험 종료 시간" />
              </div>
              <div className="mt-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-slate-300">
                {examDateTime || "시험 일시 미입력"}
              </div>
            </div>
            {statsBindings.length ? (
              <div className="rounded-lg border border-zinc-300/20 bg-zinc-500/10 px-3 py-2 text-xs leading-5 text-zinc-100">
                이 템플릿은 학생 시험 이력 통계를 사용합니다. 학생 1명을 선택하면 설정한 X축 날짜 범위 안의 채점 완료 시험만 자동 연결됩니다.
              </div>
            ) : null}
            {manualVariables.length ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">템플릿 입력값</div>
                <div className="mt-3 grid gap-2">
                  {manualVariables.map((name) => (
                    <label key={name} className="grid gap-1.5 text-xs font-semibold text-slate-400">
                      {name}:
                      <Input
                        value={customVariables[name] || ""}
                        onChange={(event) => setCustomVariables((current) => ({ ...current, [name]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {selected?.kind === "visual" && selected.templateSet ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">페이지 구성</div>
                    <div className="mt-1 text-xs text-slate-500">내보내기에 사용할 페이지를 직접 선택합니다.</div>
                  </div>
                  <select
                    className="h-9 rounded-md border border-white/10 bg-[#10131b] px-2 text-xs font-semibold text-slate-100 outline-none"
                    value={documentKind}
                    onChange={(event) => setDocumentKind(event.target.value as "exam" | "textbook")}
                  >
                    <option value="exam">시험지</option>
                    <option value="textbook">교재</option>
                  </select>
                </div>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs font-semibold text-slate-300">
                    표지 사용
                    <input type="checkbox" checked={includeCoverPage} onChange={(event) => setIncludeCoverPage(event.target.checked)} />
                  </label>
                  {includeCoverPage ? <PageSelect label="표지" value={coverPageId} onChange={setCoverPageId} templateSet={selected.templateSet} /> : null}
                  {documentKind === "exam" ? (
                    <>
                      <PageSelect label="시험지 1페이지" value={firstProblemPageId} onChange={setFirstProblemPageId} templateSet={selected.templateSet} />
                      <PageSelect label="본문 반복 페이지" value={bodyProblemPageId} onChange={setBodyProblemPageId} templateSet={selected.templateSet} />
                    </>
                  ) : (
                    <>
                      <PageSelect label="내지 기본" value={bodyProblemPageId} onChange={setBodyProblemPageId} templateSet={selected.templateSet} />
                      <PageSelect label="왼쪽 내지" value={leftInnerPageId} onChange={setLeftInnerPageId} templateSet={selected.templateSet} />
                      <PageSelect label="오른쪽 내지" value={rightInnerPageId} onChange={setRightInnerPageId} templateSet={selected.templateSet} />
                    </>
                  )}
                  <label className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-2 text-xs font-semibold text-slate-300">
                    답안 페이지 사용
                    <input type="checkbox" checked={includeAnswerPage} onChange={(event) => setIncludeAnswerPage(event.target.checked)} />
                  </label>
                  {includeAnswerPage ? <PageSelect label="답안 페이지" value={answerPageId} onChange={setAnswerPageId} templateSet={selected.templateSet} /> : null}
                  {visualPagePlanMissing ? (
                    <div className="rounded-md border border-zinc-300/25 bg-zinc-500/10 px-2.5 py-2 text-xs text-zinc-100">
                      필요한 페이지 구성을 모두 선택해야 PDF를 생성할 수 있습니다.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {(source === "selection" || problemSetId) ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <label className="flex items-center justify-between text-sm font-semibold text-slate-200">
                  학생/클래스에 배정
                  <input type="checkbox" checked={assignEnabled} onChange={(event) => setAssignEnabled(event.target.checked)} />
                </label>
                {assignEnabled ? (
                  <div className="mt-3 grid gap-2">
                    <select
                      className="h-10 rounded-md border border-white/10 bg-[#10131b] px-3 text-sm text-slate-100 outline-none"
                      value={assignClassId}
                      onChange={(event) => changeAssignClass(event.target.value)}
                    >
                      <option value="">클래스 선택</option>
                      {classes.map((classRow) => (
                        <option key={classRow.id} value={classRow.id}>
                          {classRow.name} ({classRow.student_count})
                        </option>
                      ))}
                    </select>
                    {assignableStudents.length ? (
                      <div className="max-h-36 space-y-1 overflow-auto rounded-md border border-white/10 bg-white/[0.035] p-2">
                        {assignableStudents.map((student) => (
                          <label key={student.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-slate-300 hover:bg-white/[0.06]">
                            <span className="min-w-0 truncate">{student.name}</span>
                            <input
                              type="checkbox"
                              checked={assignStudentIds.includes(student.id)}
                              onChange={() => toggleAssignStudent(student)}
                            />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-500">학생이 없습니다.</p>
                    )}
                    <select
                      className="h-10 rounded-md border border-white/10 bg-[#10131b] px-3 text-sm text-slate-100 outline-none"
                      value={assignType}
                      onChange={(event) => setAssignType(event.target.value)}
                    >
                      <option value="test">시험</option>
                      <option value="homework">숙제</option>
                      <option value="review">복습</option>
                      <option value="mock_exam">모의고사</option>
                      <option value="practice">연습</option>
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-lg border border-zinc-300/20 bg-zinc-500/10 p-3 text-sm">
              <p className="font-medium text-zinc-100">출력 요약</p>
              <p className="mt-2 text-slate-300">
                {count}문항 · {selected?.title || "템플릿 미선택"} · {outputLabel(selected?.kind)}
              </p>
            </div>
            <Button className="w-full" disabled={!selected || loading || !count || visualPagePlanMissing || (assignEnabled && assignTargetCount === 0)} onClick={submit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {selected?.kind === "html" ? "템플릿 HTML 생성" : "PDF 생성"}
            </Button>
          </section>

          <section className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">템플릿 선택</h2>
              </div>
              {!hideTemplateSelection ? (
                <Link className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]" href="/templates/studio?new=1">
                  새 템플릿 만들기
                </Link>
              ) : null}
            </div>

            {visualOptions.length ? (
              <div>
                <div className="grid max-h-[620px] gap-4 overflow-auto pr-1 xl:grid-cols-2">
                  {visualOptions.map((option) => (
                    <button
                      key={`visual-${option.id}`}
                      className={`overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 ${
                        selectedKind === option.kind && selectedId === option.id
                          ? "border-zinc-300 bg-zinc-500/15 shadow-[0_0_0_1px_rgba(255,255,255,.2)]"
                          : "border-white/10 bg-white/[0.04] hover:border-zinc-300/45"
                      }`}
                      onClick={() => selectOption(option)}
                    >
                      <div className="h-80 border-b border-white/10 bg-[#111318]">
                        {option.templateSet ? <VisualTemplatePreview templateSet={option.templateSet} /> : null}
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-1 font-semibold text-white">{option.title}</span>
                          <Badge variant="secondary">{option.badge}</Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              !hideTemplateSelection && (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-slate-400">
                  템플릿 없음
                </div>
              )
            )}

            {legacyOptions.length ? (
              <details className="rounded-xl border border-white/10 bg-white/[0.035] p-3" open={!visualOptions.length}>
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">이전 시험지 템플릿</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {legacyOptions.map((option) => (
                    <button
                      key={`legacy-${option.id}`}
                      className={`overflow-hidden rounded-xl border text-left transition ${
                        selectedKind === option.kind && selectedId === option.id ? "border-zinc-300 bg-zinc-500/15" : "border-white/10 bg-black/20 hover:border-zinc-300/45"
                      }`}
                      onClick={() => selectOption(option)}
                    >
                      <div className="h-28 border-b border-white/10">{option.legacy ? <LegacyTemplatePreview template={option.legacy} /> : null}</div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="line-clamp-1 font-semibold text-white">{option.title}</span>
                          <Badge variant="secondary">{option.badge}</Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}

            {htmlOptions.length ? (
              <details className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">고급 HTML 템플릿</summary>
                <div className="mt-3 space-y-2">
                  {htmlOptions.map((option) => (
                    <button
                      key={`html-${option.id}`}
                      className={`w-full rounded-lg border p-3 text-left ${
                        selectedKind === option.kind && selectedId === option.id ? "border-zinc-300 bg-zinc-500/15" : "border-white/10 bg-black/20 hover:border-zinc-300/45"
                      }`}
                      onClick={() => selectOption(option)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{option.title}</span>
                        <Badge variant="secondary">HTML</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
