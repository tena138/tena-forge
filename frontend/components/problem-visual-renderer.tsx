"use client";

import type { CSSProperties } from "react";

import type { ProblemMathModel, ProblemVisualSchema } from "@/lib/api";

type Viewport = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xStep: number;
  yStep: number;
};

type GraphObject = Record<string, unknown>;

const DEFAULT_VIEWPORT: Viewport = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, xStep: 1, yStep: 1 };
const GRAPH_WIDTH = 420;
const GRAPH_HEIGHT = 300;
const MARGIN = 30;
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
    xMin: numberValue(source.xMin, DEFAULT_VIEWPORT.xMin)!,
    xMax: numberValue(source.xMax, DEFAULT_VIEWPORT.xMax)!,
    yMin: numberValue(source.yMin, DEFAULT_VIEWPORT.yMin)!,
    yMax: numberValue(source.yMax, DEFAULT_VIEWPORT.yMax)!,
    xStep: numberValue(source.xStep, DEFAULT_VIEWPORT.xStep)!,
    yStep: numberValue(source.yStep, DEFAULT_VIEWPORT.yStep)!,
  };
  if (viewport.xMax <= viewport.xMin) {
    viewport.xMin = DEFAULT_VIEWPORT.xMin;
    viewport.xMax = DEFAULT_VIEWPORT.xMax;
  }
  if (viewport.yMax <= viewport.yMin) {
    viewport.yMin = DEFAULT_VIEWPORT.yMin;
    viewport.yMax = DEFAULT_VIEWPORT.yMax;
  }
  if (viewport.xStep <= 0) viewport.xStep = DEFAULT_VIEWPORT.xStep;
  if (viewport.yStep <= 0) viewport.yStep = DEFAULT_VIEWPORT.yStep;
  return viewport;
}

function toSvgPoint(x: number, y: number, viewport: Viewport) {
  const plotWidth = GRAPH_WIDTH - MARGIN * 2;
  const plotHeight = GRAPH_HEIGHT - MARGIN * 2;
  return {
    x: MARGIN + ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * plotWidth,
    y: MARGIN + ((viewport.yMax - y) / (viewport.yMax - viewport.yMin)) * plotHeight,
  };
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

function resolveExpression(object: GraphObject, mathModel?: ProblemMathModel | null) {
  const direct = textValue(object.expr);
  if (direct) return direct;
  const ref = textValue(object.ref);
  if (!ref || !mathModel?.expressions) return "";
  const key = ref.replace(/^expressions\./, "");
  return mathModel.expressions[ref] || mathModel.expressions[key] || "";
}

function sampleFunctionPath(object: GraphObject, viewport: Viewport, mathModel?: ProblemMathModel | null) {
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
      const point = toSvgPoint(x, y, viewport);
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
      const point = toSvgPoint(x, 0, viewport);
      lines.push(<line key={`gx-${x}`} x1={point.x} y1={MARGIN} x2={point.x} y2={GRAPH_HEIGHT - MARGIN} stroke="#e4e4e7" strokeWidth="1" />);
    }
    for (let y = Math.ceil(viewport.yMin / viewport.yStep) * viewport.yStep; y <= viewport.yMax; y += viewport.yStep) {
      const point = toSvgPoint(0, y, viewport);
      lines.push(<line key={`gy-${y}`} x1={MARGIN} y1={point.y} x2={GRAPH_WIDTH - MARGIN} y2={point.y} stroke="#e4e4e7" strokeWidth="1" />);
    }
  }
  if (axes.x !== false && viewport.yMin <= 0 && viewport.yMax >= 0) {
    const point = toSvgPoint(0, 0, viewport);
    lines.push(<line key="axis-x" x1={MARGIN} y1={point.y} x2={GRAPH_WIDTH - MARGIN} y2={point.y} stroke="#18181b" strokeWidth="1.5" />);
  }
  if (axes.y !== false && viewport.xMin <= 0 && viewport.xMax >= 0) {
    const point = toSvgPoint(0, 0, viewport);
    lines.push(<line key="axis-y" x1={point.x} y1={MARGIN} x2={point.x} y2={GRAPH_HEIGHT - MARGIN} stroke="#18181b" strokeWidth="1.5" />);
  }
  return lines;
}

function objectStroke(object: GraphObject) {
  return textValue(object.stroke) || "#111827";
}

function objectStrokeWidth(object: GraphObject) {
  return numberValue(object.strokeWidth, 2)!;
}

function renderObject(object: GraphObject, index: number, viewport: Viewport, mathModel?: ProblemMathModel | null) {
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
    const a = toSvgPoint(x1!, y1!, viewport);
    const b = toSvgPoint(x2!, y2!, viewport);
    return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />;
  }
  if (kind === "polyline" && Array.isArray(object.points)) {
    const points = object.points
      .map((point) => {
        if (!point || typeof point !== "object") return null;
        const x = numberValue((point as GraphObject).x);
        const y = numberValue((point as GraphObject).y);
        return x === undefined || y === undefined ? null : toSvgPoint(x, y, viewport);
      })
      .filter(Boolean) as Array<{ x: number; y: number }>;
    if (points.length < 2) return null;
    return <polyline key={index} points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (kind === "vertical_line") {
    const x = numberValue(object.x);
    if (x === undefined) return null;
    const top = toSvgPoint(x, viewport.yMax, viewport);
    const bottom = toSvgPoint(x, viewport.yMin, viewport);
    return <line key={index} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (kind === "horizontal_line") {
    const y = numberValue(object.y);
    if (y === undefined) return null;
    const left = toSvgPoint(viewport.xMin, y, viewport);
    const right = toSvgPoint(viewport.xMax, y, viewport);
    return <line key={index} x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (kind === "point") {
    const x = numberValue(object.x);
    const y = numberValue(object.y);
    if (x === undefined || y === undefined) return null;
    const point = toSvgPoint(x, y, viewport);
    const label = textValue(object.label);
    return (
      <g key={index}>
        <circle cx={point.x} cy={point.y} r={numberValue(object.radius, 3.5)} fill={textValue(object.fill) || stroke} />
        {label ? <text x={point.x + 7} y={point.y - 7} fontSize="13" fontWeight="700" fill="#111827">{label}</text> : null}
      </g>
    );
  }
  if (kind === "label") {
    const x = numberValue(object.x);
    const y = numberValue(object.y);
    const text = textValue(object.text) || textValue(object.label);
    if (x === undefined || y === undefined || !text) return null;
    const point = toSvgPoint(x, y, viewport);
    return <text key={index} x={point.x} y={point.y} fontSize="13" fontWeight="700" fill="#111827">{text}</text>;
  }
  return null;
}

export function canRenderProblemVisual(schema?: ProblemVisualSchema | null) {
  return Boolean(schema && schema.type === "cartesian_graph" && ((schema.objects?.length || 0) > 0 || (schema.labels?.length || 0) > 0));
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
  const viewport = viewportFromSchema(schema!);
  const axes = schema!.axes || {};
  const objects = [...(schema!.objects || []), ...(schema!.labels || []).map((label) => ({ kind: "label", ...label }))];
  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      role="img"
      aria-label="문항 그래프"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="0" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} rx="10" fill="#fff" />
      {axisLines(viewport, axes)}
      {objects.map((object, index) => renderObject(object, index, viewport, mathModel))}
    </svg>
  );
}
