import assert from "node:assert/strict";
import { getChapterInfo, getChapterKey } from "../lib/chapters.ts";

const keyCases = [
  ["2.4.1", "2.4"],
  ["2.4(e)", "2.4"],
  ["1.2 (e)", "1.2"],
  ["4.10註", "4.10"],
  ["4.11(e )", "4.11"],
  ["2.4 & 5.4.1(b)", "2.4"],
] as const;

for (const [ref, expectedKey] of keyCases) {
  assert.equal(getChapterKey(ref), expectedKey, `${JSON.stringify(ref)} should normalize to ${expectedKey}`);
}

for (const ref of ["2(b)", "3", ".1.2", ""]) {
  assert.equal(getChapterKey(ref), null, `ambiguous ref ${JSON.stringify(ref)} must not produce a key`);
}

const cases = [
  ["P3", "2.4(e)", "人壽保險及年金的種類 / 團體及個人保險計劃"],
  ["P3", "1.2 (e)", "人壽保險簡介 / 壽險原則"],
  ["P3", "4.10註", "闡釋人壽保險單 / 紅利選擇"],
  ["P3", "4.11(e )", "闡釋人壽保險單 / 賠付選擇"],
  ["P3", "5.1(a)", "人壽保險程序 / 公司運作"],
  ["P3", "2.4 & 5.4.1(b)", "人壽保險及年金的種類 / 團體及個人保險計劃"],
  ["P1", "4.6(d)", "保險公司的主要功能 / 保單的處理"],
] as const;

for (const [paperCode, ref, expectedPath] of cases) {
  assert.equal(
    getChapterInfo(paperCode, ref)?.path,
    expectedPath,
    `${paperCode} ref ${JSON.stringify(ref)} should resolve to ${expectedPath}`,
  );
}

for (const ref of ["2(b)", "3", ".1.2", ""]) {
  assert.equal(
    getChapterInfo("P3", ref),
    null,
    `ambiguous ref ${JSON.stringify(ref)} must not guess a subchapter`,
  );
}

console.log("chapter ref regression tests passed");
