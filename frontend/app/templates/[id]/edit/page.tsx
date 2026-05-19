"use client";

import { useParams } from "next/navigation";

import { TemplateForm } from "@/components/template-form";

export default function EditTemplatePage() {
  const params = useParams<{ id: string }>();
  return <TemplateForm templateId={params.id} />;
}
