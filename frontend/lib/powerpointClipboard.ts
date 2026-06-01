import { nanoid } from "nanoid";

import { createElement } from "@/lib/visualTemplatePresets";
import { ElementStyle, PAGE_SIZES, TemplateAsset, TemplateElement, TemplatePage } from "@/lib/visualTemplateTypes";

export type ClipboardDesignImage = {
  name: string;
  src: string;
  width?: number;
  height?: number;
};

type ClipboardEditableItem =
  | {
      kind: "text";
      text: string;
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      style: ElementStyle;
      explicitPosition: boolean;
    }
  | {
      kind: "shape";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      style: ElementStyle;
      explicitPosition: boolean;
    }
  | {
      kind: "image";
      source: ClipboardDesignImage;
      x: number;
      y: number;
      width: number;
      height: number;
      explicitPosition: boolean;
    }
  | {
      kind: "table";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rows: Array<Array<{ text: string; colSpan: number; rowSpan: number; style: ElementStyle }>>;
      columnWidths: number[];
      rowHeights: number[];
      style: ElementStyle;
      explicitPosition: boolean;
    };

const allowedHtmlTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const allowedStyleProperties = new Set([
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-collapse",
  "border-left",
  "border-right",
  "border-spacing",
  "border-top",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "vertical-align",
  "white-space",
  "width",
]);

function safeCssValue(value: string) {
  return !/expression|javascript:|url\s*\(|behavior|-moz-binding/i.test(value);
}

function cleanInlineStyle(element: HTMLElement) {
  const styles: string[] = [];
  for (const property of Array.from(element.style)) {
    const name = property.toLowerCase();
    const value = element.style.getPropertyValue(property).trim();
    if (!allowedStyleProperties.has(name) || !value || !safeCssValue(value)) continue;
    styles.push(`${name}: ${value}`);
  }
  return styles.join("; ");
}

function sanitizeClipboardHtml(html: string) {
  if (!html.trim() || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, meta, link, xml").forEach((node) => node.remove());

  const elements = Array.from(doc.body.querySelectorAll("*")).reverse();
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (!allowedHtmlTags.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const style = cleanInlineStyle(element as HTMLElement);
    const colspan = element.getAttribute("colspan");
    const rowspan = element.getAttribute("rowspan");
    const href = element.tagName.toLowerCase() === "a" ? element.getAttribute("href") : null;
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
    if (style) element.setAttribute("style", style);
    if (colspan && /^\d+$/.test(colspan)) element.setAttribute("colspan", colspan);
    if (rowspan && /^\d+$/.test(rowspan)) element.setAttribute("rowspan", rowspan);
    if (href && /^https?:\/\//i.test(href)) element.setAttribute("href", href);
  }

  return doc.body.innerHTML.trim();
}

function svgSize(svgText: string) {
  if (typeof DOMParser === "undefined") return {};
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return {};
    const width = Number.parseFloat(svg.getAttribute("width") || "");
    const height = Number.parseFloat(svg.getAttribute("height") || "");
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return { width, height };
    const viewBox = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
      return { width: viewBox[2], height: viewBox[3] };
    }
  } catch {
    return {};
  }
  return {};
}

function svgDataUrl(svgText: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function uniqueImages(images: ClipboardDesignImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.src || seen.has(image.src)) return false;
    seen.add(image.src);
    return true;
  });
}

function cssDeclaration(element: Element, property: string) {
  const htmlElement = element as HTMLElement;
  const fromStyle = htmlElement.style?.getPropertyValue(property);
  if (fromStyle) return fromStyle;
  const style = element.getAttribute("style") || "";
  const pattern = new RegExp(`(?:^|;)\\s*${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`, "i");
  return pattern.exec(style)?.[1]?.trim() || "";
}

function cssLength(value: string | null | undefined) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "auto") return undefined;
  const match = /^(-?\d+(?:\.\d+)?)(px|pt|in|cm|mm|pc)?$/i.exec(trimmed);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = (match[2] || "px").toLowerCase();
  if (!Number.isFinite(amount)) return undefined;
  if (unit === "pt") return amount * (96 / 72);
  if (unit === "in") return amount * 96;
  if (unit === "cm") return amount * 37.7952755906;
  if (unit === "mm") return amount * 3.7795275591;
  if (unit === "pc") return amount * 16;
  return amount;
}

function cssNumber(value: string | null | undefined) {
  const parsed = cssLength(value);
  return typeof parsed === "number" ? parsed : undefined;
}

function cssColor(value: string | null | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "transparent" || trimmed === "none" || trimmed === "initial") return undefined;
  return trimmed;
}

function borderWidth(element: Element) {
  return (
    cssNumber(cssDeclaration(element, "border-width")) ??
    cssNumber(cssDeclaration(element, "border-left-width")) ??
    cssNumber(cssDeclaration(element, "border-top-width")) ??
    (cssDeclaration(element, "border") ? 1 : 0)
  );
}

function borderColor(element: Element) {
  return (
    cssColor(cssDeclaration(element, "border-color")) ||
    cssColor(cssDeclaration(element, "border-left-color")) ||
    cssColor(cssDeclaration(element, "border-top-color")) ||
    cssColor(element.getAttribute("strokecolor"))
  );
}

