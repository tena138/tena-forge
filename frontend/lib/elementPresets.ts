import { nanoid } from "nanoid";

import { A4_CANVAS, CanvasDocument, CanvasElement, CanvasElementType } from "@/lib/editorTypes";

export type ElementPaletteSection = "basicShapes" | "lines" | "boxes" | "exam" | "icons";
export type IconSizeKey = "small" | "medium" | "large";

export type ElementCreateOptions = {
  iconSize?: number;
  primaryColor?: string;
  page?: CanvasDocument["page"];
};

export type ElementPalettePreset = {
  id: string;
  label: string;
  description?: string;
  section: ElementPaletteSection;
  iconKey: string;
  defaultWidth: number;
  defaultHeight: number;
  create: (x: number, y: number, options?: ElementCreateOptions) => CanvasElement;
};

export type RecentElementEntry = {
  presetId: string;
  label: string;
  element: CanvasElement;
  insertedAt: string;
};

const RECENT_ELEMENTS_KEY = "tena-forge-editor-recent-elements";
export const RECENT_COLORS_KEY = "tena-forge-editor-recent-colors";
export const RECENT_ELEMENTS_CHANGED_EVENT = "tena-forge-editor-recent-elements-changed";

const STAR_PATH = "M50 5 L61 36 L95 36 L68 56 L79 90 L50 70 L21 90 L32 56 L5 36 L39 36 Z";
const ARROW_PATH = "M6 38 H64 V20 L96 50 L64 80 V62 H6 Z";
const SPEECH_BUBBLE_PATH = "M10 10 H90 Q98 10 98 18 V66 Q98 74 90 74 H42 L24 92 V74 H10 Q2 74 2 66 V18 Q2 10 10 10 Z";
const DECORATIVE_DIVIDER_PATH = "M0 10 H280 M310 10 L324 0 L338 10 L324 20 Z M368 10 H648";

function wavyPath(width: number) {
  const segments = 12;
  const step = width / segments;
  let path = `M0 8`;
  for (let index = 0; index < segments; index += 1) {
    const x1 = index * step + step / 2;
    const x2 = (index + 1) * step;
    const y1 = index % 2 === 0 ? -2 : 18;
    path += ` Q${x1.toFixed(1)} ${y1} ${x2.toFixed(1)} 8`;
  }
  return path;
}

function lineArrowPath(width: number) {
  const end = Math.max(40, width - 18);
  return `M0 8 H${end} M${end} 8 L${end - 12} 1 M${end} 8 L${end - 12} 15`;
}

function doubleLinePath(width: number) {
  return `M0 3 H${width} M0 11 H${width}`;
}

function baseElement(type: CanvasElementType, name: string, x: number, y: number, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: nanoid(),
    type,
    name,
    x,
    y,
    width: 150,
    height: 150,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    fill: "#e2e8f0",
    stroke: "#000000",
    strokeWidth: 0,
    strokeStyle: "solid",
    color: "#111827",
    fontFamily: "NanumGothic",
    fontSize: 14,
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "left",
    lineHeight: 1.25,
    letterSpacing: 0,
    borderRadius: 0,
    ...extra,
  };
}

function shape(type: CanvasElementType, name: string, x: number, y: number, extra: Partial<CanvasElement> = {}) {
  return baseElement(type, name, x, y, {
    width: 150,
    height: 150,
    fill: "#e2e8f0",
    strokeWidth: 0,
    ...extra,
  });
}

function pathShape(name: string, x: number, y: number, pathData: string, extra: Partial<CanvasElement> = {}) {
  return baseElement("path", name, x, y, {
    width: 150,
    height: 150,
    fill: "#e2e8f0",
    strokeWidth: 0,
    pathData,
    ...extra,
  });
}

function horizontalLine(name: string, x: number, y: number, extra: Partial<CanvasElement> = {}) {
  return baseElement("line", name, x, y, {
    width: A4_CANVAS.width,
    height: 8,
    fill: "transparent",
    stroke: "#000000",
    strokeWidth: 1,
    ...extra,
  });
}

function tableElement(name: string, x: number, y: number, extra: Partial<CanvasElement> = {}) {
  return baseElement("table", name, x, y, {
    width: 320,
    height: 140,
    fill: "#ffffff",
    stroke: "#111827",
    strokeWidth: 1,
    rows: 4,
    columns: 4,
    ...extra,
  });
}

