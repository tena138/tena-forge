"use client";

import type { CSSProperties, ReactNode } from "react";

import { MathText } from "@/components/math-text";
import type { ProblemMathModel, ProblemVisualSchema } from "@/lib/api";

type Viewport = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xStep: number;
  yStep: number;
};

type ShapeViewport = {
  width: number;
  height: number;
};

type VisualObject = Record<string, unknown>;
type VisualCell = string | Record<string, unknown>;

const DEFAULT_GRAPH_VIEWPORT: Viewport = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, xStep: 1, yStep: 1 };
const DEFAULT_SHAPE_VIEWPORT: ShapeViewport = { width: 100, height: 100 };
const STRUCTURED_VISUAL_CONFIDENCE_THRESHOLD = 0.82;
const GRAPH_WIDTH = 420;
const GRAPH_HEIGHT = 300;
const GRAPH_MARGIN = 30;
const SHAPE_MARGIN = 20;
const FUNCTIONS: Record<string, (value: number) => number> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  cos: Math.cos,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
};

function numberValue(value: unknown, fallback?: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function viewportFromSchema(schema: ProblemVisualSchema): Viewport {
  const source = schema.viewport || {};
  const viewport = {
    xMin: numberValue(source.xMin, DEFAULT_GRAPH_VIEWPORT.xMin)!,
    xMax: numberValue(source.xMax, DEFAULT_GRAPH_VIEWPORT.xMax)!,
    yMin: numberValue(source.yMin, DEFAULT_GRAPH_VIEWPORT.yMin)!,
    yMax: numberValue(source.yMax, DEFAULT_GRAPH_VIEWPORT.yMax)!,
    xStep: numberValue(source.xStep, DEFAULT_GRAPH_VIEWPORT.xStep)!,
    yStep: numberValue(source.yStep, DEFAULT_GRAPH_VIEWPORT.yStep)!,
  };
  if (viewport.xMax <= viewport.xMin) {
    viewport.xMin = DEFAULT_GRAPH_VIEWPORT.xMin;
    viewport.xMax = DEFAULT_GRAPH_VIEWPORT.xMax;
  }
  if (viewport.yMax <= viewport.yMin) {
    viewport.yMin = DEFAULT_GRAPH_VIEWPORT.yMin;
    viewport.yMax = DEFAULT_GRAPH_VIEWPORT.yMax;
  }
  if (viewport.xStep <= 0) viewport.xStep = DEFAULT_GRAPH_VIEWPORT.xStep;
  if (viewport.yStep <= 0) viewport.yStep = DEFAULT_GRAPH_VIEWPORT.yStep;
  return viewport;
}

function shapeViewportFromSchema(schema: ProblemVisualSchema): ShapeViewport {
  const source = schema.viewport || {};
  return {
    width: Math.max(1, numberValue((source as Record<string, unknown>).width, DEFAULT_SHAPE_VIEWPORT.width)!),
    height: Math.max(1, numberValue((source as Record<string, unknown>).height, DEFAULT_SHAPE_VIEWPORT.height)!),
  };
}

function toGraphPoint(x: number, y: number, viewport: Viewport) {
  const plotWidth = GRAPH_WIDTH - GRAPH_MARGIN * 2;
  const plotHeight = GRAPH_HEIGHT - GRAPH_MARGIN * 2;
  return {
    x: GRAPH_MARGIN + ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * plotWidth,
    y: GRAPH_MARGIN + ((viewport.yMax - y) / (viewport.yMax - viewport.yMin)) * plotHeight,
  };
}

function toShapePoint(x: number, y: number, viewport: ShapeViewport) {
  const plotWidth = GRAPH_WIDTH - SHAPE_MARGIN * 2;
  const plotHeight = GRAPH_HEIGHT - SHAPE_MARGIN * 2;
  return {
    x: SHAPE_MARGIN + (x / viewport.width) * plotWidth,
    y: SHAPE_MARGIN + (y / viewport.height) * plotHeight,
  };
}

function shapeScale(viewport: ShapeViewport) {
  return Math.min((GRAPH_WIDTH - SHAPE_MARGIN * 2) / viewport.width, (GRAPH_HEIGHT - SHAPE_MARGIN * 2) / viewport.height);
}

function normalizeExpression(expression: string) {
  let value = expression.trim().replace(/^\$+|\$+$/g, "");
  value = value.replace(/^[A-Za-z]\s*\(\s*x\s*\)\s*=/, "");
  value = value.replace(/^y\s*=/i, "");
  value = value.replaceAll("−", "-").replaceAll("π", "pi");
  value = value.replaceAll("\\left", "").replaceAll("\\right", "");
  let previous = "";
  const fracPattern = /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g;
  while (previous !== value) {
    previous = value;
    value = value.replace(fracPattern, "(($1)/($2))");
  }
  value = value
    .replaceAll("\\sqrt", "sqrt")
    .replaceAll("\\sin", "sin")
    .replaceAll("\\cos", "cos")
    .replaceAll("\\tan", "tan")
    .replaceAll("\\log", "log")
    .replaceAll("\\ln", "ln")
    .replaceAll("\\pi", "pi")
    .replaceAll("{", "(")
    .replaceAll("}", ")");
  value = value.replace(/(\d)(x|\()/g, "$1*$2");
  value = value.replace(/(x|\))(\d|x|\()/g, "$1*$2");
  return value;
}

class ExpressionParser {
  private index = 0;
  private readonly source: string;

  constructor(expression: string, private readonly x: number) {
    this.source = normalizeExpression(expression);
  }

  parse() {
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.index < this.source.length) throw new Error("Unexpected token");
    if (!Number.isFinite(value)) throw new Error("Non-finite value");
    return value;
  }

  private skipSpaces() {
    while (/\s/.test(this.source[this.index] || "")) this.index += 1;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      const op = this.source[this.index];
      if (op !== "+" && op !== "-") return value;
      this.index += 1;
      const right = this.parseTerm();
      value = op === "+" ? value + right : value - right;
    }
  }

  private parseTerm(): number {
    let value = this.parsePower();
    while (true) {
      this.skipSpaces();
      const op = this.source[this.index];
      if (op !== "*" && op !== "/") return value;
      this.index += 1;
      const right = this.parsePower();
      value = op === "*" ? value * right : value / right;
    }
  }

  private parsePower(): number {
    let value = this.parseUnary();
    this.skipSpaces();
    if (this.source[this.index] === "^") {
      this.index += 1;
      value = Math.pow(value, this.parsePower());
    }
    return value;
  }

  private parseUnary(): number {
    this.skipSpaces();
    const op = this.source[this.index];
    if (op === "+" || op === "-") {
      this.index += 1;
      const value = this.parseUnary();
      return op === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipSpaces();
    const char = this.source[this.index];
    if (char === "(") {
      this.index += 1;
      const value = this.parseExpression();
      this.skipSpaces();
      if (this.source[this.index] !== ")") throw new Error("Missing closing parenthesis");
      this.index += 1;
      return value;
    }
    if (/[0-9.]/.test(char || "")) return this.parseNumber();
    if (/[A-Za-z_]/.test(char || "")) return this.parseIdentifier();
    throw new Error("Unexpected primary");
  }

  private parseNumber() {
    const start = this.index;
    while (/[0-9.]/.test(this.source[this.index] || "")) this.index += 1;
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  }

  private parseIdentifier() {
    const start = this.index;
    while (/[A-Za-z0-9_]/.test(this.source[this.index] || "")) this.index += 1;
    const name = this.source.slice(start, this.index);
    if (name === "x") return this.x;
    if (name === "pi") return Math.PI;
    if (name === "e") return Math.E;
    const fn = FUNCTIONS[name];
    if (!fn) throw new Error("Unsupported identifier");
    this.skipSpaces();
    if (this.source[this.index] !== "(") throw new Error("Function requires parentheses");
    this.index += 1;
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.source[this.index] !== ")") throw new Error("Missing function parenthesis");
    this.index += 1;
    return fn(value);
  }
}

