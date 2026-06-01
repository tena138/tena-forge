import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
const moduleCache = new Map();
let idCounter = 0;

function compileModule(filePath) {
  const resolved = path.resolve(filePath);
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports;

  const source = fs.readFileSync(resolved, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const dirname = path.dirname(resolved);
  const localRequire = (specifier) => {
    if (specifier === "nanoid") return { nanoid: () => `verify-id-${++idCounter}` };
    if (specifier.startsWith("@/")) return compileModule(path.resolve("frontend", `${specifier.slice(2)}.ts`));
    if (specifier.startsWith(".")) return compileModule(path.resolve(dirname, specifier.endsWith(".ts") ? specifier : `${specifier}.ts`));
    return require(specifier);
  };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: localRequire,
    console,
    DOMParser: dom.window.DOMParser,
    XMLSerializer: dom.window.XMLSerializer,
    document: dom.window.document,
    Image: dom.window.Image,
  });
  vm.runInContext(compiled.outputText, context, { filename: resolved });
  return module.exports;
}

function clipboardData(html, plain = "", rtf = "") {
  return {
    getData(type) {
      if (type === "text/html") return html;
      if (type === "text/plain") return plain;
      if (type === "text/rtf") return rtf;
      return "";
    },
  };
}

function css(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderElement(element) {
  const style = element.style || {};
  const base = [
    "position:absolute",
    `left:${element.x}px`,
    `top:${element.y}px`,
    `width:${element.width}px`,
    `height:${element.height}px`,
    `z-index:${element.zIndex}`,
    `background:${css(style.fill, "transparent")}`,
    `border:${style.strokeWidth ? `${style.strokeWidth}px ${style.borderStyle || "solid"} ${style.stroke || "#d8dee9"}` : "none"}`,
    `border-radius:${style.radius || 0}px`,
    `color:${css(style.color, "#111827")}`,
    `font-family:${css(style.fontFamily, "Pretendard, Arial, sans-serif")}`,
    `font-size:${css(style.fontSize, 14)}px`,
    `font-weight:${style.fontWeight === "bold" ? 700 : 400}`,
    `text-align:${css(style.textAlign, "left")}`,
    `line-height:${css(style.lineHeight, 1.35)}`,
    "box-sizing:border-box",
    "overflow:hidden",
  ].join(";");
  if (element.type === "shape") return `<div class="element shape" style="${base}"></div>`;
  if (element.type === "text") {
    return `<div class="element text" data-fit-text="1" data-base-font="${css(style.fontSize, 14)}" style="${base};background:transparent;border:none;padding:2px 4px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:break-word">${escapeHtml(element.text)}</div>`;
  }
  return "";
}

function edgePath() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const { PAGE_SIZES } = compileModule("frontend/lib/visualTemplateTypes.ts");
const { createClipboardEditableElements } = compileModule("frontend/lib/powerpointClipboard.ts");

const sampleHtml = `<!--StartFragment-->
  <style>
    .leftBand { background: #93a2af; border: .75pt solid #7d7d7d; color: #000000; font-size: 12pt; text-align: center; vertical-align: middle; }
    .grayCell { background: #b7b7b7; border: .75pt solid #7d7d7d; color: #000000; font-size: 12pt; text-align: center; vertical-align: middle; }
    .bodyCell { background: #b7b7b7; border: .75pt solid #7d7d7d; color: #000000; font-size: 12pt; text-align: left; vertical-align: middle; }
  </style>
  <table style="position:absolute;left:0pt;top:0pt;width:594pt;height:270pt;border-collapse:collapse">
    <tr style="height:26pt">
      <td class="leftBand" rowspan="4" style="width:84pt">학습태도<br>관리평가</td>
      <td class="grayCell" style="width:172pt">집중도</td>
      <td class="grayCell" style="width:338pt">높음□  보통□  낮음□</td>
    </tr>
    <tr style="height:26pt">
      <td class="grayCell">시간관리</td>
      <td class="grayCell">우수□  보통□  부족□</td>
    </tr>
    <tr style="height:26pt">
      <td class="grayCell">과제이행</td>
      <td class="grayCell">충실□  보통□  미흡□</td>
    </tr>
    <tr style="height:32pt">
      <td class="grayCell">이번주 학습성취도</td>
      <td class="grayCell">☆☆☆☆☆</td>
    </tr>
    <tr style="height:100pt">
      <td class="leftBand" rowspan="2">멘토<br>종합의견</td>
      <td class="grayCell">개선 포인트</td>
      <td class="bodyCell">5월 더프를 아직 채점하지 않았고, 시험지도 집에 있어 구체적인 피드백이 불가능했음.<br><br>시험지 3번 문항은 이전 수업에서 다룬 문항이었으나 다시 해결하지 못했음. 현재 복습이 충분히 이루어지고 있지 않은 것으로 보임.</td>
    </tr>
    <tr style="height:60pt">
      <td class="grayCell">다음주 관리계획</td>
      <td class="bodyCell">별도 과제 없음. 수요일에는 미니모의고사 형식의 시험을 볼 예정임.</td>
    </tr>
  </table>
  <img src="data:image/png;base64,iVBORw0KGgo=" width="794" height="360" alt="PowerPoint fallback image">
<!--EndFragment-->`;

const page = {
  id: "page-1",
  name: "A4",
  role: "custom",
  pageSize: PAGE_SIZES.A4_LANDSCAPE,
  safeArea: { x: 48, y: 48, width: PAGE_SIZES.A4_LANDSCAPE.width - 96, height: PAGE_SIZES.A4_LANDSCAPE.height - 96 },
  elements: [],
};

const { elements } = await createClipboardEditableElements(clipboardData(sampleHtml), page, 32, 32, 0);
const outDir = path.resolve("frontend/tmp/paste-verification");
fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, "powerpoint-table-paste.html");
const pngPath = path.join(outDir, "powerpoint-table-paste.png");
const jsonPath = path.join(outDir, "powerpoint-table-paste.json");

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: #f8fafc; font-family: Pretendard, Arial, sans-serif; }
    .page { position: relative; width: 940px; height: 520px; margin: 24px; background: white; box-shadow: 0 12px 40px rgba(15,23,42,.16); overflow: hidden; }
    .label { position: absolute; left: 24px; top: 8px; color: #475569; font: 12px/1.4 Arial, sans-serif; }
    .text.overflow { outline: 2px solid #ef4444; background: rgba(239,68,68,.12) !important; }
  </style>
</head>
<body>
  <div class="page">
    <div class="label">PowerPoint paste verification: editable cells, class colors, no text overflow</div>
    ${elements.map(renderElement).join("\n")}
  </div>
  <script>
    function fitText(node) {
      const base = Number(node.dataset.baseFont || 14);
      let low = Math.min(base, Math.max(6, base * 0.72));
      let high = base;
      let best = low;
      const fits = (size) => {
        node.style.fontSize = size + "px";
        return node.scrollWidth <= node.clientWidth + 0.5 && node.scrollHeight <= node.clientHeight + 0.5;
      };
      if (fits(base)) return;
      for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        if (fits(mid)) { best = mid; low = mid; } else { high = mid; }
      }
      node.style.fontSize = Math.floor(best * 10) / 10 + "px";
      if (!fits(Number.parseFloat(node.style.fontSize))) node.classList.add("overflow");
    }
    document.querySelectorAll("[data-fit-text]").forEach(fitText);
    document.body.dataset.overflowCount = String(document.querySelectorAll(".text.overflow").length);
  </script>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf8");
fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      counts: {
        elements: elements.length,
        shapes: elements.filter((element) => element.type === "shape").length,
        texts: elements.filter((element) => element.type === "text").length,
        images: elements.filter((element) => element.type === "image").length,
      },
      htmlPath,
      pngPath,
    },
    null,
    2
  ),
  "utf8"
);

const browser = edgePath();
if (!browser) {
  console.log(JSON.stringify({ htmlPath, pngPath: null, browser: null }, null, 2));
  process.exit(0);
}

const result = spawnSync(browser, [`--headless=new`, `--disable-gpu`, `--window-size=1000,600`, `--screenshot=${pngPath}`, `file:///${htmlPath.replace(/\\/g, "/")}`], {
  encoding: "utf8",
});
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

console.log(JSON.stringify({ htmlPath, pngPath, jsonPath, browser }, null, 2));
