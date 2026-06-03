"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { TemplateEditorForm } from "@/components/template-hub/template-editor-form";
import { Button } from "@/components/ui/button";
import {
  HubTemplate,
  HubTemplatePayload,
  ensureTemplateHubSession,
  getHubTemplate,
  publishHubTemplate,
  unpublishHubTemplate,
  updateHubTemplate,
} from "@/lib/templateHub";

export default function HubTemplateEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [template, setTemplate] = useState<HubTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    await ensureTemplateHubSession();
    const data = await getHubTemplate(params.id);
    setTemplate(data);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [params.id]);

  async function submit(payload: HubTemplatePayload) {
    setSaving(true);
    try {
      const next = await updateHubTemplate(params.id, payload);
      setTemplate(next);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!template) return;
    const next = template.visibility === "public" ? await unpublishHubTemplate(template.id) : await publishHubTemplate(template.id);
    setTemplate(next);
  }

  if (loading) return <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-8 text-sm text-slate-400">템플릿을 불러오는 중...</div>;
  if (!template) return <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-8 text-sm text-slate-400">템플릿을 찾을 수 없습니다.</div>;
  if (!template.is_owner) {
    return (
      <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-8">
        <h1 className="text-xl font-bold text-white">편집 권한이 없습니다</h1>
        <Link href={`/templates/${template.id}`}><Button className="mt-4">상세로 돌아가기</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">템플릿 편집</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={togglePublish}>{template.visibility === "public" ? "게시 취소" : "게시하기"}</Button>
          <Button variant="secondary" onClick={() => router.push(`/templates/${template.id}`)}>상세 보기</Button>
        </div>
      </div>
      <TemplateEditorForm initial={template} saving={saving} onSubmit={submit} />
    </div>
  );
}
