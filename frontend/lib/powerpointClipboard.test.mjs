import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

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
    if (specifier === "nanoid") return { nanoid: () => `test-id-${++idCounter}` };
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

const { PAGE_SIZES } = compileModule("frontend/lib/visualTemplateTypes.ts");
const { createClipboardEditableElements } = compileModule("frontend/lib/powerpointClipboard.ts");

function clipboardData(html, plain = "") {
  const rtf = arguments[2] || "";
  return {
    getData(type) {
      if (type === "text/html") return html;
      if (type === "text/plain") return plain;
      if (type === "text/rtf") return rtf;
      return "";
    },
  };
}

const page = {
  id: "page-1",
  name: "A4",
  role: "custom",
  pageSize: PAGE_SIZES.A4_PORTRAIT,
  safeArea: { x: 48, y: 48, width: PAGE_SIZES.A4_PORTRAIT.width - 96, height: PAGE_SIZES.A4_PORTRAIT.height - 96 },
  elements: [],
};

test("PowerPoint-style complex HTML table pastes as editable cells without image fallback or double scaling", async () => {
  const html = `<!--StartFragment-->
    <table style="position:absolute;left:10pt;top:20pt;width:300pt;height:120pt;border-collapse:collapse;border:1pt solid #111827">
      <col style="width:80pt"><col style="width:140pt"><col style="width:80pt">
      <tr style="height:30pt">
        <td colspan="2" style="border:1pt solid #111827;background-color:#ddebf7;text-align:center;font-size:12pt;font-weight:bold">단원</td>
        <td style="border:1pt solid #111827;background-color:#fce4d6;text-align:center;font-size:12pt">점수</td>
      </tr>
      <tr style="height:45pt">
        <td rowspan="2" style="border:1pt solid #111827;background-color:#e2f0d9;font-size:11pt">미적분</td>
        <td style="border:1pt solid #111827;font-size:10pt">극한</td>
        <td style="border:1pt solid #111827;font-size:10pt">12</td>
      </tr>
      <tr style="height:45pt">
        <td colspan="2" style="border:1pt solid #111827;background-color:#fff2cc;font-size:10pt">복합 문항</td>
      </tr>
    </table>
    <img src="data:image/png;base64,iVBORw0KGgo=" width="800" height="320" alt="PowerPoint fallback image">
  <!--EndFragment-->`;

  const { elements } = await createClipboardEditableElements(clipboardData(html), page, 100, 120, 0);
  const images = elements.filter((element) => element.type === "image");
  const tables = elements.filter((element) => element.type === "table");
  const cells = elements.filter((element) => element.type === "shape" && element.name === "표 셀");
  const texts = elements.filter((element) => element.type === "text" && element.name === "표 셀 텍스트");

  assert.equal(images.length, 0);
  assert.equal(tables.length, 0);
  assert.equal(cells.length, 6);
  assert.equal(texts.length, 6);

  const minX = Math.min(...cells.map((element) => element.x));
  const maxX = Math.max(...cells.map((element) => element.x + element.width));
  const minY = Math.min(...cells.map((element) => element.y));
  const maxY = Math.max(...cells.map((element) => element.y + element.height));
  assert.equal(maxX - minX, 400);
  assert.equal(maxY - minY, 160);

  const headerCell = cells.find((element) => element.x === 100 && element.y === 120);
  assert.ok(headerCell);
  assert.ok(Math.abs(headerCell.width - 293) <= 1);
  assert.ok(Math.abs(headerCell.height - 40) <= 1);
});

test("PowerPoint image plus tab-separated table text still pastes as editable cells", async () => {
  const plain = ["단원\t유형\t점수", "미적분\t극한\t12", "수열\t복합 문항\t8"].join("\n");
  const { elements } = await createClipboardEditableElements(clipboardData("", plain), page, 100, 120, 0);
  const images = elements.filter((element) => element.type === "image");
  const cells = elements.filter((element) => element.type === "shape" && element.name === "표 셀");
  const texts = elements.filter((element) => element.type === "text" && element.name === "표 셀 텍스트");

  assert.equal(images.length, 0);
  assert.equal(cells.length, 9);
  assert.equal(texts.length, 9);
  assert.equal(Math.max(...cells.map((element) => element.x + element.width)) - Math.min(...cells.map((element) => element.x)), 288);
  assert.equal(Math.max(...cells.map((element) => element.y + element.height)) - Math.min(...cells.map((element) => element.y)), 96);
});

