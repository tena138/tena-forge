import { redirect } from "next/navigation";

type LegacyTemplateEditorSearchParams = {
  id?: string | string[];
  blank?: string | string[];
  new?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LegacyTemplateEditorPage({
  searchParams,
}: {
  searchParams?: Promise<LegacyTemplateEditorSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const id = firstParam(resolvedSearchParams.id);
  const blank = firstParam(resolvedSearchParams.blank);
  const newTemplate = firstParam(resolvedSearchParams.new);
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  if (blank || newTemplate) params.set("new", "1");
  const query = params.toString();
  redirect(`/templates/studio${query ? `?${query}` : ""}`);
}
