"use client";

import { renderTemplatePreview } from "@/lib/templateHub";

export function TemplatePreviewFrame({
  html,
  css,
  compact = false,
}: {
  html: string;
  css?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "h-full w-full overflow-hidden bg-zinc-100" : "overflow-hidden rounded-[10px] bg-zinc-100 shadow-[0_18px_52px_rgba(0,0,0,0.05)]"}>
      <iframe
        title="템플릿 미리보기"
        sandbox="allow-same-origin"
        srcDoc={renderTemplatePreview(html, css)}
        className={compact ? "h-[520px] w-[360px] origin-top-left scale-[0.42] border-0" : "h-[680px] w-full border-0"}
      />
    </div>
  );
}
