"use client";

import { useState } from "react";
import { Save, Send } from "lucide-react";

import { TemplatePreviewFrame } from "@/components/template-hub/template-preview-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HubTemplatePayload,
  TemplateCategory,
  TemplateVisibility,
  defaultTemplateCss,
  defaultTemplateHtml,
  templateCategories,
  visibilityLabels,
} from "@/lib/templateHub";

export function TemplateEditorForm({
  initial,
  saving,
  onSubmit,
}: {
  initial?: Partial<HubTemplatePayload>;
  saving?: boolean;
  onSubmit: (payload: HubTemplatePayload) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title || "새 시험지 템플릿");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState<TemplateCategory>(initial?.category || "exam");
  const [visibility, setVisibility] = useState<TemplateVisibility>(initial?.visibility || "private");
  const [html, setHtml] = useState(initial?.html || defaultTemplateHtml);
  const [css, setCss] = useState(initial?.css || defaultTemplateCss);

  async function submit() {
    await onSubmit({
      title,
      description: description || null,
      category,
      visibility,
      html,
      css,
      schema_json: initial?.schema_json || null,
      thumbnail_url: initial?.thumbnail_url || null,
    });
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="space-y-4">
        <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_52px_rgba(0,0,0,0.26)]">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
            <label className="text-sm font-semibold text-slate-200">
              제목
              <Input className="mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="text-sm font-semibold text-slate-200">
              카테고리
              <select className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" value={category} onChange={(event) => setCategory(event.target.value as TemplateCategory)}>
                {templateCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-200">
              공개 상태
              <select className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" value={visibility} onChange={(event) => setVisibility(event.target.value as TemplateVisibility)}>
                {Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-semibold text-slate-200">
            설명
            <Input className="mt-1.5" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="템플릿의 용도와 추천 사용 상황을 적어주세요." />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-200">
            HTML
            <textarea
              className="mt-1.5 min-h-[560px] w-full resize-y rounded-[10px] border border-white/10 bg-[#07090f] p-4 font-mono text-xs leading-6 text-slate-100 outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            CSS
            <textarea
              className="mt-1.5 min-h-[560px] w-full resize-y rounded-[10px] border border-white/10 bg-[#07090f] p-4 font-mono text-xs leading-6 text-slate-100 outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
              value={css}
              onChange={(event) => setCss(event.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="sticky top-20 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">라이브 미리보기</h2>
              <p className="text-sm text-slate-400">샘플 문항 데이터로 즉시 렌더링합니다.</p>
            </div>
            <Button onClick={submit} disabled={saving || !title.trim() || !html.trim()}>
              {visibility === "public" ? <Send className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "저장 중" : "저장"}
            </Button>
          </div>
          <TemplatePreviewFrame html={html} css={css} />
        </div>
      </aside>
    </div>
  );
}