function backgroundColor(element: Element) {
  return cssColor(cssDeclaration(element, "background-color")) || cssColor(cssDeclaration(element, "background")) || cssColor(element.getAttribute("fillcolor"));
}

function elementGeometry(element: Element, fallbackIndex: number) {
  const x =
    cssNumber(cssDeclaration(element, "left")) ??
    cssNumber(cssDeclaration(element, "margin-left")) ??
    cssNumber(cssDeclaration(element, "mso-position-horizontal")) ??
    0;
  const y =
    cssNumber(cssDeclaration(element, "top")) ??
    cssNumber(cssDeclaration(element, "margin-top")) ??
    cssNumber(cssDeclaration(element, "mso-position-vertical")) ??
    fallbackIndex * 28;
  const width = cssNumber(cssDeclaration(element, "width")) ?? cssNumber(element.getAttribute("width")) ?? 260;
  const height = cssNumber(cssDeclaration(element, "height")) ?? cssNumber(element.getAttribute("height")) ?? 0;
  const explicitPosition = Boolean(
    cssDeclaration(element, "left") ||
      cssDeclaration(element, "top") ||
      cssDeclaration(element, "margin-left") ||
      cssDeclaration(element, "margin-top") ||
      cssDeclaration(element, "position") === "absolute"
  );
  return { x, y, width, height, explicitPosition };
}

function textStyleFromElement(element: Element): ElementStyle {
  const fontWeightValue = cssDeclaration(element, "font-weight").toLowerCase();
  const fontStyleValue = cssDeclaration(element, "font-style").toLowerCase();
  const textAlignValue = cssDeclaration(element, "text-align").toLowerCase();
  const strokeWidth = borderWidth(element);
  const style: ElementStyle = {
    fill: backgroundColor(element) || "transparent",
    stroke: borderColor(element) || "transparent",
    strokeWidth,
    borderStyle: strokeWidth > 0 ? "solid" : "none",
    color: cssColor(cssDeclaration(element, "color")) || "#111827",
    fontFamily: cssDeclaration(element, "font-family") || "Pretendard, Noto Sans KR, sans-serif",
    fontSize: cssNumber(cssDeclaration(element, "font-size")) || 14,
    fontWeight: fontWeightValue === "bold" || Number(fontWeightValue) >= 600 ? "bold" : "normal",
    fontStyle: fontStyleValue === "italic" ? "italic" : "normal",
    textAlign: ["left", "center", "right", "justify"].includes(textAlignValue) ? (textAlignValue as ElementStyle["textAlign"]) : "left",
    lineHeight: Number(cssDeclaration(element, "line-height")) || 1.35,
    letterSpacing: cssNumber(cssDeclaration(element, "letter-spacing")) || 0,
    radius: cssNumber(cssDeclaration(element, "border-radius")) || 0,
  };
  return style;
}

function visualStyleFromElement(element: Element): ElementStyle {
  const strokeWidth = borderWidth(element);
  return {
    fill: backgroundColor(element) || "transparent",
    stroke: borderColor(element) || "transparent",
    strokeWidth,
    borderStyle: strokeWidth > 0 ? "solid" : "none",
    radius: cssNumber(cssDeclaration(element, "border-radius")) || 0,
  };
}

