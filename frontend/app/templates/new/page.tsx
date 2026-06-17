import { redirect } from "next/navigation";

export default function NewTemplatePage() {
  redirect("/templates/studio?new=1&returnTo=%2Ftemplates%2Fmine");
}
