"use client";

import katex from "katex";

import { cn } from "@/lib/utils";

type Token = {
  content: string;
  math: boolean;
  display?: boolean;
};

const MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

function tokenize(value: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of value.matchAll(MATH_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ content: value.slice(cursor, index), math: false });
    }
    const display = raw.startsWith("$$") || raw.startsWith("\\[");
    const content = raw.startsWith("$$")
      ? raw.slice(2, -2)
      : raw.startsWith("\\[")
        ? raw.slice(2, -2)
        : raw.startsWith("\\(")
          ? raw.slice(2, -2)
          : raw.slice(1, -1);
    tokens.push({ content, math: true, display });
    cursor = index + raw.length;
  }
  if (cursor < value.length) {
    tokens.push({ content: value.slice(cursor), math: false });
  }
  return tokens;
}

function renderLatex(content: string, displayMode: boolean) {
  try {
    return katex.renderToString(normalizeLatex(content), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false
    });
  } catch {
    return content;
  }
}

function needsDisplayStyle(content: string) {
  const trimmed = content.trim();
  if (/\\(?:display|text|script)style\b/.test(trimmed)) return false;
  if (/\\(?:lim|sum|prod|int)\b/.test(trimmed)) return true;
  return /\\(?:frac|dfrac|tfrac)\b/.test(trimmed);
}

function hasProminentInlineMath(content: string) {
  const trimmed = content.trim();
  if (/\\(?:lim|sum|prod|int)\b/.test(trimmed)) return true;
  return /\\(?:frac|dfrac|tfrac)\b/.test(trimmed);
}

function applyCasesDisplayStyle(content: string) {
  return content.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_match, body: string) => {
    const styledBody = body.replace(
      /(^|\\\\\s*)(?!\s*\\(?:display|text|script)style\b)/g,
      "$1\\displaystyle ",
    );
    return `\\begin{cases}${styledBody}\\end{cases}`;
  });
}

function normalizeLatex(content: string) {
  const normalized = applyCasesDisplayStyle(content
    .replaceAll("\\dfrac", "\\frac")
    .replaceAll("\\tfrac", "\\frac")
    .replaceAll("\\middle", "")
    .replace(
      /(\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}[\s\S]*?\\end\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\})/g,
      (block) => block.replace(/(^|[^\\])\\\s+/g, "$1\\\\ ")
    ));
  return needsDisplayStyle(normalized) ? `\\displaystyle ${normalized}` : normalized;
}

function needsBlockMath(content: string) {
  return /\\begin\{|\\\\/.test(content);
}

export function MathText({ value, className, clamp }: { value: string | null | undefined; className?: string; clamp?: boolean }) {
  const text = value || "";
  return (
    <span className={cn("tena-math-text whitespace-pre-wrap break-words", clamp && "line-clamp-3", className)}>
      {tokenize(text).map((token, index) => {
        if (!token.math) return <span key={index}>{token.content}</span>;
        const display = Boolean(token.display || needsBlockMath(token.content));
        const prominentInline = !display && hasProminentInlineMath(token.content);
        return (
          <span
            key={index}
            className={
              display
                ? "tena-math-display my-3 block overflow-x-auto"
                : cn("tena-math-inline inline-block max-w-full", prominentInline && "tena-math-inline-prominent")
            }
            dangerouslySetInnerHTML={{ __html: renderLatex(token.content, display) }}
          />
        );
      })}
    </span>
  );
}