function evalExpression(expression: string, x: number) {
  return new ExpressionParser(expression, x).parse();
}

function resolveExpression(object: VisualObject, mathModel?: ProblemMathModel | null) {
  const direct = textValue(object.expr);
  if (direct) return direct;
  const ref = textValue(object.ref);
  if (!ref || !mathModel?.expressions) return "";
  const key = ref.replace(/^expressions\./, "");
  return mathModel.expressions[ref] || mathModel.expressions[key] || "";
}

function sampleFunctionPath(object: VisualObject, viewport: Viewport, mathModel?: ProblemMathModel | null) {
  const expression = resolveExpression(object, mathModel);
  if (!expression) return "";
  const domainSource = Array.isArray(object.domain) ? object.domain : [];
  const domainMin = numberValue(domainSource[0], viewport.xMin)!;
  const domainMax = numberValue(domainSource[1], viewport.xMax)!;
  const left = Math.max(viewport.xMin, domainMin);
  const right = Math.min(viewport.xMax, domainMax);
  if (right <= left) return "";
  const commands: string[] = [];
  let open = false;
  for (let index = 0; index <= 180; index += 1) {
    const x = left + ((right - left) * index) / 180;
    try {
      const y = evalExpression(expression, x);
      if (!Number.isFinite(y) || y < viewport.yMin - 100 || y > viewport.yMax + 100) {
        open = false;
        continue;
      }
      const point = toGraphPoint(x, y, viewport);
      commands.push(`${open ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`);
      open = true;
    } catch {
      open = false;
    }
  }
  return commands.join(" ");
}

