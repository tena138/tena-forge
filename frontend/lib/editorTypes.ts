export type SidebarTab =
  | "templates"
  | "elements"
  | "text"
  | "uploads"
  | "assets"
  | "tools"
  | "projects"
  | "layers";
export type InspectorTab = "properties" | "style" | "layout";
export type GuideAxis = "x" | "y";
export type DrawingTool = "select" | "pen" | "line" | "rect" | "circle" | "triangle" | "arrow";
export type BackgroundFit = "cover" | "contain" | "tile";

export type CanvasElementType =
  | "text"
  | "dynamic_field"
  | "rect"
  | "box"
  | "circle"
  | "triangle"
  | "line"
  | "divider"
  | "path"
  | "image"
  | "logo"
  | "table"
  | "question_area"
  | "solution_area"
  | "answer_table"
  | "icon"
  | "group";

export type DynamicFieldKey =
  | "exam_title"
  | "class_name"
  | "student_name"
  | "date"
  | "exam_date"
  | "exam_start_time"
  | "exam_end_time"
  | "exam_time"
  | "exam_datetime"
  | "page_number"
  | "total_pages"
  | "academy_name"
  | "subject"
  | "grade";

export type Guide = {
  id: string;
  axis: GuideAxis;
  position: number;
};

export type PageMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  linked?: boolean;
};

export type CanvasPage = {
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  backgroundColor: string;
  backgroundImage?: string | null;
  backgroundFit?: BackgroundFit;
  backgroundOpacity?: number;
  margins: PageMargins;
  showMarginGuides?: boolean;
  gridColor: string;
  snapTargets: {
    grid: boolean;
    guides: boolean;
    elements: boolean;
    page: boolean;
  };
};

export type CanvasElement = {
  id: string;
  type: CanvasElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  groupId?: string | null;
  children?: string[];
  text?: string;
  fieldKey?: DynamicFieldKey;
  previewValue?: string;
  src?: string;
  assetId?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: "none" | "solid" | "dashed" | "dotted" | "double";
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  underline?: boolean;
  linethrough?: boolean;
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase";
  padding?: PageMargins;
  borderRadius?: number;
  radius?: number;
  objectFit?: "cover" | "contain" | "fill";
  rows?: number;
  columns?: number;
  headerRow?: boolean;
  headerColumn?: boolean;
  questionNumberFormat?: "문 {n}." | "{n}." | "Q{n}." | "[n]";
  questionFontSize?: number;
  answerFormat?: "정답: {a}" | "답: {a}" | "▶ {a}";
  answersPerRow?: number;
  iconName?: string;
  pathData?: string;
  shapeKind?: string;
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  tableHeaders?: string[];
};

export type CanvasDocumentPage = {
  id: string;
  name: string;
  page: CanvasPage;
  elements: CanvasElement[];
  updatedAt?: string;
};

export type CanvasDocument = {
  version: 1;
  page: CanvasPage;
  elements: CanvasElement[];
  pages?: CanvasDocumentPage[];
  activePageId?: string;
  recentColors?: string[];
  updatedAt?: string;
};

export const A4_CANVAS = {
  width: 794,
  height: 1123,
};

export const DEFAULT_PAGE: CanvasPage = {
  width: A4_CANVAS.width,
  height: A4_CANVAS.height,
  orientation: "portrait",
  backgroundColor: "#ffffff",
  backgroundImage: null,
  backgroundFit: "contain",
  backgroundOpacity: 0.25,
  margins: { top: 56, right: 56, bottom: 56, left: 56, linked: true },
  showMarginGuides: false,
  gridColor: "rgba(99, 102, 241, 0.22)",
  snapTargets: {
    grid: true,
    guides: true,
    elements: true,
    page: true,
  },
};

export const EMPTY_DOCUMENT: CanvasDocument = {
  version: 1,
  page: DEFAULT_PAGE,
  elements: [],
  pages: [
    {
      id: "page-1",
      name: "페이지 1",
      page: DEFAULT_PAGE,
      elements: [],
      updatedAt: new Date().toISOString(),
    },
  ],
  activePageId: "page-1",
  updatedAt: new Date().toISOString(),
};

export function getCanvasDocumentPages(document: CanvasDocument): CanvasDocumentPage[] {
  if (Array.isArray(document.pages) && document.pages.length) return document.pages;
  return [
    {
      id: document.activePageId || "page-1",
      name: "페이지 1",
      page: document.page,
      elements: document.elements,
      updatedAt: document.updatedAt,
    },
  ];
}

export function getActiveCanvasPage(document: CanvasDocument): CanvasDocumentPage {
  const pages = getCanvasDocumentPages(document);
  return pages.find((page) => page.id === document.activePageId) || pages[0];
}
