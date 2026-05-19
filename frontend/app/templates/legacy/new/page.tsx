"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { TemplateEditorForm } from "@/components/template-hub/template-editor-form";
import { createHubTemplate, ensureTemplateHubSession, HubTemplatePayload } from "@/lib/templateHub";

export default function LegacyNewTemplatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function submit(payload: HubTemplatePayload) {
    setSaving(true);
    try {
      await ensureTemplateHubSession();
      const template = await createHubTemplate(payload);
      router.push(`/templates/editor/${template.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-white">레거시 코드 템플릿</h1>
        <p className="mt-2 text-sm text-slate-400">HTML/CSS를 직접 작성해야 하는 고급 모드입니다. 일반 제작은 Visual Template Studio를 사용하세요.</p>
      </div>
      <TemplateEditorForm saving={saving} onSubmit={submit} />
    </div>
  );
}
