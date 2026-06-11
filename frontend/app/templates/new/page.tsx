import { redirect } from "next/navigation";

export default function NewTemplatePage() {
  redirect("/templates/studio?new=1");
}
