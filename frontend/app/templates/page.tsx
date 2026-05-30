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
import { createTemplateSet } from "@/lib/visualTemplatePresets";
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

function openHref(template: HubTemplate) {
  if (template.id === "starter") return "/templates/studio?type=exam";
  return hasVisualSchema(template) ? `/templates/studio?id=${template.id}` : `/templates/${template.id}`;
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
    const visualSet = createTemplateSet("exam");
    return {
      id: "starter",
      owner_id: "system",
      title: "기본 시험지 Visual Set",
      description: "A4 시험지와 문항 자동 배치 영역을 포함한 Visual Template Studio 시작 프리셋입니다.",
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
      <section className="overflow-hidden rounded-[12px] border border-white/10 bg-black/45 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[7px] border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              Visual Hub
            </div>
            <h1 className="mt-4 text-3xl font-bold text-white">템플릿 허브</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/templates/mine">
              <Button variant="outline">내 템플릿</Button>
            </Link>
            <Link href="/templates/new">
              <Button>
                <Plus className="h-4 w-4" />
                템플릿 만들기
              </Button>
            </Link>
            <Link href="/templates/studio?type=exam">
              <Button variant="secondary">
                <LayoutTemplate className="h-4 w-4" />
                Visual Studio
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-[10px] border border-white/10 bg-white/[0.045] p-4 md:grid-cols-[1fr_220px_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="템플릿 검색" />
        </label>
        <select className="h-10 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">전체 카테고리</option>
          {templateCategories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="recent">최신순</option>
          <option value="popular">인기순</option>
          <option value="most_used">사용순</option>
        </select>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[500px] animate-pulse rounded-[10px] border border-white/10 bg-white/[0.045]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => {
            const visualSet = getVisualTemplateSet(template);
            return (
              <article key={template.id} className="overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.045] shadow-[0_18px_52px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.065]">
                <Link href={openHref(template)} className="block">
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
                            <DropdownMenu.Item asChild>
                              <Link href={openHref(template)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 outline-none hover:bg-white/[0.07] focus:bg-white/[0.07]">
                                <Eye className="h-4 w-4" />
                                자세히
                              </Link>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={duplicatingId === template.id}
                              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-100 outline-none hover:bg-white/[0.07] focus:bg-white/[0.07] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
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