function collapsedText(element: Element) {
  return (element.textContent || "").replace(/\u00a0/g, " ").replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function lineCount(text: string) {
  return Math.max(1, text.split(/\r\n|\r|\n/).length);
}

function hasMeaningfulBox(element: Element) {
  return Boolean(
    cssDeclaration(element, "left") ||
      cssDeclaration(element, "top") ||
      cssDeclaration(element, "width") ||
      cssDeclaration(element, "height") ||
      backgroundColor(element) ||
      borderWidth(element) > 0 ||
      element.getAttribute("fillcolor") ||
      element.getAttribute("strokecolor")
  );
}

function descendantsProcessed(element: Element, processed: Set<Element>) {
  return Array.from(processed).some((item) => element !== item && element.contains(item));
}

function markProcessed(element: Element, processed: Set<Element>) {
  processed.add(element);
  element.querySelectorAll("*").forEach((child) => processed.add(child));
}

function isInsideProcessed(element: Element, processed: Set<Element>) {
  let current: Element | null = element;
  while (current) {
    if (processed.has(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function closestAncestorTable(element: Element) {
  let current = element.parentElement;
  while (current) {
    if (current.tagName.toLowerCase() === "table") return current;
    current = current.parentElement;
  }
  return null;
}

function elementDepth(element: Element) {
  let depth = 0;
  let current = element.parentElement;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function directTableRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll("tr")).filter((row) => closestAncestorTable(row) === table);
}

function tableItemSignature(item: Extract<ClipboardEditableItem, { kind: "table" }>) {
  const text = item.rows
    .map((row) => row.map((cell) => `${cell.text}:${cell.colSpan}x${cell.rowSpan}`).join("|"))
    .join("\n");
  return [Math.round(item.x), Math.round(item.y), Math.round(item.width), Math.round(item.height), text].join("::");
}

function distributeEvenly(total: number, count: number) {
  const safeCount = Math.max(1, count);
  const size = Math.max(1, total) / safeCount;
  return Array.from({ length: safeCount }, () => size);
}

function scaleLengths(lengths: number[], total: number, count: number) {
  const safeCount = Math.max(1, count);
  const normalized = Array.from({ length: safeCount }, (_, index) => Math.max(0, lengths[index] || 0));
  const known = normalized.filter((length) => length > 0);
  if (known.length && known.length < safeCount) {
    const fallback = known.reduce((sum, length) => sum + length, 0) / known.length;
    normalized.forEach((length, index) => {
      if (length <= 0) normalized[index] = fallback;
    });
  }
  const sum = normalized.reduce((value, length) => value + length, 0);
  if (sum <= 0) return distributeEvenly(total, safeCount);
  const scale = Math.max(1, total) / sum;
  return normalized.map((length) => length * scale);
}

function tableColumnWidths(table: HTMLTableElement, columnCount: number) {
  const widths = Array.from(table.querySelectorAll("col"))
    .map((col) => cssNumber(cssDeclaration(col, "width")) ?? cssNumber(col.getAttribute("width")))
    .filter((width): width is number => typeof width === "number" && width > 0);
  if (widths.length >= columnCount) return widths.slice(0, columnCount);

  const firstUsefulRow = Array.from(table.querySelectorAll("tr")).find((row) => Array.from(row.children).some((cell) => cssNumber(cssDeclaration(cell, "width")) || cssNumber(cell.getAttribute("width"))));
  if (!firstUsefulRow) return widths;

  const inferred = [...widths];
  Array.from(firstUsefulRow.children)
    .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
    .forEach((cell) => {
      const width = cssNumber(cssDeclaration(cell, "width")) ?? cssNumber(cell.getAttribute("width"));
      const span = Math.max(1, Number((cell as HTMLTableCellElement).colSpan || cell.getAttribute("colspan") || 1));
      if (!width || width <= 0) {
        for (let index = 0; index < span; index += 1) inferred.push(0);
        return;
      }
      for (let index = 0; index < span; index += 1) inferred.push(width / span);
    });
  return inferred.slice(0, columnCount);
}

function tableRowHeights(rows: HTMLTableRowElement[], rowCount: number) {
  const heights = rows
    .map((row) => cssNumber(cssDeclaration(row, "height")) ?? cssNumber(row.getAttribute("height")))
    .filter((height): height is number => typeof height === "number" && height > 0);
  return heights.slice(0, rowCount);
}

function htmlFragment(html: string) {
  const fragmentMatch = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(html);
  return fragmentMatch?.[1] || html;
}

function textHeight(text: string, style: ElementStyle, fallback = 48) {
  const fontSize = style.fontSize || 14;
  const lineHeight = typeof style.lineHeight === "number" && style.lineHeight > 0 ? style.lineHeight : 1.35;
  return Math.max(fallback, Math.round(lineCount(text) * fontSize * lineHeight + 16));
}

function createTextItem(element: Element, fallbackIndex: number, name = "PowerPoint 텍스트"): ClipboardEditableItem | null {
  const text = collapsedText(element);
  if (!text) return null;
  const geometry = elementGeometry(element, fallbackIndex);
  const style = textStyleFromElement(element);
  return {
    kind: "text",
    name,
    text,
    x: geometry.x,
    y: geometry.y,
    width: Math.max(48, geometry.width),
    height: Math.max(24, geometry.height || textHeight(text, style)),
    style,
    explicitPosition: geometry.explicitPosition,
  };
}

function parseTableItem(table: HTMLTableElement, fallbackIndex: number): Extract<ClipboardEditableItem, { kind: "table" }> | null {
  const directRows = directTableRows(table);
  const rows = directRows.map((row) =>
    Array.from(row.children)
      .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
      .map((cell) => ({
        text: collapsedText(cell),
        colSpan: Number((cell as HTMLTableCellElement).colSpan || cell.getAttribute("colspan") || 1),
        rowSpan: Number((cell as HTMLTableCellElement).rowSpan || cell.getAttribute("rowspan") || 1),
        style: textStyleFromElement(cell),
      }))
  );
  if (!rows.length) return null;
  const columnCount = Math.max(1, ...rows.map((row) => row.reduce((sum, cell) => sum + Math.max(1, cell.colSpan || 1), 0)));
  const explicitColumnWidths = tableColumnWidths(table, columnCount);
  const explicitRowHeights = tableRowHeights(directRows, rows.length);
  const inferredWidth = explicitColumnWidths.reduce((sum, width) => sum + width, 0);
  const inferredHeight = explicitRowHeights.reduce((sum, height) => sum + height, 0);
  const geometry = elementGeometry(table, fallbackIndex);
  const width = Math.max(48, geometry.width || inferredWidth || columnCount * 72);
  const height = Math.max(24, geometry.height || inferredHeight || rows.length * 36);
  return {
    kind: "table",
    name: "PowerPoint 표",
    x: geometry.x,
    y: geometry.y,
    width,
    height,
    rows,
    columnWidths: explicitColumnWidths.length ? scaleLengths(explicitColumnWidths, width, columnCount) : distributeEvenly(width, columnCount),
    rowHeights: explicitRowHeights.length ? scaleLengths(explicitRowHeights, height, rows.length) : distributeEvenly(height, rows.length),
    style: visualStyleFromElement(table),
    explicitPosition: geometry.explicitPosition,
  };
}

function parsePlainTextTableItem(text: string): Extract<ClipboardEditableItem, { kind: "table" }> | null {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (lines.length < 2 || !lines.some((line) => line.includes("\t"))) return null;

  const cells = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  const columnCount = Math.max(1, ...cells.map((row) => row.length));
  if (columnCount < 2) return null;

  const rows = cells.map((row) =>
    Array.from({ length: columnCount }, (_, index) => ({
      text: row[index] || "",
      colSpan: 1,
      rowSpan: 1,
      style: {
        fill: "#ffffff",
        stroke: "#d8dee9",
        strokeWidth: 1,
        borderStyle: "solid" as const,
        color: "#111827",
        fontFamily: "Pretendard, Noto Sans KR, sans-serif",
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: "left" as const,
      },
    }))
  );
  return {
    kind: "table",
    name: "PowerPoint 표",
    x: 0,
    y: 0,
    width: columnCount * 96,
    height: rows.length * 32,
    rows,
    columnWidths: distributeEvenly(columnCount * 96, columnCount),
    rowHeights: distributeEvenly(rows.length * 32, rows.length),
    style: { fill: "#ffffff", stroke: "#d8dee9", strokeWidth: 1, borderStyle: "solid" },
    explicitPosition: false,
  };
}

function rtfDecodeEscapes(value: string) {
  return value
    .replace(/\\'[0-9a-fA-F]{2}/g, (match) => String.fromCharCode(Number.parseInt(match.slice(2), 16)))
    .replace(/\\u(-?\d+)\??/g, (_, code) => {
      const parsed = Number.parseInt(code, 10);
      if (!Number.isFinite(parsed)) return "";
      return String.fromCharCode(parsed < 0 ? parsed + 65536 : parsed);
    });
}

function rtfPlainText(value: string) {
  return rtfDecodeEscapes(value)
    .replace(/\\(?:cell|row|par|line)\b/g, "\n")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n+/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function parseRtfTableItem(rtf: string): Extract<ClipboardEditableItem, { kind: "table" }> | null {
  if (!/\\trowd\b/.test(rtf) || !/\\cellx-?\d+/.test(rtf)) return null;
  type RtfParsedRow = {
    cellX: number[];
    rowHeightTwips: number;
    cells: Array<{ text: string; colSpan: number; rowSpan: number; style: ElementStyle }>;
  };
  const rowBlocks = rtf.match(/\\trowd[\s\S]*?\\row\b/g) || [];
  const parsedRows: RtfParsedRow[] = [];
  rowBlocks.forEach((rowBlock) => {
    const cellX = Array.from(rowBlock.matchAll(/\\cellx(-?\d+)/g))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (cellX.length < 2) return;

    const rowHeightTwips = Math.abs(Number.parseInt(/\\trrh(-?\d+)/.exec(rowBlock)?.[1] || "", 10)) || 0;
    const contentStart = rowBlock.search(/\\cellx-?\d+/);
    const content = contentStart >= 0 ? rowBlock.slice(contentStart).replace(/^(?:[\s\S]*?\\cellx-?\d+)+/, "") : rowBlock;
    const parts = content.split(/\\cell\b/).slice(0, cellX.length);
    const cells = parts.map((part) => ({
      text: rtfPlainText(part),
      colSpan: 1,
      rowSpan: 1,
      style: {
        fill: "#ffffff",
        stroke: "#d8dee9",
        strokeWidth: 1,
        borderStyle: "solid" as const,
        color: "#111827",
        fontFamily: "Pretendard, Noto Sans KR, sans-serif",
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: "left" as const,
      },
    }));
    while (cells.length < cellX.length) {
      cells.push({ ...cells[cells.length - 1], text: "" });
    }
    parsedRows.push({ cellX, rowHeightTwips, cells });
  });

  if (!parsedRows.length) return null;
  const columnCount = Math.max(...parsedRows.map((row) => row.cellX.length));
  if (columnCount < 2) return null;
  const twipToPx = 96 / 1440;
  const referenceCellX = parsedRows.reduce((best, row) => (row.cellX.length > best.length ? row.cellX : best), parsedRows[0].cellX);
  const columnWidths = referenceCellX.map((right, index) => Math.max(8, (right - (referenceCellX[index - 1] || 0)) * twipToPx));
  const rowHeights = parsedRows.map((row) => Math.max(24, row.rowHeightTwips ? row.rowHeightTwips * twipToPx : 32));
  const rows = parsedRows.map((row) => Array.from({ length: columnCount }, (_, index) => row.cells[index] || { ...row.cells[row.cells.length - 1], text: "" }));
  const width = columnWidths.reduce((sum, value) => sum + value, 0);
  const height = rowHeights.reduce((sum, value) => sum + value, 0);
  return {
    kind: "table",
    name: "PowerPoint RTF 표",
    x: 0,
    y: 0,
    width,
    height,
    rows,
    columnWidths,
    rowHeights,
    style: { fill: "#ffffff", stroke: "#d8dee9", strokeWidth: 1, borderStyle: "solid" },
    explicitPosition: false,
  };
}

function parseSvgItem(svg: SVGElement, fallbackIndex: number): ClipboardEditableItem | null {
  const svgText = new XMLSerializer().serializeToString(svg);
  const size = svgSize(svgText);
  const geometry = elementGeometry(svg, fallbackIndex);
  const width = geometry.width || size.width || 240;
  const height = geometry.height || size.height || 160;
  return {
    kind: "image",
    source: { name: "powerpoint-vector.svg", src: svgDataUrl(svgText), width, height },
    x: geometry.x,
    y: geometry.y,
    width,
    height,
    explicitPosition: geometry.explicitPosition,
  };
}

function parseImageItem(image: HTMLImageElement, fallbackIndex: number): ClipboardEditableItem | null {
  const src = image.getAttribute("src") || "";
  if (!src.startsWith("data:image/")) return null;
  const geometry = elementGeometry(image, fallbackIndex);
  const width = geometry.width || Number(image.naturalWidth) || 240;
  const height = geometry.height || Number(image.naturalHeight) || 160;
  return {
    kind: "image",
    source: {
      name: image.getAttribute("alt") || "powerpoint-image.png",
      src,
      width,
      height,
    },
    x: geometry.x,
    y: geometry.y,
    width,
    height,
    explicitPosition: geometry.explicitPosition,
  };
}

function parseShapeItems(element: Element, fallbackIndex: number): ClipboardEditableItem[] {
  const geometry = elementGeometry(element, fallbackIndex);
  const style = visualStyleFromElement(element);
  const text = collapsedText(element);
  const hasVisibleShape = Boolean(style.fill !== "transparent" || (style.strokeWidth || 0) > 0);
  const items: ClipboardEditableItem[] = [];
  if (hasVisibleShape && geometry.width > 8 && (geometry.height || 0) > 8) {
    items.push({
      kind: "shape",
      name: text ? "PowerPoint 도형" : "PowerPoint 배경 도형",
      x: geometry.x,
      y: geometry.y,
      width: Math.max(16, geometry.width),
      height: Math.max(16, geometry.height || 48),
      style,
      explicitPosition: geometry.explicitPosition,
    });
  }
  if (text) {
    items.push({
      kind: "text",
      name: "PowerPoint 텍스트",
      text,
      x: geometry.x + 8,
      y: geometry.y + 6,
      width: Math.max(48, geometry.width - 16),
      height: Math.max(24, (geometry.height || textHeight(text, textStyleFromElement(element))) - 12),
      style: { ...textStyleFromElement(element), fill: "transparent", stroke: "transparent", strokeWidth: 0, borderStyle: "none" },
      explicitPosition: geometry.explicitPosition,
    });
  }
  return items;
}

function clipboardEditableItemsFromHtml(html: string): ClipboardEditableItem[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(htmlFragment(html), "text/html");
  doc.querySelectorAll("script, style, meta, link, xml").forEach((node) => node.remove());

  const processed = new Set<Element>();
  const items: ClipboardEditableItem[] = [];
  const tableSignatures = new Set<string>();

  Array.from(doc.querySelectorAll("table"))
    .sort((a, b) => elementDepth(b) - elementDepth(a))
    .forEach((table, index) => {
      if (isInsideProcessed(table, processed) || descendantsProcessed(table, processed)) return;
      const item = parseTableItem(table as HTMLTableElement, index);
      if (!item) return;
      const signature = tableItemSignature(item);
      if (tableSignatures.has(signature)) return;
      tableSignatures.add(signature);
      items.push(item);
      markProcessed(table, processed);
    });

  Array.from(doc.body.querySelectorAll("*")).forEach((element, index) => {
    if (isInsideProcessed(element, processed)) return;
    const tag = element.tagName.toLowerCase();
    if (tag.includes(":shape") || tag.includes(":rect") || tag.includes(":roundrect") || tag.includes(":textbox")) {
      const shapeItems = parseShapeItems(element, index);
      if (shapeItems.length) {
        items.push(...shapeItems);
        markProcessed(element, processed);
      }
    }
  });

  Array.from(doc.body.querySelectorAll("div,p,section,article,h1,h2,h3,h4,h5,h6")).forEach((element, index) => {
    if (isInsideProcessed(element, processed) || descendantsProcessed(element, processed)) return;
    const text = collapsedText(element);
    if (!text) {
      if (hasMeaningfulBox(element)) {
        const shapeItems = parseShapeItems(element, index);
        if (shapeItems.length) {
          items.push(...shapeItems);
          markProcessed(element, processed);
        }
      }
      return;
    }
    const childBlocks = Array.from(element.children).filter((child) => /^(div|p|section|article|h[1-6]|table)$/i.test(child.tagName));
    if (childBlocks.some((child) => collapsedText(child))) return;
    if (hasMeaningfulBox(element)) {
      const shapeItems = parseShapeItems(element, index);
      if (shapeItems.length) {
        items.push(...shapeItems);
        markProcessed(element, processed);
        return;
      }
    }
    const item = createTextItem(element, index);
    if (!item) return;
    items.push(item);
    markProcessed(element, processed);
  });

  if (!items.some((item) => item.kind === "text")) {
    Array.from(doc.body.querySelectorAll("span")).forEach((element, index) => {
      if (isInsideProcessed(element, processed) || !hasMeaningfulBox(element)) return;
      const item = createTextItem(element, index);
      if (!item) return;
      items.push(item);
      markProcessed(element, processed);
    });
  }

  if (!items.length) {
    Array.from(doc.querySelectorAll("svg")).forEach((svg, index) => {
      if (isInsideProcessed(svg, processed)) return;
      const item = parseSvgItem(svg as unknown as SVGElement, index);
      if (!item) return;
      items.push(item);
      markProcessed(svg, processed);
    });
  }

  if (!items.length) {
    Array.from(doc.querySelectorAll("img")).forEach((image, index) => {
      if (isInsideProcessed(image, processed)) return;
      const item = parseImageItem(image as HTMLImageElement, index);
      if (!item) return;
      items.push(item);
      markProcessed(image, processed);
    });
  }

  return items;
}

export function getClipboardDesignImages(data: DataTransfer | null) {
  if (!data || typeof DOMParser === "undefined") return [];
  const images: ClipboardDesignImage[] = [];
  const directSvg = data.getData("image/svg+xml");
  if (directSvg.trim().startsWith("<svg")) {
    images.push({ name: "powerpoint-design.svg", src: svgDataUrl(directSvg), ...svgSize(directSvg) });
  }

  const html = data.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("svg").forEach((svg, index) => {
      const svgText = new XMLSerializer().serializeToString(svg);
      images.push({ name: `powerpoint-shape-${index + 1}.svg`, src: svgDataUrl(svgText), ...svgSize(svgText) });
    });
    doc.querySelectorAll("img").forEach((img, index) => {
      const src = img.getAttribute("src") || "";
      if (!src.startsWith("data:image/")) return;
      images.push({
        name: img.getAttribute("alt") || `powerpoint-image-${index + 1}.png`,
        src,
        width: Number.parseFloat(img.getAttribute("width") || "") || undefined,
        height: Number.parseFloat(img.getAttribute("height") || "") || undefined,
      });
    });
  }

  return uniqueImages(images);
}

export function getClipboardRichTextHtml(data: DataTransfer | null) {
  const html = data?.getData("text/html") || "";
  const sanitized = sanitizeClipboardHtml(html);
  if (!sanitized) return "";
  const doc = new DOMParser().parseFromString(sanitized, "text/html");
  return (doc.body.textContent || "").trim() ? sanitized : "";
}

export function getClipboardPlainText(data: DataTransfer | null) {
  return (data?.getData("text/plain") || "").trim();
}

export function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 640, height: image.naturalHeight || image.height || 360 });
    image.onerror = () => resolve({ width: 640, height: 360 });
    image.src = src;
  });
}

