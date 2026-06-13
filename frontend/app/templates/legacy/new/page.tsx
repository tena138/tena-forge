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
      </div>
      <TemplateEditorForm saving={saving} onSubmit={submit} />
    </div>
  );
}