export const iconSizes: Record<IconSizeKey, { label: string; value: number }> = {
  small: { label: "작게", value: 24 },
  medium: { label: "보통", value: 48 },
  large: { label: "크게", value: 72 },
};

export const elementPalettePresets: ElementPalettePreset[] = [
  {
    id: "shape-rect",
    label: "사각형",
    section: "basicShapes",
    iconKey: "rect",
    defaultWidth: 150,
    defaultHeight: 150,
    create: (x, y) => shape("rect", "사각형", x, y),
  },
  {
    id: "shape-circle",
    label: "원",
    section: "basicShapes",
    iconKey: "circle",
    defaultWidth: 150,
    defaultHeight: 150,
    create: (x, y) => shape("circle", "원", x, y),
  },
  {
    id: "shape-triangle",
    label: "삼각형",
    section: "basicShapes",
    iconKey: "triangle",
    defaultWidth: 150,
    defaultHeight: 150,
    create: (x, y) => shape("triangle", "삼각형", x, y),
  },
  {
    id: "shape-rounded-rect",
    label: "둥근 사각형",
    section: "basicShapes",
    iconKey: "roundedRect",
    defaultWidth: 150,
    defaultHeight: 150,
    create: (x, y) => shape("rect", "둥근 사각형", x, y, { borderRadius: 12 }),
  },
  {
    id: "shape-star",
    label: "별",
    section: "basicShapes",
    iconKey: "star",
    defaultWidth: 150,
    defaultHeight: 150,
    create: (x, y) => pathShape("별", x, y, STAR_PATH),
  },
  {
    id: "shape-arrow",
    label: "화살표",
    section: "basicShapes",
    iconKey: "arrow",
    defaultWidth: 150,
    defaultHeight: 150,
    create: (x, y) => pathShape("화살표", x, y, ARROW_PATH),
  },
  {
    id: "line-solid",
    label: "실선",
    section: "lines",
    iconKey: "solidLine",
    defaultWidth: A4_CANVAS.width,
    defaultHeight: 8,
    create: (_x, y) => horizontalLine("실선", 0, y, { strokeStyle: "solid" }),
  },
  {
    id: "line-dashed",
    label: "점선",
    section: "lines",
    iconKey: "dashedLine",
    defaultWidth: A4_CANVAS.width,
    defaultHeight: 8,
    create: (_x, y) => horizontalLine("점선", 0, y, { strokeStyle: "dashed" }),
  },
  {
    id: "line-dotted",
    label: "점점선",
    section: "lines",
    iconKey: "dottedLine",
    defaultWidth: A4_CANVAS.width,
    defaultHeight: 8,
    create: (_x, y) => horizontalLine("점점선", 0, y, { strokeStyle: "dotted" }),
  },
  {
    id: "line-double",
    label: "이중선",
    section: "lines",
    iconKey: "doubleLine",
    defaultWidth: A4_CANVAS.width,
    defaultHeight: 14,
    create: (_x, y) => pathShape("이중선", 0, y, doubleLinePath(A4_CANVAS.width), { width: A4_CANVAS.width, height: 14, fill: "transparent", stroke: "#000000", strokeWidth: 1, shapeKind: "double_line" }),
  },
  {
    id: "line-wavy",
    label: "구불선",
    section: "lines",
    iconKey: "wavyLine",
    defaultWidth: A4_CANVAS.width,
    defaultHeight: 18,
    create: (_x, y) => pathShape("구불선", 0, y, wavyPath(A4_CANVAS.width), { width: A4_CANVAS.width, height: 18, fill: "transparent", stroke: "#000000", strokeWidth: 1, shapeKind: "wavy_line" }),
  },
  {
    id: "line-arrow",
    label: "화살표 선",
    section: "lines",
    iconKey: "arrowLine",
    defaultWidth: A4_CANVAS.width,
    defaultHeight: 16,
    create: (_x, y) => pathShape("화살표 선", 0, y, lineArrowPath(A4_CANVAS.width), { width: A4_CANVAS.width, height: 16, fill: "transparent", stroke: "#000000", strokeWidth: 1, shapeKind: "arrow_line" }),
  },
  {
    id: "box-empty",
    label: "빈 박스",
    section: "boxes",
    iconKey: "emptyBox",
    defaultWidth: 220,
    defaultHeight: 140,
    create: (x, y) => shape("box", "빈 박스", x, y, { width: 220, height: 140, fill: "transparent", stroke: "#111827", strokeWidth: 1 }),
  },
  {
    id: "box-filled",
    label: "채운 박스",
    section: "boxes",
    iconKey: "filledBox",
    defaultWidth: 220,
    defaultHeight: 140,
    create: (x, y) => shape("box", "채운 박스", x, y, { width: 220, height: 140, fill: "#e2e8f0", strokeWidth: 0 }),
  },
  {
    id: "box-shadow",
    label: "그림자 박스",
    section: "boxes",
    iconKey: "shadowBox",
    defaultWidth: 220,
    defaultHeight: 140,
    create: (x, y) => shape("box", "그림자 박스", x, y, { width: 220, height: 140, fill: "#ffffff", stroke: "#e2e8f0", strokeWidth: 1, shadow: { color: "rgba(15, 23, 42, 0.18)", blur: 16, offsetX: 0, offsetY: 8 } }),
  },
  {
    id: "box-rounded",
    label: "둥근 박스",
    section: "boxes",
    iconKey: "roundedBox",
    defaultWidth: 220,
    defaultHeight: 140,
    create: (x, y) => shape("box", "둥근 박스", x, y, { width: 220, height: 140, fill: "#ffffff", stroke: "#111827", strokeWidth: 1, borderRadius: 16 }),
  },
  {
    id: "box-dashed",
    label: "점선 박스",
    section: "boxes",
    iconKey: "dashedBox",
    defaultWidth: 220,
    defaultHeight: 140,
    create: (x, y) => shape("box", "점선 박스", x, y, { width: 220, height: 140, fill: "transparent", stroke: "#111827", strokeWidth: 1, strokeStyle: "dashed" }),
  },
  {
    id: "box-speech",
    label: "말풍선 박스",
    section: "boxes",
    iconKey: "speechBox",
    defaultWidth: 220,
    defaultHeight: 140,
    create: (x, y) => pathShape("말풍선 박스", x, y, SPEECH_BUBBLE_PATH, { width: 220, height: 140, fill: "#ffffff", stroke: "#111827", strokeWidth: 1 }),
  },
  {
    id: "exam-answer-blank",
    label: "답안란",
    description: "정답을 직접 적을 수 있는 밑줄 영역",
    section: "exam",
    iconKey: "answerBlank",
    defaultWidth: 360,
    defaultHeight: 32,
    create: (x, y) => baseElement("text", "답안란", x, y, { width: 360, height: 32, fill: "transparent", text: "답: ______________________________", fontSize: 14, color: "#111827" }),
  },
  {
    id: "exam-score-box",
    label: "점수란",
    description: "점수: ___/100 형식",
    section: "exam",
    iconKey: "scoreBox",
    defaultWidth: 170,
    defaultHeight: 42,
    create: (x, y) => baseElement("text", "점수란", x, y, { width: 170, height: 42, fill: "transparent", text: "점수: ___/100", fontSize: 15, fontWeight: "bold", color: "#111827" }),
  },
  {
    id: "exam-number-boxes",
    label: "수험번호란",
    description: "8칸 digit box",
    section: "exam",
    iconKey: "numberBoxes",
    defaultWidth: 320,
    defaultHeight: 40,
    create: (x, y) => tableElement("수험번호란", x, y, { width: 320, height: 40, rows: 1, columns: 8, tableHeaders: [] }),
  },
  {
    id: "exam-scissors",
    label: "가위표시",
    description: "오려내기용 점선과 가위 아이콘",
    section: "exam",
    iconKey: "scissorsLine",
    defaultWidth: 620,
    defaultHeight: 28,
    create: (x, y) => baseElement("text", "가위표시", x, y, { width: 620, height: 28, fill: "transparent", text: "✂  - - - - - - - - - - - - - - - - - - - - -", fontSize: 16, color: "#111827", letterSpacing: 1 }),
  },
  {
    id: "exam-page-divider",
    label: "페이지 구분선",
    description: "페이지 섹션을 나누는 장식 구분선",
    section: "exam",
    iconKey: "pageDivider",
    defaultWidth: 648,
    defaultHeight: 20,
    create: (x, y) => pathShape("페이지 구분선", x, y, DECORATIVE_DIVIDER_PATH, { width: 648, height: 20, fill: "transparent", stroke: "#111827", strokeWidth: 1 }),
  },
  {
    id: "exam-scoring-table",
    label: "채점표",
    description: "번호/정답/배점 5행 채점표",
    section: "exam",
    iconKey: "scoringTable",
    defaultWidth: 360,
    defaultHeight: 180,
    create: (x, y) => tableElement("채점표", x, y, { width: 360, height: 180, rows: 6, columns: 3, tableHeaders: ["번호", "정답", "배점"] }),
  },
];

