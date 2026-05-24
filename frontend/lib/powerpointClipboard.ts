import { nanoid } from "nanoid";

import { createElement } from "@/lib/visualTemplatePresets";
import { PAGE_SIZES, TemplateAsset, TemplateElement, TemplatePage } from "@/lib/visualTemplateTypes";

export type ClipboardDesignImage = {
  name: string;
  src: string;
  width?: number;
  height?: number;
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