function pageBounds(page: TemplatePage) {
  const size = page.pageSize || PAGE_SIZES.A4_PORTRAIT;
  const safeArea = page.safeArea || { x: 48, y: 48, width: size.width - 96, height: size.height - 96 };
  return { size, safeArea };
}

function fitIntoPage(page: TemplatePage, x: number, y: number, width: number, height: number) {
  const { size, safeArea } = pageBounds(page);
  const startX = Math.min(Math.max(0, x), Math.max(0, size.width - 80));
  const startY = Math.min(Math.max(0, y), Math.max(0, size.height - 80));
  const maxWidth = Math.max(80, Math.min(safeArea.width, size.width - startX - 48));
  const maxHeight = Math.max(80, Math.min(safeArea.height, size.height - startY - 48));
  const scale = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
  return {
    x: startX,
    y: startY,
    width: Math.max(24, Math.round(width * scale)),
    height: Math.max(24, Math.round(height * scale)),
  };
}

export async function createClipboardImageElements(
  sources: ClipboardDesignImage[],
  page: TemplatePage,
  x: number,
  y: number,
  maxZ: number
): Promise<{ elements: TemplateElement[]; assets: TemplateAsset[] }> {
  const loaded = await Promise.all(
    sources.map(async (source, index) => {
      const dimensions = source.width && source.height ? { width: source.width, height: source.height } : await readImageDimensions(source.src);
      return { source, index, dimensions };
    })
  );

  const elements: TemplateElement[] = [];
  const assets: TemplateAsset[] = [];
  loaded.forEach(({ source, index, dimensions }) => {
    const base = createElement("image", x + index * 18, y + index * 18);
    if (base.type !== "image") return;
    const fitted = fitIntoPage(page, x + index * 18, y + index * 18, dimensions.width, dimensions.height);
    const assetId = nanoid();
    const cleanName = source.name.replace(/\.[^.]+$/, "") || "PowerPoint 디자인";
    assets.push({ id: assetId, type: "image", name: source.name, url: source.src });
    elements.push({
      ...base,
      ...fitted,
      id: nanoid(),
      name: cleanName,
      src: source.src,
      objectFit: "contain",
      zIndex: maxZ + index + 1,
    });
  });
  return { elements, assets };
}

