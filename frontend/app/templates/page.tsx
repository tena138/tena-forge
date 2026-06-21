"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Globe2, LayoutTemplate, Lock, MoreVertical, Plus, Search, Sparkles } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { TemplatePreviewFrame } from "@/components/template-hub/template-preview-frame";
import { TemplatePageView } from "@/components/templates/visual-template-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HubTemplate,
  categoryLabel,
  createHubTemplate,
  defaultTemplateCss,
  defaultTemplateHtml,
  forkHubTemplate,
  listPublicTemplates,
  templateCategories,
  visibilityLabels,
} from "@/lib/templateHub";
import { createBlankTemplateSet } from "@/lib/visualTemplatePresets";
import { TemplateSet } from "@/lib/visualTemplateTypes";

const TEMPLATE_HUB_PATH = "/templates";

function withReturnTo(path: string, returnTo = TEMPLATE_HUB_PATH) {
  return `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
}

function getVisualTemplateSet(template: HubTemplate): TemplateSet | null {
  const visual = template.schema_json?.visualTemplateSet;
  if (!visual || typeof visual !== "object") return null;
  const candidate = visual as TemplateSet;
  return candidate.schemaVersion && Array.isArray(candidate.pages) ? candidate : null;
}

function hasVisualSchema(template: HubTemplate) {
  return Boolean(getVisualTemplateSet(template));
}

function openHref(template: HubTemplate) {
  if (template.id === "starter") return withReturnTo("/templates/studio?new=1");
  return hasVisualSchema(template) ? withReturnTo(`/templates/studio?id=${template.id}`) : `/templates/${template.id}`;
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
      <div className="relative h-[380px] overflow-hidden bg-zinc-100">
        <div className="absolute left-1/2 top-6 -translate-x-1/2">
          <TemplatePageView templateSet={visualSet} page={firstPage} scale={scale} selectedIds={[]} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[380px] overflow-hidden bg-zinc-100">
      <TemplatePreviewFrame html={template.html} css={template.css} compact />
    </div>
  );
}

function VisibilityIcon({ visibility }: { visibility: HubTemplate["visibility"] }) {
  if (visibility === "public" || visibility === "marketplace") return <Globe2 className="h-3.5 w-3.5" />;
  return <Lock className="h-3.5 w-3.5" />;
}

export default function TemplateHubPage() {
  const [templates, setTemplates] = useState<HubTemplate[]>([]);
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listPublicTemplates({
        category: category === "all" ? undefined : category,
        keyword: keyword || undefined,
        sort,
      });
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(load, 180);
    return () => window.clearTimeout(timeout);
  }, [category, keyword, sort]);

  const starter = useMemo<HubTemplate>(() => {
    const visualSet = createBlankTemplateSet();
    return {
      id: "starter",
      owner_id: "system",
      title: "Blank A4 Visual Set",
      description: "A blank A4 canvas for Visual Template Studio.",
      category: "exam",
      visibility: "public",
      html: defaultTemplateHtml,
      css: defaultTemplateCss,
      schema_json: { visualTemplateSet: visualSet },
      thumbnail_url: null,
      forked_from_template_id: null,
      like_count: 0,
      use_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_owner: false,
    };
  }, []);

  const visible = templates.length ? templates : [starter];

  async function duplicate(template: HubTemplate) {
    if (duplicatingId) return;
    setDuplicatingId(template.id);
    try {
      const duplicated =
        template.id === "starter"
          ? await createHubTemplate({
              title: `${template.title} 사본`,
              description: template.description,
              category: template.category,
              visibility: "private",
              html: template.html,
              css: template.css,
              schema_json: template.schema_json,
              thumbnail_url: template.thumbnail_url,
              source_type: template.source_type,
              rights_confirmed: true,
            })
          : await forkHubTemplate(template.id);
      setTemplates((current) => [duplicated, ...current.filter((item) => item.id !== duplicated.id)]);
    } catch {
      window.alert("템플릿을 복제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[12px] bg-white p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[7px] bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-950">
              <Sparkles className="h-3.5 w-3.5" />
              Visual Hub
            </div>
            <h1 className="mt-4 text-3xl font-bold text-zinc-950">템플릿 허브</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/templates/mine">
              <Button variant="outline">내 템플릿</Button>
            </Link>
            <Link href={withReturnTo("/templates/studio?new=1")}>
              <Button>
                <Plus className="h-4 w-4" />
                템플릿 만들기
              </Button>
            </Link>
            <Link href={withReturnTo("/templates/studio?new=1")}>
              <Button variant="secondary">
                <LayoutTemplate className="h-4 w-4" />
                Visual Studio
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-[10px] bg-white p-4 md:grid-cols-[1fr_220px_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="템플릿 검색" />
        </label>
        <select className="h-10 rounded-md border-0 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">전체 카테고리</option>
          {templateCategories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border-0 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-black/10" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="recent">최신순</option>
          <option value="popular">인기순</option>
          <option value="most_used">사용순</option>
        </select>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[500px] animate-pulse rounded-[10px] bg-white/80" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => {
            const visualSet = getVisualTemplateSet(template);
            return (
              <article key={template.id} className="overflow-hidden rounded-[10px] bg-white transition hover:bg-zinc-50">
                <Link href={openHref(template)} className="block">
                  <TemplateCardPreview template={template} />
                </Link>
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-zinc-950">{template.title}</h2>
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
                          <DropdownMenu.Content align="end" sideOffset={8} className="z-[160] w-40 overflow-hidden rounded-[8px] bg-white p-1">
                            <DropdownMenu.Item asChild>
                              <Link href={openHref(template)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-zinc-900 outline-none hover:bg-zinc-100 focus:bg-zinc-100">
                                <Eye className="h-4 w-4" />
                                자세히
                              </Link>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={duplicatingId === template.id}
                              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-zinc-900 outline-none hover:bg-zinc-100 focus:bg-zinc-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                              onSelect={() => duplicate(template)}
                            >
                              <Copy className="h-4 w-4" />
                              {duplicatingId === template.id ? "복제 중" : "복제"}
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
      )}
    </div>
  );
}
