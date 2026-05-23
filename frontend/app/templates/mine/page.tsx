"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Copy, Edit3, Eye, FileText, Globe2, Lock, Plus, Sparkles, Trash2 } from "lucide-react";

import { TemplatePreviewFrame } from "@/components/template-hub/template-preview-frame";
import { TemplatePageView } from "@/components/templates/visual-template-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HubTemplate,
  categoryLabel,
  deleteHubTemplate,
  ensureTemplateHubSession,
  forkHubTemplate,
  listMyTemplates,
  publishHubTemplate,
  unpublishHubTemplate,
  visibilityLabels,
} from "@/lib/templateHub";
import { TemplateSet } from "@/lib/visualTemplateTypes";

function getVisualTemplateSet(template: HubTemplate): TemplateSet | null {
  const visual = template.schema_json?.visualTemplateSet;
  if (!visual || typeof visual !== "object") return null;
  const candidate = visual as TemplateSet;
  return candidate.schemaVersion && Array.isArray(candidate.pages) ? candidate : null;
}

function hasVisualSchema(template: HubTemplate) {
  return Boolean(getVisualTemplateSet(template));
}

function editorHref(template: HubTemplate) {
  return hasVisualSchema(template) ? `/templates/studio?id=${template.id}` : `/templates/editor/${template.id}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function TemplateCardPreview({ template }: { template: HubTemplate }) {
  const visualSet = getVisualTemplateSet(template);
  if (visualSet?.pages[0]) {
    const firstPage = visualSet.pages[0];
    const size = firstPage.pageSize || visualSet.defaultPageSize;
    const scale = Math.min(0.24, 230 / Math.max(size.width, 1), 300 / Math.max(size.height, 1));

    return (
      <div className="relative h-64 overflow-hidden border-b border-white/10 bg-[#111318]">
        <div className="absolute left-1/2 top-5 -translate-x-1/2">
          <TemplatePageView templateSet={visualSet} page={firstPage} scale={scale} selectedIds={[]} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 overflow-hidden border-b border-white/10 bg-[#111318]">
      <TemplatePreviewFrame html={template.html} css={template.css} compact />
    </div>
  );
}

function VisibilityIcon({ visibility }: { visibility: HubTemplate["visibility"] }) {
  if (visibility === "public" || visibility === "marketplace") return <Globe2 className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

export default function MyTemplatesPage() {
  const [templates, setTemplates] = useState<HubTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const counts = useMemo(
    () => ({
      visual: templates.filter(hasVisualSchema).length,
      total: templates.length,
    }),
    [templates]
  );

  async function load() {
    setLoading(true);
    await ensureTemplateHubSession();
    const data = await listMyTemplates();
    setTemplates(data);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  async function remove(template: HubTemplate) {
    if (!window.confirm(`'${template.title}' 템플릿을 삭제할까요?`)) return;
    await deleteHubTemplate(template.id);
    await load();
  }

  async function duplicate(template: HubTemplate) {
    const forked = await forkHubTemplate(template.id);
    window.location.href = hasVisualSchema(forked) ? `/templates/studio?id=${forked.id}` : `/templates/editor/${forked.id}`;
  }

  async function togglePublish(template: HubTemplate) {
    if (template.visibility === "public") await unpublishHubTemplate(template.id);
    else await publishHubTemplate(template.id);
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[10px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_18px_52px_rgba(0,0,0,0.24)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-[7px] border border-violet-300/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-100">
            <Sparkles className="h-3.5 w-3.5" />
            My Template Library
          </div>
          <h1 className="mt-4 text-3xl font-bold text-white">내 템플릿</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
            전체 <b className="text-white">{counts.total}</b>개 · Visual <b className="text-white">{counts.visual}</b>개
          </div>
          <Link href="/templates/new">
            <Button>
              <Plus className="h-4 w-4" />
              템플릿 만들기
            </Button>
          </Link>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[430px] animate-pulse rounded-[10px] border border-white/10 bg-white/[0.045]" />
          ))}
        </div>
      ) : templates.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const visualSet = getVisualTemplateSet(template);
            return (
              <article key={template.id} className="overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.045] shadow-[0_18px_52px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.065]">
                <TemplateCardPreview template={template} />
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-white">{template.title}</h2>
                      <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{template.description || "설명이 없는 템플릿입니다."}</p>
                    </div>
                    <Badge variant={template.visibility === "public" ? "default" : "secondary"} className="shrink-0 gap-1">
                      <VisibilityIcon visibility={template.visibility} />
                      {visibilityLabels[template.visibility]}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div className="rounded-[8px] border border-white/10 bg-black/20 p-2">
                      <div className="mb-1 flex items-center gap-1.5 text-slate-500">
                        <FileText className="h-3.5 w-3.5" />
                        유형
                      </div>
                      <div className="font-semibold text-slate-200">{visualSet ? `Visual Set · ${visualSet.pages.length}p` : "HTML 템플릿"}</div>
                    </div>
                    <div className="rounded-[8px] border border-white/10 bg-black/20 p-2">
                      <div className="mb-1 flex items-center gap-1.5 text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        최근 수정
                      </div>
                      <div className="font-semibold text-slate-200">{formatDate(template.updated_at || template.created_at)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{categoryLabel(template.category)}</Badge>
                    <Badge variant="outline">{template.use_count}회 사용</Badge>
                    {template.is_owner ? <Badge variant="secondary">소유자</Badge> : null}
                  </div>

                  <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2">
                    <Link href={editorHref(template)}>
                      <Button variant="outline" className="w-full">
                        <Eye className="h-4 w-4" />
                        보기
                      </Button>
                    </Link>
                    <Link href={editorHref(template)}>
                      <Button variant="outline" className="w-full">
                        <Edit3 className="h-4 w-4" />
                        편집
                      </Button>
                    </Link>
                    <Button size="icon" variant="outline" aria-label="템플릿 복제" onClick={() => duplicate(template)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" aria-label="템플릿 삭제" onClick={() => remove(template)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button className="w-full" variant={template.visibility === "public" ? "secondary" : "outline"} onClick={() => togglePublish(template)}>
                    {template.visibility === "public" ? "게시 취소" : "공개 게시"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="rounded-[10px] border border-dashed border-white/15 bg-white/[0.035] p-10 text-center">
          <h2 className="text-lg font-bold text-white">저장된 템플릿이 없습니다</h2>
          <Link href="/templates/new" className="mt-5 inline-flex">
            <Button>
              <Plus className="h-4 w-4" />
              템플릿 만들기
            </Button>
          </Link>
        </section>
      )}
    </div>
  );
}