function axisLines(viewport: Viewport, axes: Record<string, boolean>) {
  const lines = [];
  if (axes.grid !== false) {
    for (let x = Math.ceil(viewport.xMin / viewport.xStep) * viewport.xStep; x <= viewport.xMax; x += viewport.xStep) {
      const point = toGraphPoint(x, 0, viewport);
      lines.push(<line key={`gx-${x}`} x1={point.x} y1={GRAPH_MARGIN} x2={point.x} y2={GRAPH_HEIGHT - GRAPH_MARGIN} stroke="#e4e4e7" strokeWidth="1" />);
    }
    for (let y = Math.ceil(viewport.yMin / viewport.yStep) * viewport.yStep; y <= viewport.yMax; y += viewport.yStep) {
      const point = toGraphPoint(0, y, viewport);
      lines.push(<line key={`gy-${y}`} x1={GRAPH_MARGIN} y1={point.y} x2={GRAPH_WIDTH - GRAPH_MARGIN} y2={point.y} stroke="#e4e4e7" strokeWidth="1" />);
    }
  }
  if (axes.x !== false && viewport.yMin <= 0 && viewport.yMax >= 0) {
    const point = toGraphPoint(0, 0, viewport);
    lines.push(<line key="axis-x" x1={GRAPH_MARGIN} y1={point.y} x2={GRAPH_WIDTH - GRAPH_MARGIN} y2={point.y} stroke="#18181b" strokeWidth="1.5" />);
  }
  if (axes.y !== false && viewport.xMin <= 0 && viewport.xMax >= 0) {
    const point = toGraphPoint(0, 0, viewport);
    lines.push(<line key="axis-y" x1={point.x} y1={GRAPH_MARGIN} x2={point.x} y2={GRAPH_HEIGHT - GRAPH_MARGIN} stroke="#18181b" strokeWidth="1.5" />);
  }
  return lines;
}

function objectStroke(object: VisualObject) {
  return textValue(object.stroke) || "#111827";
}

function objectFill(object: VisualObject, fallback = "none") {
  return textValue(object.fill) || fallback;
}

function objectStrokeWidth(object: VisualObject) {
  return numberValue(object.strokeWidth, 2)!;
}

function commonSvgProps(object: VisualObject) {
  return {
    stroke: objectStroke(object),
    fill: objectFill(object),
    strokeWidth: objectStrokeWidth(object),
    opacity: numberValue(object.opacity),
    strokeDasharray: object.dash ? "5 4" : undefined,
  };
}