function itemColumnCount(item: Extract<ClipboardEditableItem, { kind: "table" }>) {
  return Math.max(1, ...item.rows.map((row) => row.reduce((sum, cell) => sum + Math.max(1, cell.colSpan || 1), 0)));
}

function itemBounds(item: ClipboardEditableItem) {
  return {
    left: item.x,
    top: item.y,
    right: item.x + item.width,
    bottom: item.y + item.height,
  };
}

function scaleStyle(style: ElementStyle, scale: number): ElementStyle {
  return {
    ...style,
    fontSize: typeof style.fontSize === "number" ? Math.max(6, Math.round(style.fontSize * scale * 10) / 10) : style.fontSize,
    strokeWidth: typeof style.strokeWidth === "number" ? Math.max(0, Math.round(style.strokeWidth * scale * 10) / 10) : style.strokeWidth,
    radius: typeof style.radius === "number" ? Math.max(0, Math.round(style.radius * scale * 10) / 10) : style.radius,
    letterSpacing: typeof style.letterSpacing === "number" ? Math.round(style.letterSpacing * scale * 10) / 10 : style.letterSpacing,
  };
}

function normalizedItemFrame(item: ClipboardEditableItem, minX: number, minY: number, pasteX: number, pasteY: number, scale: number) {
  return {
    x: Math.round(pasteX + (item.x - minX) * scale),
    y: Math.round(pasteY + (item.y - minY) * scale),
    width: Math.max(8, Math.round(item.width * scale)),
    height: Math.max(8, Math.round(item.height * scale)),
  };
}

