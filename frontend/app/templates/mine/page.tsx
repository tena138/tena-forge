"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Globe2, Lock, MoreVertical, Plus, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

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

function editorHref(template: HubTemplate) {
  return `/templates/studio?id=${template.id}`;
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
    const scale = Math.min(0.36, 330 / Math.max(size.width, 1), 460 / Math.max(size.height, 1));

    return (
      <div className="relative h-[380px] overflow-hidden border-b border-white/10 bg-[#111318]">
        <div className="absolute left-1/2 top-6 -translate-x-1/2">
          <TemplatePageView templateSet={visualSet} page={firstPage} scale={scale} selectedIds={[]} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[380px] overflow-hidden border-b border-white/10 bg-[#111318]">
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
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

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
    if (duplicatingId) return;
    setDuplicatingId(template.id);
    try {
      const forked = await forkHubTemplate(template.id);
      setTemplates((current) => [forked, ...current.filter((item) => item.id !== forked.id)]);
    } catch {
      window.alert("템플릿을 복제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function togglePublish(template: HubTemplate) {
    if (template.visibility === "public") await unpublishHubTemplate(template.id);
    else await publishHubTemplate(template.id);
    await load();
  }

  return (
    <div className="space-y-6 pb-24">
      <Link
        href="/templates/studio?new=1"
        className="fixed bottom-6 right-6 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/40 bg-violet-600 text-white shadow-[0_18px_44px_rgba(124,58,237,0.42)] transition hover:bg-violet-500"
        aria-label="템플릿 만들기"
        title="템플릿 만들기"
      >
        <Plus className="h-5 w-5" />
      </Link>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[500px] animate-pulse rounded-[10px] border border-white/10 bg-white/[0.045]" />
          ))}
        </div>
      ) : templates.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const visualSet = getVisualTemplateSet(template);
            return (
              <article key={template.id} className="overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.045] shadow-[0_18px_52px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.065]">
                <Link href={editorHref(template)} className="block">
                  <TemplateCardPreview template={template} />
                </Link>
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-white">{template.title}</h2>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{categoryLabel(template.category)}</Badge>
                        <Badge variant="outline">{visualSet ? `Visual Set · ${visualSet.pages.length}p` : "HTML"}</Badge>
                        <Badge variant="outline">{formatDate(template.updated_at || template.created_at)}</Badge>
                        <Badge variant="outline">{template.use_count}회 사용</Badge>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={template.visibility === "public" ? "default" : "secondary"} className="gap-1">
                        <VisibilityIcon visibility={template.visibility} />
                        {visibilityLabels[template.visibility]}
                      </Badge>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button size="icon" variant="outline" aria-label="템플릿 메뉴">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content align="end" sideOffset={8} className="z-[160] w-40 overflow-hidden rounded-[8px] border border-white/10 bg-[#151722] p-1 shadow-2xl shadow-black/60">
                            <DropdownMenu.Item
                              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 outline-none hover:bg-white/[0.07] focus:bg-white/[0.07]"
                              onSelect={() => togglePublish(template)}
                            >
                              <Globe2 className="h-4 w-4" />
                              {template.visibility === "public" ? "게시 취소" : "공개 게시"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={duplicatingId === template.id}
                              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 outline-none hover:bg-white/[0.07] focus:bg-white/[0.07] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                              onSelect={() => duplicate(template)}
                            >
                              <Copy className="h-4 w-4" />
                              {duplicatingId === template.id ? "복제 중" : "복제"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-200 outline-none hover:bg-red-500/10 focus:bg-red-500/10"
                              onSelect={() => remove(template)}
                            >
                              <Trash2 className="h-4 w-4" />
                              삭제
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </div>

                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="rounded-[10px] border border-dashed border-white/15 bg-white/[0.035] p-10 text-center">
          <h2 className="text-lg font-bold text-white">저장된 템플릿이 없습니다</h2>
          <Link href="/templates/studio?new=1" className="mt-5 inline-flex">
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