function renderGraphObject(object: VisualObject, index: number, viewport: Viewport, mathModel?: ProblemMathModel | null) {
  const kind = textValue(object.kind);
  const stroke = objectStroke(object);
  const strokeWidth = objectStrokeWidth(object);
  if (kind === "function") {
    const path = sampleFunctionPath(object, viewport, mathModel);
    return path ? <path key={index} d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /> : null;
  }
  if (kind === "segment" || kind === "line") {
    const x1 = numberValue(object.x1);
    const y1 = numberValue(object.y1);
    const x2 = numberValue(object.x2);
    const y2 = numberValue(object.y2);
    if ([x1, y1, x2, y2].some((value) => value === undefined)) return null;
    const a = toGraphPoint(x1!, y1!, viewport);
    const b = toGraphPoint(x2!, y2!, viewport);
    return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />;
  }
  if (kind === "polyline" && Array.isArray(object.points)) {
    const points = pointsAttribute(object.points, (x, y) => toGraphPoint(x, y, viewport));
    return points ? <polyline key={index} points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /> : null;
  }
  if (kind === "vertical_line") {
    const x = numberValue(object.x);
    if (x === undefined) return null;
    const top = toGraphPoint(x, viewport.yMax, viewport);
    const bottom = toGraphPoint(x, viewport.yMin, viewport);
    return <line key={index} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (kind === "horizontal_line") {
    const y = numberValue(object.y);
    if (y === undefined) return null;
    const left = toGraphPoint(viewport.xMin, y, viewport);
    const right = toGraphPoint(viewport.xMax, y, viewport);
    return <line key={index} x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (kind === "point") return renderPoint(object, index, (x, y) => toGraphPoint(x, y, viewport));
  if (kind === "label") return renderLabel(object, index, (x, y) => toGraphPoint(x, y, viewport));
  return null;
}

function pointsAttribute(pointsSource: unknown, mapper: (x: number, y: number) => { x: number; y: number }) {
  if (!Array.isArray(pointsSource)) return "";
  const points = pointsSource
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const x = numberValue((point as VisualObject).x);
      const y = numberValue((point as VisualObject).y);
      return x === undefined || y === undefined ? null : mapper(x, y);
    })
    .filter(Boolean) as Array<{ x: number; y: number }>;
  return points.length >= 2 ? points.map((point) => `${point.x},${point.y}`).join(" ") : "";
}

function renderPoint(object: VisualObject, index: number, mapper: (x: number, y: number) => { x: number; y: number }) {
  const x = numberValue(object.x);
  const y = numberValue(object.y);
  if (x === undefined || y === undefined) return null;
  const point = mapper(x, y);
  const label = textValue(object.label);
  return (
    <g key={index}>
      <circle cx={point.x} cy={point.y} r={numberValue(object.radius, 3.5)} fill={objectFill(object, objectStroke(object))} />
      {label ? <text x={point.x + 7} y={point.y - 7} fontSize="13" fontWeight="700" fill="#111827">{label}</text> : null}
    </g>
  );
}

function renderLabel(object: VisualObject, index: number, mapper: (x: number, y: number) => { x: number; y: number }) {
  const x = numberValue(object.x);
  const y = numberValue(object.y);
  const text = textValue(object.text) || textValue(object.label);
  if (x === undefined || y === undefined || !text) return null;
  const point = mapper(x, y);
  return <text key={index} x={point.x} y={point.y} fontSize="13" fontWeight="700" fill="#111827">{text}</text>;
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, viewport: ShapeViewport) {
  const scale = shapeScale(viewport);
  const start = (startAngle * Math.PI) / 180;
  const end = (endAngle * Math.PI) / 180;
  const a = toShapePoint(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius, viewport);
  const b = toShapePoint(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, viewport);
  const largeArc = Math.abs(endAngle - startAngle) % 360 > 180 ? 1 : 0;
  const sweep = endAngle >= startAngle ? 1 : 0;
  return `M${a.x},${a.y} A${radius * scale},${radius * scale} 0 ${largeArc} ${sweep} ${b.x},${b.y}`;
}

function anglePath(object: VisualObject, viewport: ShapeViewport) {
  const vertex = object.vertex as VisualObject | undefined;
  const p1 = object.p1 as VisualObject | undefined;
  const p2 = object.p2 as VisualObject | undefined;
  if (!vertex || !p1 || !p2) return "";
  const vx = numberValue(vertex.x);
  const vy = numberValue(vertex.y);
  const x1 = numberValue(p1.x);
  const y1 = numberValue(p1.y);
  const x2 = numberValue(p2.x);
  const y2 = numberValue(p2.y);
  if ([vx, vy, x1, y1, x2, y2].some((value) => value === undefined)) return "";
  const a1 = (Math.atan2(y1! - vy!, x1! - vx!) * 180) / Math.PI;
  const a2 = (Math.atan2(y2! - vy!, x2! - vx!) * 180) / Math.PI;
  return arcPath(vx!, vy!, numberValue(object.radius, 10)!, a1, a2, viewport);
}

