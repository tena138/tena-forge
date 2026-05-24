import { nanoid } from "nanoid";

import { createElement } from "@/lib/visualTemplatePresets";
import { ElementStyle, PAGE_SIZES, TemplateAsset, TemplateElement, TemplatePage } from "@/lib/visualTemplateTypes";

type PptxImportResult = {
  elements: TemplateElement[];
  assets: TemplateAsset[];
  slideName: string;
};

const EMU_PER_PX = 9525;

const namespaces = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};

function parseXml(source: string) {
  return new DOMParser().parseFromString(source, "application/xml");
}

function children(element: Element | Document, name: string) {
  return Array.from(element.getElementsByTagName(name));
}

function first(element: Element | Document, name: string) {
  return element.getElementsByTagName(name)[0] || null;
}

function attrNumber(element: Element | null, name: string, fallback = 0) {
  if (!element) return fallback;
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : fallback;
}

function emuToPx(value: number) {
  return value / EMU_PER_PX;
}

function xfrmFrame(container: Element) {
  const xfrm = first(container, "a:xfrm") || first(container, "p:xfrm");
  const off = xfrm ? first(xfrm, "a:off") : null;
  const ext = xfrm ? first(xfrm, "a:ext") : null;
  return {
    x: emuToPx(attrNumber(off, "x")),
    y: emuToPx(attrNumber(off, "y")),
    width: Math.max(8, emuToPx(attrNumber(ext, "cx", 180 * EMU_PER_PX))),
    height: Math.max(8, emuToPx(attrNumber(ext, "cy", 80 * EMU_PER_PX))),
  };
}

function slideSize(presentationXml: Document) {
  const size = first(presentationXml, "p:sldSz");
  return {
    width: emuToPx(attrNumber(size, "cx", 9144000)),
    height: emuToPx(attrNumber(size, "cy", 6858000)),
  };
}

function hexColor(container: Element | null, fallback?: string) {
  if (!container) return fallback;
  const srgb = first(container, "a:srgbClr");
  const value = srgb?.getAttribute("val");
  if (value && /^[0-9a-f]{6}$/i.test(value)) return `#${value}`;
  const scheme = first(container, "a:schemeClr")?.getAttribute("val");
  if (scheme === "tx1" || scheme === "dk1") return "#111827";
  if (scheme === "bg1" || scheme === "lt1") return "#ffffff";
  if (scheme === "accent1") return "#2563eb";
  if (scheme === "accent2") return "#dc2626";
  if (scheme === "accent3") return "#16a34a";
  if (scheme === "accent4") return "#7c3aed";
  if (scheme === "accent5") return "#0891b2";
  if (scheme === "accent6") return "#ea580c";
  return fallback;
}

function fillColor(container: Element, fallback = "transparent") {
  const noFill = first(container, "a:noFill");
  if (noFill) return "transparent";
  return hexColor(first(container, "a:solidFill"), fallback) || fallback;
}

function lineStyle(container: Element): Pick<ElementStyle, "stroke" | "strokeWidth" | "borderStyle"> {
  const line = first(container, "a:ln");
  if (!line || first(line, "a:noFill")) return { stroke: "transparent", strokeWidth: 0, borderStyle: "none" };
  const width = Math.max(0, emuToPx(attrNumber(line, "w", 0)));
  const dash = first(line, "a:prstDash")?.getAttribute("val") || "solid";
  return {
    stroke: hexColor(first(line, "a:solidFill"), "#111827") || "#111827",
    strokeWidth: width ? Math.max(1, Math.round(width)) : 1,
    borderStyle: dash === "dash" ? "dashed" : dash === "dot" ? "dotted" : "solid",
  };
}

function textRuns(shape: Element) {
  const paragraphs = children(shape, "a:p");
  return paragraphs
    .map((paragraph) =>
      children(paragraph, "a:t")
        .map((node) => node.textContent || "")
        .join("")
    )
    .join("\n")
    .trim();
}

function firstRunStyle(shape: Element): ElementStyle {
  const runProperties = first(shape, "a:rPr") || first(shape, "a:defRPr");
  const paragraphProperties = first(shape, "a:pPr");
  const fontSize = attrNumber(runProperties, "sz", 0);
  const align = paragraphProperties?.getAttribute("algn") || "l";
  const typeface = first(runProperties || shape, "a:latin")?.getAttribute("typeface") || "Pretendard, Noto Sans KR, sans-serif";
  return {
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    borderStyle: "none",
    color: hexColor(first(runProperties || shape, "a:solidFill"), "#111827") || "#111827",
    fontFamily: typeface,
    fontSize: fontSize ? Math.round((fontSize / 100) * (96 / 72)) : 14,
    fontWeight: runProperties?.getAttribute("b") === "1" ? "bold" : "normal",
    fontStyle: runProperties?.getAttribute("i") === "1" ? "italic" : "normal",
    textAlign: align === "ctr" ? "center" : align === "r" ? "right" : align === "just" ? "justify" : "left",
    lineHeight: 1.25,
  };
}

