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
    <div className={compact ? "h-full w-full overflow-hidden bg-[#111318]" : "overflow-hidden rounded-[10px] border border-white/10 bg-[#111318]"}>
      <iframe
        title="템플릿 미리보기"
        sandbox=""
        srcDoc={renderTemplatePreview(html, css)}
        className={compact ? "h-[520px] w-[360px] origin-top-left scale-[0.42] border-0" : "h-[680px] w-full border-0"}
      />
    </div>
  );
}