const iconDefinitions: Array<{ id: string; label: string; symbol: string; iconKey: string; aliases: string }> = [
  { id: "check", label: "체크", symbol: "✓", iconKey: "check", aliases: "check yes ok" },
  { id: "x", label: "엑스", symbol: "✗", iconKey: "x", aliases: "x cross no" },
  { id: "star", label: "별", symbol: "★", iconKey: "iconStar", aliases: "star" },
  { id: "pencil", label: "연필", symbol: "✎", iconKey: "pencil", aliases: "pencil edit" },
  { id: "clock", label: "시계", symbol: "🕐", iconKey: "clock", aliases: "clock time" },
  { id: "scissors", label: "가위", symbol: "✂", iconKey: "scissors", aliases: "scissors cut" },
  { id: "bang", label: "느낌표", symbol: "!", iconKey: "bang", aliases: "alert exclamation" },
  { id: "question", label: "물음표", symbol: "?", iconKey: "question", aliases: "question help" },
  { id: "play", label: "재생", symbol: "▶", iconKey: "play", aliases: "play triangle" },
  { id: "warning", label: "경고", symbol: "⚠", iconKey: "warning", aliases: "warning caution" },
  { id: "pin", label: "핀", symbol: "📌", iconKey: "pin", aliases: "pin marker" },
  { id: "trophy", label: "트로피", symbol: "🏆", iconKey: "trophy", aliases: "trophy award" },
];