function renderShapeObject(object: VisualObject, index: number, viewport: ShapeViewport) {
  const kind = textValue(object.kind);
  const props = commonSvgProps(object);
  if (kind === "segment" || kind === "line") {
    const x1 = numberValue(object.x1);
    const y1 = numberValue(object.y1);
    const x2 = numberValue(object.x2);
    const y2 = numberValue(object.y2);
    if ([x1, y1, x2, y2].some((value) => value === undefined)) return null;
    const a = toShapePoint(x1!, y1!, viewport);
    const b = toShapePoint(x2!, y2!, viewport);
    return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...props} strokeLinecap="round" />;
  }
  if ((kind === "polyline" || kind === "polygon") && Array.isArray(object.points)) {
    const points = pointsAttribute(object.points, (x, y) => toShapePoint(x, y, viewport));
    if (!points) return null;
    const shapeProps = { ...props, fill: kind === "polygon" ? objectFill(object, "#f8fafc") : "none" };
    return kind === "polygon" ? (
      <polygon key={index} points={points} {...shapeProps} strokeLinejoin="round" />
    ) : (
      <polyline key={index} points={points} {...shapeProps} strokeLinecap="round" strokeLinejoin="round" />
    );
  }
  if (kind === "circle") {
    const cx = numberValue(object.cx);
    const cy = numberValue(object.cy);
    const r = numberValue(object.r);
    if (cx === undefined || cy === undefined || r === undefined) return null;
    const center = toShapePoint(cx, cy, viewport);
    return <circle key={index} cx={center.x} cy={center.y} r={r * shapeScale(viewport)} {...props} />;
  }
  if (kind === "ellipse") {
    const cx = numberValue(object.cx);
    const cy = numberValue(object.cy);
    const rx = numberValue(object.rx);
    const ry = numberValue(object.ry);
    if ([cx, cy, rx, ry].some((value) => value === undefined)) return null;
    const center = toShapePoint(cx!, cy!, viewport);
    const scale = shapeScale(viewport);
    return <ellipse key={index} cx={center.x} cy={center.y} rx={rx! * scale} ry={ry! * scale} {...props} />;
  }
  if (kind === "rect") {
    const x = numberValue(object.x);
    const y = numberValue(object.y);
    const width = numberValue(object.width);
    const height = numberValue(object.height);
    if ([x, y, width, height].some((value) => value === undefined)) return null;
    const point = toShapePoint(x!, y!, viewport);
    const scale = shapeScale(viewport);
    return <rect key={index} x={point.x} y={point.y} width={width! * scale} height={height! * scale} rx={numberValue(object.radius, 0)! * scale} {...props} fill={objectFill(object, "#fff")} />;
  }
  if (kind === "arc") {
    const cx = numberValue(object.cx);
    const cy = numberValue(object.cy);
    const r = numberValue(object.r);
    const startAngle = numberValue(object.startAngle);
    const endAngle = numberValue(object.endAngle);
    if ([cx, cy, r, startAngle, endAngle].some((value) => value === undefined)) return null;
    return <path key={index} d={arcPath(cx!, cy!, r!, startAngle!, endAngle!, viewport)} {...props} fill="none" strokeLinecap="round" />;
  }
  if (kind === "angle") {
    const path = anglePath(object, viewport);
    return path ? <path key={index} d={path} {...props} fill="none" strokeLinecap="round" /> : null;
  }
  if (kind === "point") return renderPoint(object, index, (x, y) => toShapePoint(x, y, viewport));
  if (kind === "label") return renderLabel(object, index, (x, y) => toShapePoint(x, y, viewport));
  return null;
}

function renderCartesianGraph(schema: ProblemVisualSchema, mathModel?: ProblemMathModel | null, className?: string, style?: CSSProperties) {
  const viewport = viewportFromSchema(schema);
  const axes = schema.axes || {};
  const objects = [...(schema.objects || []), ...(schema.labels || []).map((label) => ({ kind: "label", ...label }))];
  return (
    <svg className={className} style={style} viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label="Problem graph" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} rx="10" fill="#fff" />
      {axisLines(viewport, axes)}
      {objects.map((object, index) => renderGraphObject(object, index, viewport, mathModel))}
    </svg>
  );
}

