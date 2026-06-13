import { redirect } from "next/navigation";

export default async function LegacyTemplateEditorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/templates/studio?id=${encodeURIComponent(id)}`);
}