function lengthOffsets(lengths: number[]) {
  const offsets = [0];
  lengths.forEach((length) => offsets.push(offsets[offsets.length - 1] + length));
  return offsets;
}

function sumSpan(lengths: number[], start: number, span: number) {
  return lengths.slice(start, start + Math.max(1, span)).reduce((sum, length) => sum + length, 0);
}

function editableGroupScale(items: ClipboardEditableItem[], page: TemplatePage, pasteX: number, pasteY: number) {
  const bounds = items.map(itemBounds);
  const minX = Math.min(...bounds.map((bound) => bound.left));
  const minY = Math.min(...bounds.map((bound) => bound.top));
  const maxX = Math.max(...bounds.map((bound) => bound.right));
  const maxY = Math.max(...bounds.map((bound) => bound.bottom));
  const groupWidth = Math.max(1, maxX - minX);
  const groupHeight = Math.max(1, maxY - minY);
  const { size, safeArea } = pageBounds(page);
  const maxWidth = Math.max(80, Math.min(safeArea.width, size.width - pasteX - 48));
  const maxHeight = Math.max(80, Math.min(safeArea.height, size.height - pasteY - 48));
  const scale = Math.min(1, maxWidth / groupWidth, maxHeight / groupHeight);
  return { minX, minY, scale };
}

