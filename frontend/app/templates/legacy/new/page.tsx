import { redirect } from "next/navigation";

export default function LegacyNewTemplatePage() {
  redirect("/templates/studio?new=1");
}
