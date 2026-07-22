import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { splitQuestionStatements } from "../lib/questionText";

const cases = [
  {
    name: "ASCII dots",
    text: "引言 i. 第一項 ii. 第二項",
    items: ["i. 第一項", "ii. 第二項"],
  },
  {
    name: "full-width dots",
    text: "引言 i． 第一項 ii． 第二項",
    items: ["i． 第一項", "ii． 第二項"],
  },
  {
    name: "closing parentheses",
    text: "引言 i) 第一項 ii） 第二項",
    items: ["i) 第一項", "ii） 第二項"],
  },
  {
    name: "paired parentheses",
    text: "引言 (i) 第一項 （ii） 第二項",
    items: ["(i) 第一項", "（ii） 第二項"],
  },
  {
    name: "spaced parentheses",
    text: "引言 i ) 第一項 ii ） 第二項",
    items: ["i ) 第一項", "ii ） 第二項"],
  },
  {
    name: "bare numerals",
    text: "引言 i 第一項 ii 第二項 iii 第三項 iv 第四項",
    items: ["i 第一項", "ii 第二項", "iii 第三項", "iv 第四項"],
  },
] as const;

for (const testCase of cases) {
  const actual = splitQuestionStatements(testCase.text);
  assert.equal(actual.lead, "引言", `${testCase.name}: lead`);
  assert.deepEqual(actual.items, testCase.items, `${testCase.name}: items`);
}

for (const text of [
  "這句只有 i 一個標記",
  "選項組合是 i 及 ii",
  "次序不連續 i 第一項 iii 第三項",
  "普通英文 i am testing this sentence",
]) {
  assert.deepEqual(splitQuestionStatements(text), { lead: text, items: [] });
}

const existingNewlines = "引言\ni 第一項\nii 第二項";
assert.deepEqual(splitQuestionStatements(existingNewlines), {
  lead: "引言",
  items: ["i 第一項", "ii 第二項"],
});

// OCR 丟失分隔號: 裸羅馬數字直接接中文字 (如 "iii保險人" 缺點號)
const ocrMissingDot =
  "以下哪幾項是保險投訴局有權處理的個案: i.發現沒有保證退保價值，客人投訴保險人於銷售過程中隱瞞沒有保證價值此事實 ii.投保人訴在核保結果為次標準風險 iii保險人收取過高保費，猶如比客人實際年齡大了10歲 iv.對保險人派發紅利金額的投訴";
const ocrSplit = splitQuestionStatements(ocrMissingDot);
assert.equal(ocrSplit.items.length, 4, "OCR missing dot: should split into 4 items");
assert.deepEqual(
  ocrSplit.items.map((item) => item.match(/^(?:[(（]\s*)?(viii|vii|vi|iv|ix|v|iii|ii|i|x)/i)?.[1]?.toLowerCase()),
  ["i", "ii", "iii", "iv"],
  "OCR missing dot: markers should be i, ii, iii, iv",
);

const dataPath = path.resolve(import.meta.dirname, "../data/questions-p3-mock.json");
const questions = JSON.parse(fs.readFileSync(dataPath, "utf8")) as Array<{
  id: string;
  question: string;
}>;
const question114 = questions.find((question) => question.id === "P3-mock-114");
assert.ok(question114, "P3-mock-114 is missing");

const split114 = splitQuestionStatements(question114.question);
assert.equal(split114.items.length, 4, "P3-mock-114 should contain four statements");
assert.deepEqual(
  split114.items.map((item) => item.split(/\s/, 1)[0]),
  ["i", "ii", "iii", "iv"],
);

console.log(`[question-statements] OK: ${cases.length} formats and P3-mock-114 verified`);