export async function createClipboardEditableElements(data: DataTransfer | null, page: TemplatePage, x: number, y: number, maxZ: number) {
  const items = clipboardEditableItemsFromHtml(data?.getData("text/html") || "");
  if (!items.length) {
    const tableItem = parseRtfTableItem(data?.getData("text/rtf") || "");
    if (tableItem) items.push(tableItem);
  }
  if (!items.length) {
    const tableItem = parsePlainTextTableItem(data?.getData("text/plain") || "");
    if (tableItem) items.push(tableItem);
  }
  if (!items.length) return { elements: [] as TemplateElement[], assets: [] as TemplateAsset[] };

  const { minX, minY, scale } = editableGroupScale(items, page, x, y);
  const elements: TemplateElement[] = [];
  const assets: TemplateAsset[] = [];
  const groupId = nanoid();
  let zIndex = maxZ;

  for (const item of items) {
    const frame = normalizedItemFrame(item, minX, minY, x, y, scale);
    if (item.kind === "shape") {
      const base = createElement("shape", frame.x, frame.y);
      if (base.type !== "shape") continue;
      elements.push({
        ...base,
        ...frame,
        id: nanoid(),
        name: item.name,
        shape: (item.style.radius || 0) > 0 ? "roundRect" : "rect",
        style: scaleStyle(item.style, scale),
        zIndex: ++zIndex,
        groupId,
      });
      continue;
    }

    if (item.kind === "text") {
      const base = createElement("text", frame.x, frame.y);
      if (base.type !== "text") continue;
      elements.push({
        ...base,
        ...frame,
        id: nanoid(),
        name: item.name,
        text: item.text,
        style: scaleStyle(item.style, scale),
        zIndex: ++zIndex,
        groupId,
      });
      continue;
    }

    if (item.kind === "image") {
      const base = createElement("image", frame.x, frame.y);
      if (base.type !== "image") continue;
      const assetId = nanoid();
      assets.push({ id: assetId, type: "image", name: item.source.name, url: item.source.src });
      elements.push({
        ...base,
        ...frame,
        id: nanoid(),
        name: item.source.name.replace(/\.[^.]+$/, "") || "PowerPoint 이미지",
        src: item.source.src,
        objectFit: "contain",
        zIndex: ++zIndex,
        groupId,
      });
      continue;
    }

    const columns = itemColumnCount(item);
    const rowCount = Math.max(1, item.rows.length);
    const columnWidths = scaleLengths(item.columnWidths, frame.width, columns);
    const rowHeights = scaleLengths(item.rowHeights, frame.height, rowCount);
    const columnOffsets = lengthOffsets(columnWidths);
    const rowOffsets = lengthOffsets(rowHeights);
    const occupied: boolean[][] = Array.from({ length: rowCount }, () => Array.from({ length: columns }, () => false));

    item.rows.forEach((row, rowIndex) => {
      let columnIndex = 0;
      row.forEach((cell) => {
        while (columnIndex < columns && occupied[rowIndex]?.[columnIndex]) columnIndex += 1;
        const colSpan = Math.max(1, cell.colSpan || 1);
        const rowSpan = Math.max(1, cell.rowSpan || 1);
        const cellX = Math.round(frame.x + columnOffsets[columnIndex]);
        const cellY = Math.round(frame.y + rowOffsets[rowIndex]);
        const cellWidth = Math.max(1, Math.round(sumSpan(columnWidths, columnIndex, colSpan)));
        const cellHeight = Math.max(1, Math.round(sumSpan(rowHeights, rowIndex, rowSpan)));
        for (let r = rowIndex; r < Math.min(rowCount, rowIndex + rowSpan); r += 1) {
          for (let c = columnIndex; c < Math.min(columns, columnIndex + colSpan); c += 1) {
            occupied[r][c] = true;
          }
        }

        const cellShape = createElement("shape", cellX, cellY);
        if (cellShape.type === "shape") {
          elements.push({
            ...cellShape,
            id: nanoid(),
            name: "표 셀",
            x: cellX,
            y: cellY,
            width: cellWidth,
            height: cellHeight,
            shape: "rect",
            style: scaleStyle(
              {
                fill: cell.style.fill && cell.style.fill !== "transparent" ? cell.style.fill : item.style.fill || "#ffffff",
                stroke: cell.style.stroke && cell.style.stroke !== "transparent" ? cell.style.stroke : item.style.stroke || "#d8dee9",
                strokeWidth: cell.style.strokeWidth || item.style.strokeWidth || 1,
                borderStyle: cell.style.borderStyle || item.style.borderStyle || "solid",
                radius: 0,
              },
              scale
            ),
            zIndex: ++zIndex,
            groupId,
          });
        }

        if (cell.text) {
          const padding = Math.max(2, Math.round(4 * scale));
          const textBase = createElement("text", cellX + padding, cellY + padding);
          if (textBase.type === "text") {
            elements.push({
              ...textBase,
              id: nanoid(),
              name: "표 셀 텍스트",
              x: cellX + padding,
              y: cellY + padding,
              width: Math.max(12, cellWidth - padding * 2),
              height: Math.max(12, cellHeight - padding * 2),
              text: cell.text,
              style: scaleStyle({ ...cell.style, fill: "transparent", stroke: "transparent", strokeWidth: 0, borderStyle: "none" }, scale),
              zIndex: ++zIndex,
              groupId,
            });
          }
        }
        columnIndex += colSpan;
      });
    });
  }

  return { elements, assets };
}