export const iconPalettePresets: ElementPalettePreset[] = iconDefinitions.map((icon) => ({
  id: `icon-${icon.id}`,
  label: icon.label,
  description: icon.aliases,
  section: "icons",
  iconKey: icon.iconKey,
  defaultWidth: 48,
  defaultHeight: 48,
  create: (x, y, options) => {
    const size = options?.iconSize || 48;
    return baseElement("icon", icon.label, x, y, {
      width: size,
      height: size,
      fill: "transparent",
      strokeWidth: 0,
      text: icon.symbol,
      iconName: icon.id,
      fontSize: size,
      color: options?.primaryColor || "#111827",
      textAlign: "center",
      lineHeight: 1,
    });
  },
}));

export const allElementPresets = [...elementPalettePresets, ...iconPalettePresets];

const presetIds = new Set(allElementPresets.map((preset) => preset.id));

export function getElementPreset(id: string) {
  return allElementPresets.find((preset) => preset.id === id) || null;
}

export function readPrimaryColor() {
  if (typeof window === "undefined") return "#111827";
  try {
    const colors = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || "[]") as string[];
    return colors[0] || "#111827";
  } catch {
    return "#111827";
  }
}

export function readRecentElements(): RecentElementEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const entries = JSON.parse(localStorage.getItem(RECENT_ELEMENTS_KEY) || "[]") as RecentElementEntry[];
    return entries.filter((entry) => entry?.presetId && entry?.element && presetIds.has(entry.presetId)).slice(0, 8);
  } catch {
    return [];
  }
}

export function rememberElementUse(presetId: string, label: string, element: CanvasElement) {
  if (typeof window === "undefined" || !presetIds.has(presetId)) return;
  const snapshot = JSON.parse(JSON.stringify({ ...element, id: "recent", zIndex: 0 })) as CanvasElement;
  const next = [
    { presetId, label, element: snapshot, insertedAt: new Date().toISOString() },
    ...readRecentElements().filter((entry) => entry.presetId !== presetId),
  ].slice(0, 8);
  localStorage.setItem(RECENT_ELEMENTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RECENT_ELEMENTS_CHANGED_EVENT));
}

export function cloneRecentElement(entry: RecentElementEntry, x: number, y: number): CanvasElement {
  return {
    ...JSON.parse(JSON.stringify(entry.element)),
    id: nanoid(),
    x,
    y,
    zIndex: 0,
    visible: true,
    locked: false,
  };
}