function shapePreset(shape: Element) {
  return first(shape, "a:prstGeom")?.getAttribute("prst") || "rect";
}

function normalizeTarget(target: string) {
  const parts: string[] = [];
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function relationshipMap(relsXml: Document) {
  const map = new Map<string, string>();
  children(relsXml, "Relationship").forEach((relationship) => {
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (id && target) map.set(id, normalizeTarget(`ppt/slides/${target}`));
  });
  return map;
}

function dataUrlForMedia(path: string, bytes: Uint8Array) {
  const extension = path.split(".").pop()?.toLowerCase();
  const mime =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "gif"
          ? "image/gif"
          : extension === "svg"
            ? "image/svg+xml"
            : "application/octet-stream";
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function pageTransform(page: TemplatePage, sourceWidth: number, sourceHeight: number) {
  const size = page.pageSize || PAGE_SIZES.A4_PORTRAIT;
  const scale = Math.min(size.width / sourceWidth, size.height / sourceHeight);
  return {
    scale,
    offsetX: Math.round((size.width - sourceWidth * scale) / 2),
    offsetY: Math.round((size.height - sourceHeight * scale) / 2),
  };
}

function transformFrame(frame: { x: number; y: number; width: number; height: number }, transform: { scale: number; offsetX: number; offsetY: number }) {
  return {
    x: Math.round(transform.offsetX + frame.x * transform.scale),
    y: Math.round(transform.offsetY + frame.y * transform.scale),
    width: Math.max(8, Math.round(frame.width * transform.scale)),
    height: Math.max(8, Math.round(frame.height * transform.scale)),
  };
}

function scaledStyle(style: ElementStyle, scale: number): ElementStyle {
  return {
    ...style,
    fontSize: typeof style.fontSize === "number" ? Math.max(6, Math.round(style.fontSize * scale * 10) / 10) : style.fontSize,
    strokeWidth: typeof style.strokeWidth === "number" ? Math.max(0, Math.round(style.strokeWidth * scale * 10) / 10) : style.strokeWidth,
    radius: typeof style.radius === "number" ? Math.max(0, Math.round(style.radius * scale * 10) / 10) : style.radius,
  };
}

function buildShapeElements(shape: Element, transform: ReturnType<typeof pageTransform>, zIndex: number, groupId: string) {
  const frame = transformFrame(xfrmFrame(shape), transform);
  const text = textRuns(shape);
  const preset = shapePreset(shape);
  const style = {
    fill: fillColor(shape, "transparent"),
    ...lineStyle(shape),
    radius: preset === "roundRect" ? 14 : 0,
  };
  const elements: TemplateElement[] = [];
  const visibleShape = style.fill !== "transparent" || (style.strokeWidth || 0) > 0;

  if (visibleShape) {
    const base = createElement("shape", frame.x, frame.y);
    if (base.type === "shape") {
      elements.push({
        ...base,
        ...frame,
        id: nanoid(),
        name: text ? "PowerPoint 도형" : "PowerPoint 배경 도형",
        shape: preset === "roundRect" ? "roundRect" : preset === "ellipse" && frame.width === frame.height ? "circle" : preset === "triangle" ? "triangle" : "rect",
        style: scaledStyle(style, transform.scale),
        zIndex: zIndex + elements.length + 1,
        groupId,
      });
    }
  }

  if (text) {
    const base = createElement("text", frame.x + 6, frame.y + 6);
    if (base.type === "text") {
      elements.push({
        ...base,
        id: nanoid(),
        name: "PowerPoint 텍스트",
        x: frame.x + 6,
        y: frame.y + 6,
        width: Math.max(24, frame.width - 12),
        height: Math.max(18, frame.height - 12),
        text,
        style: scaledStyle({ ...firstRunStyle(shape), fill: "transparent", stroke: "transparent", strokeWidth: 0, borderStyle: "none" }, transform.scale),
        zIndex: zIndex + elements.length + 1,
        groupId,
      });
    }
  }

  return elements;
}

async function buildImageElement(
  picture: Element,
  rels: Map<string, string>,
  zip: { file(path: string): { async(type: "uint8array"): Promise<Uint8Array> } | null },
  transform: ReturnType<typeof pageTransform>,
  zIndex: number,
  groupId: string
) {
  const embedId = first(picture, "a:blip")?.getAttributeNS(namespaces.r, "embed") || first(picture, "a:blip")?.getAttribute("r:embed");
  const path = embedId ? rels.get(embedId) : null;
  const media = path ? zip.file(path) : null;
  if (!path || !media) return null;
  const bytes = await media.async("uint8array");
  const src = dataUrlForMedia(path, bytes);
  const frame = transformFrame(xfrmFrame(picture), transform);
  const base = createElement("image", frame.x, frame.y);
  if (base.type !== "image") return null;
  const assetId = nanoid();
  const name = path.split("/").pop() || "powerpoint-image";
  return {
    asset: { id: assetId, type: "image" as const, name, url: src },
    element: {
      ...base,
      ...frame,
      id: nanoid(),
      name: name.replace(/\.[^.]+$/, "") || "PowerPoint 이미지",
      src,
      objectFit: "contain" as const,
      zIndex,
      groupId,
    } satisfies TemplateElement,
  };
}

function buildTableElements(frame: Element, transform: ReturnType<typeof pageTransform>, zIndex: number, groupId: string) {
  const table = first(frame, "a:tbl");
  if (!table) return [];
  const rows = children(table, "a:tr");
  if (!rows.length) return [];
  const outer = transformFrame(xfrmFrame(frame), transform);
  const columnCount = Math.max(1, ...rows.map((row) => children(row, "a:tc").length));
  const base = createElement("table", outer.x, outer.y);
  if (base.type !== "table") return [];
  const elements: TemplateElement[] = [
    {
      ...base,
      ...outer,
      id: nanoid(),
      name: "PowerPoint 표",
      rows: rows.length,
      columns: columnCount,
      headerRow: false,
      style: { fill: "#ffffff", stroke: "#d8dee9", strokeWidth: 1, borderStyle: "solid" },
      zIndex: zIndex + 1,
      groupId,
    },
  ];
  const cellWidth = outer.width / columnCount;
  const cellHeight = outer.height / rows.length;
  rows.forEach((row, rowIndex) => {
    children(row, "a:tc").forEach((cell, columnIndex) => {
      const text = textRuns(cell);
      if (!text) return;
      const textBase = createElement("text", outer.x + columnIndex * cellWidth + 4, outer.y + rowIndex * cellHeight + 4);
      if (textBase.type !== "text") return;
      elements.push({
        ...textBase,
        id: nanoid(),
        name: "표 셀 텍스트",
        x: Math.round(outer.x + columnIndex * cellWidth + 4),
        y: Math.round(outer.y + rowIndex * cellHeight + 4),
        width: Math.max(16, Math.round(cellWidth - 8)),
        height: Math.max(14, Math.round(cellHeight - 8)),
        text,
        style: scaledStyle(firstRunStyle(cell), transform.scale),
        zIndex: zIndex + elements.length + 1,
        groupId,
      });
    });
  });
  return elements;
}

export async function importPowerPointFile(file: File, page: TemplatePage): Promise<PptxImportResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const presentationFile = zip.file("ppt/presentation.xml");
  const slideFile = zip.file("ppt/slides/slide1.xml");
  const relsFile = zip.file("ppt/slides/_rels/slide1.xml.rels");
  if (!presentationFile || !slideFile) throw new Error("PPTX에서 첫 번째 슬라이드를 찾지 못했습니다.");

  const presentationXml = parseXml(await presentationFile.async("text"));
  const slideXml = parseXml(await slideFile.async("text"));
  const rels = relsFile ? relationshipMap(parseXml(await relsFile.async("text"))) : new Map<string, string>();
  const sourceSize = slideSize(presentationXml);
  const transform = pageTransform(page, sourceSize.width, sourceSize.height);
  const groupId = nanoid();
  const elements: TemplateElement[] = [];
  const assets: TemplateAsset[] = [];

  for (const shape of children(slideXml, "p:sp")) {
    elements.push(...buildShapeElements(shape, transform, elements.length, groupId));
  }

  for (const graphicFrame of children(slideXml, "p:graphicFrame")) {
    elements.push(...buildTableElements(graphicFrame, transform, elements.length, groupId));
  }

  for (const picture of children(slideXml, "p:pic")) {
    const result = await buildImageElement(picture, rels, zip, transform, elements.length + 1, groupId);
    if (!result) continue;
    assets.push(result.asset);
    elements.push(result.element);
  }

  return { elements, assets, slideName: file.name.replace(/\.pptx$/i, "") || "PowerPoint" };
}
