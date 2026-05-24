"use client";

import { useEffect, useRef } from "react";
import { FileText, X } from "lucide-react";
import { clsx } from "clsx";

import { LEGAL_DOCUMENTS, type LegalBlock, type LegalDocument, type LegalDocumentKey } from "@/lib/legal";

export function LegalDocumentDialog({
  activeKey,
  onActiveKeyChange,
  onClose,
}: {
  activeKey: LegalDocumentKey;
  onActiveKeyChange: (key: LegalDocumentKey) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeDocument = LEGAL_DOCUMENTS[activeKey];

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeKey, onClose]);

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-white/10 bg-card text-card-foreground shadow-[0_28px_90px_rgba(0,0,0,0.60)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        aria-describedby="legal-dialog-description"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
          <div className="min-w-0">
            <p id="legal-dialog-description" className="flex items-center gap-2 text-xs font-bold text-violet-200">
              <FileText className="h-4 w-4" aria-hidden="true" />
              약관 전문
            </p>
            <h2 id="legal-dialog-title" className="mt-1 text-xl font-bold text-white">
              {activeDocument.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.055] text-slate-100 transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
            aria-label="약관 전문 닫기"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-white/10 px-4 pt-3 sm:px-5" role="tablist" aria-label="약관 문서 선택">
          {(["terms", "privacy"] as LegalDocumentKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeKey === key}
              aria-controls={`legal-panel-${key}`}
              id={`legal-tab-${key}`}
              onClick={() => onActiveKeyChange(key)}
              className={clsx(
                "mr-2 rounded-t-md border border-b-0 px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
                activeKey === key ? "border-white/10 bg-white/[0.08] text-white" : "border-transparent text-slate-400 hover:text-white",
              )}
            >
              {LEGAL_DOCUMENTS[key].title}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin-dark min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <LegalDocumentView document={activeDocument} />
        </div>
      </section>
    </div>
  );
}

function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article id={`legal-panel-${document.key}`} role="tabpanel" aria-labelledby={`legal-tab-${document.key}`} className="space-y-5">
      <header>
        <h3 className="text-2xl font-bold text-white">{document.title}</h3>
        <dl className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm sm:grid-cols-3">
          {document.meta.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 font-semibold text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
        {document.intro?.map((text) => (
          <p key={text} className="mt-4 text-sm leading-7 text-slate-300">
            {text}
          </p>
        ))}
      </header>

      {document.sections.map((section) => (
        <section key={section.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-base font-bold text-white">{section.title}</h4>
          <div className="mt-3 space-y-3">
            {section.blocks.map((block, index) => (
              <LegalBlockView key={`${section.title}-${index}`} block={block} />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  if (block.type === "paragraph") {
    return <p className="text-sm leading-7 text-slate-300">{block.text}</p>;
  }

  if (block.type === "note") {
    return <p className="rounded-md border border-amber-300/20 bg-amber-400/10 p-3 text-sm leading-7 text-amber-100">{block.text}</p>;
  }

  if (block.type === "list") {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-300">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-white/10">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead className="bg-white/[0.06] text-slate-200">
          <tr>
            <th scope="col" className="w-48 px-3 py-2 font-bold">
              {block.headers[0]}
            </th>
            <th scope="col" className="px-3 py-2 font-bold">
              {block.headers[1]}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-slate-300">
          {block.rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row" className="px-3 py-2 align-top font-semibold text-slate-200">
                {label}
              </th>
              <td className="px-3 py-2 align-top leading-6">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
