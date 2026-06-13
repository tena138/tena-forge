"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Copy, Edit3, Send } from "lucide-react";

import { TemplatePreviewFrame } from "@/components/template-hub/template-preview-frame";
import { Button } from "@/components/ui/button";
import {
  HubTemplate,
  categoryLabel,
  forkHubTemplate,
  getHubTemplate,
  publishHubTemplate,
  unpublishHubTemplate,
  visibilityLabels,
} from "@/lib/templateHub";

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [template, setTemplate] = useState<HubTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState("");

  async function load() {
    setLoading(true);
    const data = await getHubTemplate(resolvedParams.id);
    setTemplate(data);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [resolvedParams.id]);

  async function duplicate() {
    if (!template || duplicating) return;
    setDuplicating(true);
    setDuplicateMessage("");
    try {
      const forked = await forkHubTemplate(template.id);
      setDuplicateMessage(`'${forked.title}' 복제본이 내 템플릿에 생성되었습니다.`);
    } catch {
      window.alert("템플릿을 복제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setDuplicating(false);
    }
  }

  async function togglePublish() {
    if (!template) return;
    const next = template.visibility === "public" ? await unpublishHubTemplate(template.id) : await publishHubTemplate(template.id);
    setTemplate(next);
  }

  if (loading) return <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-8 text-sm text-slate-400">템플릿을 불러오는 중...</div>;
  if (!template) return <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-8 text-sm text-slate-400">템플릿을 찾을 수 없습니다.</div>;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-4">
        <div className="rounded-[12px] border border-white/10 bg-black/45 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-200">{categoryLabel(template.category)} · {visibilityLabels[template.visibility]}</p>
              <h1 className="mt-2 text-3xl font-bold text-white">{template.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{template.description || "설명이 없는 템플릿입니다."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {template.is_owner ? (
                <>
                  <Link href={`/templates/editor/${template.id}`}><Button><Edit3 className="h-4 w-4" />편집하기</Button></Link>
                  <Button variant="outline" onClick={togglePublish}>{template.visibility === "public" ? "게시 취소" : "게시하기"}</Button>
                </>
              ) : (
                <>
                  <Button onClick={duplicate} disabled={duplicating}><Copy className="h-4 w-4" />{duplicating ? "복제 중" : "복제하기"}</Button>
                  <Button variant="outline" onClick={duplicate} disabled={duplicating}><Send className="h-4 w-4" />이 템플릿 사용</Button>
                </>
              )}
            </div>
          </div>
          {duplicateMessage ? (
            <div className="mt-4 rounded-[8px] border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-100">
              {duplicateMessage}
            </div>
          ) : null}
          <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3">
              <div className="text-slate-500">사용 수</div>
              <div className="mt-1 text-xl font-bold text-white">{template.use_count}</div>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3">
              <div className="text-slate-500">좋아요</div>
              <div className="mt-1 text-xl font-bold text-white">{template.like_count}</div>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3">
              <div className="text-slate-500">업데이트</div>
              <div className="mt-1 text-sm font-bold text-white">{new Date(template.updated_at).toLocaleDateString("ko-KR")}</div>
            </div>
          </div>
        </div>
        <TemplatePreviewFrame html={template.html} css={template.css} />
      </section>

      <aside className="space-y-3 rounded-[10px] border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-bold text-white">지원 변수</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {["test_title", "student_name", "problem_text", "solution", "answer", "page_number", "total_pages", "subject", "unit", "difficulty", "tags"].map((key) => (
            <code key={key} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-violet-100">{`{{ ${key} }}`}</code>
          ))}
        </div>
      </aside>
    </div>
  );
}
