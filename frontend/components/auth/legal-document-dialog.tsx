"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";

import { LEGAL_DOCUMENTS, type LegalBlock, type LegalDocument, type LegalDocumentKey } from "@/lib/legal";

export function LegalDocumentDialog({
  activeKey,
  onActiveKeyChange,
  onAgree,
  onClose,
}: {
  activeKey: LegalDocumentKey;
  onActiveKeyChange: (key: LegalDocumentKey) => void;
  onAgree: (key: LegalDocumentKey) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [canAgree, setCanAgree] = useState(false);
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

  useEffect(() => {
    setCanAgree(false);
    const scrollArea = scrollAreaRef.current;
    scrollArea?.scrollTo({ top: 0 });

    const frameId = window.requestAnimationFrame(() => {
      if (!scrollArea) return;
      if (scrollArea.scrollHeight <= scrollArea.clientHeight + 8) {
        setCanAgree(true);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeKey]);

  function handleScroll() {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || canAgree) return;
    const reachedBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 8;
    if (reachedBottom) setCanAgree(true);
  }

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl bg-white text-zinc-950 shadow-[0_28px_90px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="legal-dialog-title" className="text-xl font-bold text-zinc-950">
              {activeDocument.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-zinc-100 px-4 pt-3 sm:px-5" role="tablist" aria-label="약관 문서 선택">
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
                "mr-2 rounded-t-md border border-b-0 px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/60",
                activeKey === key ? "border-zinc-100 bg-zinc-100 text-zinc-950" : "border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950",
              )}
            >
              {LEGAL_DOCUMENTS[key].title}
            </button>
          ))}
        </div>

        <div ref={scrollAreaRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <LegalDocumentView document={activeDocument} />
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-xs leading-5 text-zinc-500">
            {canAgree ? "문서 끝까지 확인했습니다." : "문서 끝까지 스크롤하면 동의함 버튼이 활성화됩니다."}
          </p>
          <button
            type="button"
            disabled={!canAgree}
            onClick={() => onAgree(activeKey)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-black px-4 text-sm font-bold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            동의함
          </button>
        </div>
      </section>
    </div>
  );
}

function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article id={`legal-panel-${document.key}`} role="tabpanel" aria-labelledby={`legal-tab-${document.key}`} className="space-y-5">
      <header>
        <h3 className="text-2xl font-bold text-zinc-950">{document.title}</h3>
        <dl className="mt-4 grid gap-2 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-3">
          {document.meta.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-zinc-500">{label}</dt>
              <dd className="mt-1 font-semibold text-zinc-800">{value}</dd>
            </div>
          ))}
        </dl>
        {document.intro?.map((text) => (
          <p key={text} className="mt-4 text-sm leading-7 text-zinc-700">
            {text}
          </p>
        ))}
      </header>

      {document.sections.map((section) => (
        <section key={section.title} className="rounded-lg bg-zinc-50 p-4">
          <h4 className="text-base font-bold text-zinc-950">{section.title}</h4>
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
    return <p className="text-sm leading-7 text-zinc-700">{block.text}</p>;
  }

  if (block.type === "note") {
    return <p className="rounded-md bg-zinc-100 p-3 text-sm leading-7 text-zinc-800">{block.text}</p>;
  }

  if (block.type === "list") {
    return (
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-zinc-700">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead className="bg-zinc-100 text-zinc-800">
          <tr>
            <th scope="col" className="w-48 px-3 py-2 font-bold">
              {block.headers[0]}
            </th>
            <th scope="col" className="px-3 py-2 font-bold">
              {block.headers[1]}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 text-zinc-700">
          {block.rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row" className="px-3 py-2 align-top font-semibold text-zinc-800">
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
