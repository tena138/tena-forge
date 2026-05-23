"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, LayoutTemplate, Plus, Search, Sparkles } from "lucide-react";

import { TemplatePageView } from "@/components/templates/visual-template-renderer";
import { TemplatePreviewFrame } from "@/components/template-hub/template-preview-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HubTemplate,
  categoryLabel,
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

function TemplateCardPreview({ template }: { template: HubTemplate }) {
  const visualSet = getVisualTemplateSet(template);
  if (visualSet?.pages[0]) {
    return (
      <div className="flex h-56 items-start justify-center overflow-hidden bg-[#111318] pt-5">
        <TemplatePageView templateSet={visualSet} page={visualSet.pages[0]} scale={0.18} selectedIds={[]} />
      </div>
    );
  }
  return (
    <div className="h-56 overflow-hidden border-b border-white/10 bg-[#111318]">
      <TemplatePreviewFrame html={template.html} css={template.css} compact />
    </div>
  );
}

export default function TemplateHubPage() {
  const [templates, setTemplates] = useState<HubTemplate[]>([]);
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);

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
      description: "A4 시험지와 문항 자동 배치 영역이 포함된 Visual Template Studio 시작 프리셋입니다.",
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
    if (template.id === "starter") {
      window.location.href = "/templates/studio?type=exam";
      return;
    }
    const forked = await forkHubTemplate(template.id);
    window.location.href = getVisualTemplateSet(forked) ? `/templates/studio?id=${forked.id}` : `/templates/editor/${forked.id}`;
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
            <div key={index} className="h-80 animate-pulse rounded-[10px] border border-white/10 bg-white/[0.045]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => {
            const visualSet = getVisualTemplateSet(template);
            return (
              <article key={template.id} className="group overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.045] shadow-[0_18px_52px_rgba(0,0,0,0.24)] transition hover:border-white/18 hover:bg-white/[0.06]">
                <TemplateCardPreview template={template} />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-white">{template.title}</h2>
                      <p className="mt-1 text-xs font-semibold text-violet-200">
                        {visualSet ? "Visual Set" : "Legacy"} · {categoryLabel(template.category)} · {visibilityLabels[template.visibility]}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-slate-300">{template.use_count}회 사용</span>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{template.description || "설명이 없는 템플릿입니다."}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={template.id === "starter" ? "/templates/studio?type=exam" : visualSet ? `/templates/studio?id=${template.id}` : `/templates/${template.id}`}>
                      <Button variant="outline" className="w-full">
                        <Eye className="h-4 w-4" />
                        자세히
                      </Button>
                    </Link>
                    <Button className="w-full" onClick={() => duplicate(template)}>
                      <Copy className="h-4 w-4" />
                      복제하기
                    </Button>
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
