"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileDown, Loader2 } from "lucide-react";

import { TemplatePageView } from "@/components/templates/visual-template-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { downloadCounselingExport } from "@/lib/api";
import { CounselingLog } from "@/lib/studentManagement";
import { HubTemplate, listMyTemplates } from "@/lib/templateHub";
import { createDynamicPreviewPages } from "@/lib/visualTemplateEngine";
import { PAGE_SIZES, TemplateSet } from "@/lib/visualTemplateTypes";

function getVisualTemplateSet(template: HubTemplate): TemplateSet | null {
  const schema = template.schema_json as { visualTemplateSet?: unknown } | null;
  const visual = schema?.visualTemplateSet;
  if (!visual || typeof visual !== "object") return null;
  const candidate = visual as TemplateSet;
  if (!Array.isArray(candidate.pages) || !candidate.defaultPageSize) return null;
  return candidate;
}

function shortDate(value: string) {
  return value ? value.slice(0, 10).replaceAll("-", ".") : "";
}

function VisualTemplatePreview({ templateSet }: { templateSet: TemplateSet }) {
  const page = useMemo(() => createDynamicPreviewPages(templateSet)[0] || templateSet.pages[0], [templateSet]);
  const size = page?.pageSize || templateSet.defaultPageSize || PAGE_SIZES.A4_PORTRAIT;
  const scale = Math.min(0.34, 300 / Math.max(size.width, 1));
  if (!page) return <div className="flex h-full items-center justify-center text-xs text-slate-500">미리보기 없음</div>;
  return (
    <div className="flex h-full items-start justify-center overflow-hidden rounded-lg bg-zinc-100 p-3">
      <div style={{ width: size.width * scale, height: size.height * scale }}>
        <TemplatePageView templateSet={templateSet} page={page} scale={scale} />
      </div>
    </div>
  );
}

type CounselingExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  logs: CounselingLog[];
  initialLogIds?: string[];
};

export function CounselingExportModal({ open, onOpenChange, studentId, studentName, logs, initialLogIds }: CounselingExportModalProps) {
  const [templates, setTemplates] = useState<HubTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [title, setTitle] = useState("상담일지");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedLogIds(initialLogIds?.length ? initialLogIds : logs.map((log) => log.id));
    setTitle(initialLogIds?.length === 1 ? logs.find((log) => log.id === initialLogIds[0])?.title || "상담일지" : `${studentName} 상담일지`);
    listMyTemplates()
      .then((items) => {
        const counseling = items.filter((item) => item.category === "counseling_log");
        setTemplates(counseling);
        setSelectedTemplateId((current) => current || counseling[0]?.id || "");
      })
      .catch(() => setTemplates([]));
  }, [open, initialLogIds, logs, studentName]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;
  const selectedTemplateSet = selectedTemplate ? getVisualTemplateSet(selectedTemplate) : null;
  const selectedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
  const firstLog = selectedLogs[0] || logs[0];
  const variableRows = useMemo(() => {
    const base = [
      ["student_name", studentName],
      ["class_name", firstLog?.class_name || ""],
      ["counseling_title", firstLog?.title || ""],
      ["counseling_date", firstLog ? shortDate(firstLog.counseling_date) : ""],
      ["counseling_notes", firstLog?.notes || ""],
      ["counseling_weekly_report", firstLog?.weekly_report || ""],
      ["counseling_next_plan", firstLog?.next_plan || ""],
    ];
    const sections = (firstLog?.sections || []).map((section) => [`counseling_${section.field_id}`, section.label]);
    return [...base, ...sections];
  }, [firstLog, studentName]);

  function toggleLog(logId: string) {
    setSelectedLogIds((current) => current.includes(logId) ? current.filter((id) => id !== logId) : [...current, logId]);
  }

  async function copyToken(key: string) {
    await navigator.clipboard?.writeText(`{{${key}}}`);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1200);
  }

  async function submit() {
    if (!selectedTemplateId || !selectedLogIds.length || loading) return;
    setLoading(true);
    try {
      await downloadCounselingExport({
        student_id: studentId,
        log_ids: selectedLogIds,
        hub_template_id: selectedTemplateId,
        title,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto border-0 bg-white text-zinc-950">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4 pr-10">
            <div>
              <h2 className="text-xl font-bold">상담일지 템플릿 내보내기</h2>
              <p className="mt-1 text-sm text-zinc-500">상담일지 카테고리 템플릿에 상담 항목을 자동 삽입합니다.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => window.open("/templates/studio?new=1", "_blank", "noopener,noreferrer")}>
              템플릿 만들기
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="내보내기 제목" />

              <section className="rounded-lg bg-zinc-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold">상담 기록</h3>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedLogIds(logs.map((log) => log.id))}>전체 선택</Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {logs.map((log) => (
                    <label key={log.id} className="flex cursor-pointer items-center gap-3 rounded-md bg-white p-2 text-sm transition hover:bg-zinc-100">
                      <input type="checkbox" checked={selectedLogIds.includes(log.id)} onChange={() => toggleLog(log.id)} />
                      <span className="min-w-0 flex-1 truncate">{shortDate(log.counseling_date)} · {log.title}</span>
                      {log.class_name ? <Badge variant="outline">{log.class_name}</Badge> : null}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-lg bg-zinc-50 p-3">
                <h3 className="mb-2 text-sm font-bold">상담 변수</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {variableRows.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => copyToken(key)} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-left text-xs transition hover:bg-zinc-100">
                      <span className="min-w-0">
                        <strong className="block truncate text-zinc-950">{`{{${key}}}`}</strong>
                        <span className="block truncate text-zinc-500">{label || "-"}</span>
                      </span>
                      {copied === key ? <Check className="h-3.5 w-3.5 text-zinc-950" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg bg-zinc-50 p-3">
                <h3 className="mb-2 text-sm font-bold">상담일지 템플릿</h3>
                <div className="space-y-2">
                  {templates.map((template) => (
                    <button key={template.id} type="button" onClick={() => setSelectedTemplateId(template.id)} className={`w-full rounded-md p-3 text-left text-sm transition ${selectedTemplateId === template.id ? "bg-zinc-200" : "bg-white hover:bg-zinc-100"}`}>
                      <strong>{template.title}</strong>
                      {template.description ? <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{template.description}</p> : null}
                    </button>
                  ))}
                  {!templates.length ? <p className="rounded-md bg-zinc-100 p-3 text-sm text-zinc-500">상담일지 템플릿이 없습니다.</p> : null}
                </div>
              </section>
              <div className="h-[360px]">{selectedTemplateSet ? <VisualTemplatePreview templateSet={selectedTemplateSet} /> : null}</div>
            </div>
          </div>

          <Button className="w-full" onClick={submit} disabled={!selectedTemplateId || !selectedLogIds.length || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            내보내기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
