export type TemplateCategory = "exam" | "textbook" | "solution" | "worksheet" | "answerSheet" | "report" | "custom";
export type TemplateVisibility = "private" | "academy" | "public" | "marketplace";

export type PageRole =
  | "cover"
  | "toc"
  | "exam"
  | "textbookInner"
  | "textbookLeft"
  | "textbookRight"
  | "problem"
  | "solution"
  | "answer"
  | "report"
  | "custom";

export type PageSizePreset = "A4_PORTRAIT" | "A4_LANDSCAPE" | "B5_PORTRAIT" | "B5_LANDSCAPE" | "LETTER" | "CUSTOM";

export type PageSize = {
  preset: PageSizePreset;
  width: number;
  height: number;
  unit: "px" | "mm" | "pt";
};

export type Box = { x: number; y: number; width: number; height: number };
export type Guide = { id: string; axis: "x" | "y"; position: number };

export type TemplateTheme = {
  primary: string;
  graphite: string;
  muted: string;
  fontFamily: string;
};

export type PageBackground = {
  color: string;
  imageUrl?: string | null;
  opacity?: number;
};

export type ElementStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "medium" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  letterSpacing?: number;
  shadow?: { color: string; blur: number; x: number; y: number };
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
};

export type ElementBase = {
  id: string;
  type: TemplateElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  name: string;
  style: ElementStyle;
  groupId?: string | null;
};

export type TemplateVariableKey =
  | "subject"
  | "test_title"
  | "book_title"
  | "exam_date"
  | "exam_start_time"
  | "exam_end_time"
  | "exam_time"
  | "exam_datetime"
  | "chapter_title"
  | "unit_title"
  | "academy_name"
  | "teacher_name"
  | "student_name"
  | "class_name"
  | "date"
  | "page_number"
  | "total_pages"
  | "problem_number"
  | "problem_text"
  | "problem_choices"
  | "problem_answer"
  | "solution_text"
  | "difficulty"
  | "tags"
  | "qr_code";

export type TextElement = ElementBase & { type: "text"; text: string };
export type RichTextElement = ElementBase & { type: "richText"; html: string };
export type ImageElement = ElementBase & { type: "image"; src?: string | null; objectFit: "cover" | "contain" | "fill" };
export type ShapeElement = ElementBase & { type: "shape"; shape: "rect" | "roundRect" | "circle" | "triangle" | "star" };
export type LineElement = ElementBase & { type: "line"; lineKind: "solid" | "dashed" | "dotted" | "double" | "arrow" };
export type TableElement = ElementBase & { type: "table"; rows: number; columns: number; headerRow?: boolean };
export type VariableElement = ElementBase & { type: "variable"; variableKey: TemplateVariableKey | (string & {}); fallback: string };
export type PageNumberElement = ElementBase & { type: "pageNumber"; format: string };
export type QrElement = ElementBase & { type: "qr"; value: string };
export type WatermarkElement = ElementBase & { type: "watermark"; text: string };

export type RegionBinding = "problems" | "solutions" | "answers" | "passages" | "generic";
export type RegionOverflowStrategy = "create-next-page" | "clip" | "warn";

export type ContentRegionElement = ElementBase & {
  type: "problemRegion" | "solutionRegion" | "answerRegion" | "contentRegion";
  binding: RegionBinding;
  columns: number;
  rows?: number;
  columnGap: number;
  rowGap: number;
  padding: number;
  fillDirection: "row-first" | "column-first";
  keepTogether: boolean;
  allowSplit: boolean;
  overflowStrategy: RegionOverflowStrategy;
  nextPageRolePreference?: PageRole;
  minItemHeight: number;
  maxItemHeight?: number;
  showContinuationMarker?: boolean;
  numberFormat?: string;
  columnDividerStyle?: ElementStyle;
  cardStyle: ElementStyle;
  numberStyle: ElementStyle;
  bodyStyle: ElementStyle;
  answerSpaceStyle: ElementStyle;
};

export type HeaderBlockElement = ElementBase & { type: "headerBlock"; title: string; subtitle?: string };
export type FooterBlockElement = ElementBase & { type: "footerBlock"; text: string };