test("PowerPoint RTF table data wins over image fallback and preserves cell geometry", async () => {
  const rtf = String.raw`{\rtf1\ansi
{\trowd\trrh480\cellx1440\cellx3600\cellx5040
\intbl 단원\cell 유형\cell 점수\cell\row}
{\trowd\trrh720\cellx1440\cellx3600\cellx5040
\intbl 미적분\cell 극한\cell 12\cell\row}
{\trowd\trrh720\cellx1440\cellx3600\cellx5040
\intbl 수열\cell 복합 문항\cell 8\cell\row}}`;
  const { elements } = await createClipboardEditableElements(clipboardData("", "", rtf), page, 100, 120, 0);
  const images = elements.filter((element) => element.type === "image");
  const cells = elements.filter((element) => element.type === "shape" && element.name === "표 셀");
  const texts = elements.filter((element) => element.type === "text" && element.name === "표 셀 텍스트");

  assert.equal(images.length, 0);
  assert.equal(cells.length, 9);
  assert.equal(texts.length, 9);
  assert.equal(Math.max(...cells.map((element) => element.x + element.width)) - Math.min(...cells.map((element) => element.x)), 336);
  assert.equal(Math.max(...cells.map((element) => element.y + element.height)) - Math.min(...cells.map((element) => element.y)), 128);
});

test("PowerPoint positioned table fragments suppress fallback images", async () => {
  const html = `<!--StartFragment-->
    <div style="position:absolute;left:12pt;top:18pt;width:90pt;height:28pt;border:1pt solid #111827;background-color:#ddebf7;font-size:11pt">단원</div>
    <div style="position:absolute;left:102pt;top:18pt;width:150pt;height:28pt;border:1pt solid #111827;background-color:#ddebf7;font-size:11pt">유형</div>
    <div style="position:absolute;left:252pt;top:18pt;width:70pt;height:28pt;border:1pt solid #111827;background-color:#ddebf7;font-size:11pt">점수</div>
    <div style="position:absolute;left:12pt;top:46pt;width:90pt;height:42pt;border:1pt solid #111827;background-color:#e2f0d9;font-size:10pt">미적분</div>
    <div style="position:absolute;left:102pt;top:46pt;width:150pt;height:42pt;border:1pt solid #111827;background-color:#ffffff;font-size:10pt">극한과 연속</div>
    <div style="position:absolute;left:252pt;top:46pt;width:70pt;height:42pt;border:1pt solid #111827;background-color:#ffffff;font-size:10pt">12</div>
    <img src="data:image/png;base64,iVBORw0KGgo=" width="900" height="360" alt="PowerPoint fallback image">
  <!--EndFragment-->`;
  const { elements } = await createClipboardEditableElements(clipboardData(html), page, 100, 120, 0);
  const images = elements.filter((element) => element.type === "image");
  const shapes = elements.filter((element) => element.type === "shape");
  const texts = elements.filter((element) => element.type === "text");

  assert.equal(images.length, 0);
  assert.equal(shapes.length, 6);
  assert.equal(texts.length, 6);
  assert.equal(Math.max(...shapes.map((element) => element.x + element.width)) - Math.min(...shapes.map((element) => element.x)), 413);
});