function measureHtml(html: string, width: number) {
  if (typeof document === "undefined") return 120;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.top = "0";
  probe.style.width = `${width}px`;
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.fontFamily = "Pretendard, Noto Sans KR, sans-serif";
  probe.style.fontSize = "14px";
  probe.style.lineHeight = "1.5";
  probe.innerHTML = html;
  document.body.appendChild(probe);
  const height = Math.ceil(probe.getBoundingClientRect().height);
  probe.remove();
  return height || 120;
}

export function createClipboardRichTextElement(html: string, page: TemplatePage, x: number, y: number, zIndex: number) {
  if (!html) return null;
  const { size, safeArea } = pageBounds(page);
  const availableWidth = Math.max(160, Math.min(safeArea.width, size.width - x - 48));
  const width = Math.round(Math.min(640, Math.max(160, availableWidth)));
  const measuredHeight = measureHtml(html, width);
  const height = Math.round(Math.min(Math.max(80, measuredHeight + 28), Math.max(120, size.height - y - 48)));
  const base = createElement("richText", x, y);
  if (base.type !== "richText") return null;
  return {
    ...base,
    id: nanoid(),
    name: "PowerPoint 텍스트",
    width,
    height,
    html,
    zIndex,
    style: {
      ...base.style,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      borderStyle: "none",
      color: "#111827",
      fontSize: 14,
      lineHeight: 1.5,
    },
  } satisfies TemplateElement;
}

export function createClipboardTextElement(text: string, page: TemplatePage, x: number, y: number, zIndex: number) {
  if (!text.trim()) return null;
  const { size, safeArea } = pageBounds(page);
  const availableWidth = Math.max(160, Math.min(safeArea.width, size.width - x - 48));
  const width = Math.round(Math.min(560, Math.max(160, availableWidth)));
  const lineCount = Math.max(1, text.split(/\r\n|\r|\n/).length);
  const height = Math.round(Math.min(Math.max(56, lineCount * 24 + 20), Math.max(80, size.height - y - 48)));
  const base = createElement("text", x, y);
  if (base.type !== "text") return null;
  return {
    ...base,
    id: nanoid(),
    name: "붙여넣은 텍스트",
    text,
    width,
    height,
    zIndex,
    style: {
      ...base.style,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
      borderStyle: "none",
      fontWeight: "normal",
    },
  } satisfies TemplateElement;
}