function renderShapeDiagram(schema: ProblemVisualSchema, className?: string, style?: CSSProperties) {
  const viewport = shapeViewportFromSchema(schema);
  const content = (
    <svg className={schema.caption ? undefined : className} style={schema.caption ? undefined : style} viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label="Problem diagram" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} rx="10" fill="#fff" />
      {(schema.objects || []).map((object, index) => renderShapeObject(object, index, viewport))}
    </svg>
  );
  if (!schema.caption) return content;
  return (
    <figure className={className} style={style}>
      {content}
      <figcaption className="mt-1 text-center text-xs font-semibold text-zinc-500">{schema.caption}</figcaption>
    </figure>
  );
}

function cellText(cell: VisualCell) {
  return typeof cell === "object" && cell ? textValue(cell.text) : String(cell ?? "");
}

function cellProps(cell: VisualCell, rowIndex: number, colIndex: number, headerRows: number, headerCols: number) {
  const object = typeof cell === "object" && cell ? (cell as VisualObject) : {};
  return {
    header: Boolean(object.header) || rowIndex < headerRows || colIndex < headerCols,
    colSpan: Math.max(1, Math.min(12, numberValue(object.colSpan, 1)!)),
    rowSpan: Math.max(1, Math.min(12, numberValue(object.rowSpan, 1)!)),
    align: textValue(object.align),
  };
}

function renderStructuredTable(schema: ProblemVisualSchema, className?: string, style?: CSSProperties) {
  const rows = Array.isArray(schema.rows) ? schema.rows : [];
  const headerRows = Math.max(0, numberValue(schema.headerRows, 0)!);
  const headerCols = Math.max(0, numberValue(schema.headerCols, 0)!);
  return (
    <div className={className} style={style}>
      <table className="mx-auto mt-2 w-full max-w-[520px] border-collapse bg-white text-sm text-zinc-950">
        {schema.caption ? <caption className="mb-2 text-xs font-bold text-zinc-500">{schema.caption}</caption> : null}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, colIndex) => {
                const props = cellProps(cell, rowIndex, colIndex, headerRows, headerCols);
                const Tag = props.header ? "th" : "td";
                return (
                  <Tag
                    key={`${rowIndex}-${colIndex}`}
                    colSpan={props.colSpan}
                    rowSpan={props.rowSpan}
                    className={`border border-zinc-300 px-3 py-2 ${props.header ? "bg-zinc-100 font-bold" : "font-medium"}`}
                    style={{ textAlign: props.align === "left" || props.align === "right" || props.align === "center" ? props.align : "center" }}
                  >
                    <MathText value={cellText(cell)} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function canRenderProblemVisual(schema?: ProblemVisualSchema | null) {
  if (!schema) return false;
  if (schema.type === "cartesian_graph") return Boolean((schema.objects?.length || 0) > 0 || (schema.labels?.length || 0) > 0);
  if (schema.type === "shape_diagram") return Boolean((schema.objects?.length || 0) > 0);
  if (schema.type === "structured_table") return Boolean((schema.rows?.length || 0) > 0);
  return false;
}

export function problemVisualSchemaConfidence(schema?: ProblemVisualSchema | null) {
  const confidence = Number(schema?.confidence);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0;
}

export function shouldPreferProblemVisualSchema(schema?: ProblemVisualSchema | null, hasImageFallback = false) {
  if (!canRenderProblemVisual(schema)) return false;
  if (!hasImageFallback) return true;
  return problemVisualSchemaConfidence(schema) >= STRUCTURED_VISUAL_CONFIDENCE_THRESHOLD;
}

export function ProblemVisualRenderer({
  schema,
  mathModel,
  className,
  style,
}: {
  schema?: ProblemVisualSchema | null;
  mathModel?: ProblemMathModel | null;
  className?: string;
  style?: CSSProperties;
}) {
  if (!canRenderProblemVisual(schema)) return null;
  const renderers: Record<ProblemVisualSchema["type"], () => ReactNode> = {
    cartesian_graph: () => renderCartesianGraph(schema!, mathModel, className, style),
    shape_diagram: () => renderShapeDiagram(schema!, className, style),
    structured_table: () => renderStructuredTable(schema!, className, style),
  };
  return <>{renderers[schema!.type]()}</>;
}