export type TemplateElement =
  | TextElement
  | RichTextElement
  | ImageElement
  | ShapeElement
  | LineElement
  | TableElement
  | VariableElement
  | PageNumberElement
  | ContentRegionElement
  | QrElement
  | WatermarkElement
  | HeaderBlockElement
  | FooterBlockElement;

export type TemplateElementType =
  | "text"
  | "richText"
  | "image"
  | "shape"
  | "line"
  | "table"
  | "variable"
  | "pageNumber"
  | "problemRegion"
  | "solutionRegion"
  | "answerRegion"
  | "contentRegion"
  | "qr"
  | "watermark"
  | "headerBlock"
  | "footerBlock";

export type TemplateAsset = {
  id: string;
  type: "image" | "logo" | "font" | "component";
  name: string;
  url?: string | null;
};

export type TemplatePage = {
  id: string;
  name: string;
  role: PageRole;
  pageSize?: PageSize;
  background: PageBackground;
  elements: TemplateElement[];
  guides?: Guide[];
  safeArea?: Box;
};

export type TemplateSet = {
  id: string;
  schemaVersion: number;
  title: string;
  description?: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  defaultPageSize: PageSize;
  theme: TemplateTheme;
  pages: TemplatePage[];
  assets: TemplateAsset[];
  createdAt?: string;
  updatedAt?: string;
};

export type SampleProblem = {
  id: string;
  number: number;
  text: string;
  choices?: string[];
  answer?: string;
  solution?: string;
  visualUrl?: string;
  visual_url?: string;
  difficulty?: string;
  tags?: string[];
};

export type PreflightIssue = {
  id: string;
  level: "error" | "warning";
  message: string;
  pageId?: string;
  elementId?: string;
};

export const PAGE_SIZES: Record<PageSizePreset, PageSize> = {
  A4_PORTRAIT: { preset: "A4_PORTRAIT", width: 794, height: 1123, unit: "px" },
  A4_LANDSCAPE: { preset: "A4_LANDSCAPE", width: 1123, height: 794, unit: "px" },
  B5_PORTRAIT: { preset: "B5_PORTRAIT", width: 688, height: 976, unit: "px" },
  B5_LANDSCAPE: { preset: "B5_LANDSCAPE", width: 976, height: 688, unit: "px" },
  LETTER: { preset: "LETTER", width: 816, height: 1056, unit: "px" },
  CUSTOM: { preset: "CUSTOM", width: 794, height: 1123, unit: "px" },
};

export const sampleProblems: SampleProblem[] = [
  {
    id: "sample-1",
    number: 1,
    text: "다음 이차함수 $y=-x^2+4x-1$의 최댓값을 구하시오.",
    choices: ["1", "2", "3", "4", "5"],
    answer: "3",
    solution: "꼭짓점의 x좌표는 2이고, y=3이므로 최댓값은 3이다.",
    difficulty: "중",
    tags: ["고1", "이차함수"],
  },
  {
    id: "sample-2",
    number: 2,
    text: "수열 $a_n=3n-2$에 대하여 $a_{10}$의 값을 구하시오.",
    answer: "28",
    solution: "a_10 = 3\\times10 - 2 = 28",
    difficulty: "하",
    tags: ["수열"],
  },
  {
    id: "sample-3",
    number: 3,
    text: "함수 $f(x)=x^2-2x$에 대하여 $f(3)-f(1)$을 구하시오.",
    answer: "4",
    solution: "f(3)=3, f(1)=-1이므로 차는 4이다.",
    difficulty: "중",
    tags: ["함수"],
  },
  {
    id: "sample-4",
    number: 4,
    text: "원 $x^2+y^2=25$ 위의 점 $(3,4)$에서의 접선의 방정식을 구하시오.",
    answer: "3x+4y=25",
    solution: "원 $x^2+y^2=r^2$ 위 점 $(x_1,y_1)$에서의 접선은 $xx_1+yy_1=r^2$이다.",
    difficulty: "상",
    tags: ["도형", "접선"],
  },
];
