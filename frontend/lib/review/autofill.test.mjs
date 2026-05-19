import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("./autofill.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const module = { exports: {} };
const context = vm.createContext({ module, exports: module.exports, require });
vm.runInContext(compiled.outputText, context);

const {
  inferProblemType,
  inferReviewAutofill,
  inferSubjectFromBatchName,
  inferUnitFromPage,
} = module.exports;

test("infers subjects from Korean batch names", () => {
  assert.equal(inferSubjectFromBatchName("27_이혜원_1_수2_파트1"), "수학Ⅱ");
  assert.equal(inferSubjectFromBatchName("고2_수학II_기말"), "수학Ⅱ");
  assert.equal(inferSubjectFromBatchName("고2_수학Ⅰ_중간"), "수학Ⅰ");
  assert.equal(inferSubjectFromBatchName("확통_실전"), "확률과 통계");
  assert.equal(inferSubjectFromBatchName("N제_확률과 통계_중간"), "확률과 통계");
  assert.equal(inferSubjectFromBatchName("고2_미적분_실전"), "미적분");
  assert.equal(inferSubjectFromBatchName("공통수학1_기본"), "공통수학1");
  assert.equal(inferSubjectFromBatchName("공수2_기본"), "공통수학2");
  assert.equal(inferSubjectFromBatchName("과학_모의고사"), null);
});

test("infers units only when a page map is available", () => {
  assert.equal(
    inferUnitFromPage(21, [
      { from_page: 1, to_page: 10, unit_name: "함수" },
      { from_page: 11, to_page: 30, unit_name: "미분" },
    ]),
    "미분",
  );
  assert.equal(inferUnitFromPage(7, [{ page_range: "5-9", unit_name: "수열" }]), "수열");
  assert.equal(inferUnitFromPage(12, [{ from_page: 12, unit_name: "적분" }]), "적분");
  assert.equal(inferUnitFromPage(7, null), null);
});

test("infers problem types from text patterns", () => {
  assert.equal(inferProblemType("다음 보기 중 ㄱ. 옳은 것을 고르시오"), "객관식·합답형");
  assert.equal(inferProblemType("보기에서 ①에 해당하는 것을 고르시오"), "객관식·합답형");
  assert.equal(inferProblemType("다음 중 옳지 않은 것은?"), "객관식·5지선다");
  assert.equal(inferProblemType("명제의 참 거짓을 판별하시오"), "진위형");
  assert.equal(inferProblemType("상수 a의 값을 구하시오."), "주관식·답안형");
  assert.equal(inferProblemType("이를 증명하시오."), "서술형·증명");
  assert.equal(inferProblemType("함수의 극값을 설명하시오."), "주관식·답안형");
});

test("returns field-level autofill flags", () => {
  const result = inferReviewAutofill({
    batchName: "27_이혜원_1_수2_파트1",
    problemText: "값을 구하시오.",
    sourcePage: 3,
  });
  assert.equal(JSON.stringify(result.auto_filled), JSON.stringify({
    subject: true,
    unit: false,
    problem_type: true,
  }));
});