test("PowerPoint conditional VML table fragments suppress fallback images", async () => {
  const html = `<!--StartFragment-->
    <!--[if gte vml 1]>
      <v:rect style="position:absolute;left:12pt;top:18pt;width:90pt;height:28pt" fillcolor="#ddebf7" strokecolor="#111827" strokeweight="1pt"><v:textbox><div>Header A</div></v:textbox></v:rect>
      <v:rect style="position:absolute;left:102pt;top:18pt;width:150pt;height:28pt" fillcolor="#ddebf7" strokecolor="#111827" strokeweight="1pt"><v:textbox><div>Header B</div></v:textbox></v:rect>
      <v:rect style="position:absolute;left:252pt;top:18pt;width:70pt;height:28pt" fillcolor="#ddebf7" strokecolor="#111827" strokeweight="1pt"><v:textbox><div>Score</div></v:textbox></v:rect>
      <v:rect style="position:absolute;left:12pt;top:46pt;width:90pt;height:42pt" fillcolor="#e2f0d9" strokecolor="#111827" strokeweight="1pt"><v:textbox><div>Unit</div></v:textbox></v:rect>
      <v:rect style="position:absolute;left:102pt;top:46pt;width:150pt;height:42pt" fillcolor="#ffffff" strokecolor="#111827" strokeweight="1pt"><v:textbox><div>Limit</div></v:textbox></v:rect>
      <v:rect style="position:absolute;left:252pt;top:46pt;width:70pt;height:42pt" fillcolor="#ffffff" strokecolor="#111827" strokeweight="1pt"><v:textbox><div>12</div></v:textbox></v:rect>
    <![endif]-->
    <img src="data:image/png;base64,iVBORw0KGgo=" width="900" height="360" alt="PowerPoint fallback image">
  <!--EndFragment-->`;
  const { elements } = await createClipboardEditableElements(clipboardData(html), page, 100, 120, 0);
  const images = elements.filter((element) => element.type === "image");
  const shapes = elements.filter((element) => element.type === "shape");
  const texts = elements.filter((element) => element.type === "text");

  assert.equal(images.length, 0);
  assert.equal(shapes.length, 6);
  assert.equal(texts.length, 6);
  assert.equal(Math.max(...shapes.map((element) => element.x + element.width)) - Math.min(...shapes.map((element) => element.x)), 413);
  assert.equal(Math.max(...shapes.map((element) => element.y + element.height)) - Math.min(...shapes.map((element) => element.y)), 93);
});

test("PowerPoint class-based table styling preserves cell fill and borders", async () => {
  const html = `<!--StartFragment-->
    <style>
      .leftBand { background: #9aa8b4; border: .75pt solid #737373; color: #000000; font-size: 12pt; }
      .grayCell { background: #b7b7b7; border: .75pt solid #737373; color: #000000; font-size: 12pt; }
      .whiteCell { background: #ffffff; border: .75pt solid #737373; color: #000000; font-size: 12pt; }
    </style>
    <table style="position:absolute;left:0pt;top:0pt;width:600pt;height:270pt;border-collapse:collapse">
      <tr style="height:32pt">
        <td class="leftBand" style="width:90pt">학습태도<br>관리평가</td>
        <td class="grayCell" style="width:170pt">집중도</td>
        <td class="grayCell" style="width:340pt">높음□ 보통□ 낮음□</td>
      </tr>
      <tr style="height:120pt">
        <td class="leftBand">멘토<br>종합의견</td>
        <td class="grayCell">개선 포인트</td>
        <td class="whiteCell">시험지 3번 문항은 이전 수업에서 다룬 문항이었으나 다시 해결하지 못했음.</td>
      </tr>
    </table>
    <img src="data:image/png;base64,iVBORw0KGgo=" width="900" height="360" alt="PowerPoint fallback image">
  <!--EndFragment-->`;
  const { elements } = await createClipboardEditableElements(clipboardData(html), page, 100, 120, 0);
  const images = elements.filter((element) => element.type === "image");
  const shapes = elements.filter((element) => element.type === "shape");
  const texts = elements.filter((element) => element.type === "text");
  const fills = shapes.map((element) => String(element.style?.fill || "").toLowerCase());

  assert.equal(images.length, 0);
  assert.equal(shapes.length, 6);
  assert.equal(texts.length, 6);
  assert.ok(texts.some((element) => String(element.text || "").includes("학습태도\n관리평가")));
  assert.ok(fills.some((fill) => fill === "#9aa8b4" || fill === "rgb(154, 168, 180)"));
  assert.ok(fills.some((fill) => fill === "#b7b7b7" || fill === "rgb(183, 183, 183)"));
  assert.ok(fills.some((fill) => fill === "#ffffff" || fill === "rgb(255, 255, 255)" || fill === "white"));
  assert.ok(shapes.every((element) => (element.style?.strokeWidth || 0) > 0));
});
