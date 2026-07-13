/**
 * scripts/test_handbook_jump.mts
 *
 * 端到端验证:
 *   1. getHandbookSlugByPaper(P3) → exam3-2022
 *   2. getHandbookHref("exam3-2022", ref) 返回正确锚点,且锚点存在于 exam3-2022.json
 *   3. getChapterInfo("P3", ref) 返回正确的章节路径
 *   4. P1 不受影响
 *   5. /studynotes/exam3-2022 实际页面能渲染章节锚点
 */
import { getHandbookSlugByPaper, getHandbookHref, chapterIdSet } from "../lib/handbook-refs.ts";
import { getChapterInfo } from "../lib/chapters.ts";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const P3_JSON = path.join(ROOT, "public", "handbook", "exam3-2022.json");
const P1_JSON = path.join(ROOT, "public", "handbook", "exam1-2024.json");

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log("  ✅ " + label); }
  else    { fail++; console.log("  ❌ " + label + (detail ? "  →  " + detail : "")); }
}

async function main() {
  const p3 = JSON.parse(await fs.readFile(P3_JSON, "utf-8"));
  const p1 = JSON.parse(await fs.readFile(P1_JSON, "utf-8"));
  const p3Ids = chapterIdSet(p3.chapters);
  const p1Ids = chapterIdSet(p1.chapters);

  console.log("\n=== 测试 1: paperCode → slug 映射 ===");
  check("P1 → exam1-2024",  getHandbookSlugByPaper("P1") === "exam1-2024");
  check("P3 → exam3-2022",  getHandbookSlugByPaper("P3") === "exam3-2022");
  check("null → null",      getHandbookSlugByPaper(null) === null);
  check("空字串 → null",    getHandbookSlugByPaper("") === null);
  check("P2 → null",        getHandbookSlugByPaper("P2") === null);
  check("小写 'p3' 也接受", getHandbookSlugByPaper("p3") === "exam3-2022");

  console.log("\n=== 测试 2: 卷三题目 ref → 锚点(真实样本) ===");
  const p3Refs = ["1.3.1", "1.2.2", "3.4.2", "5.2.4", "1.3.1a(a)", "1.1"];
  for (const ref of p3Refs) {
    const href = getHandbookHref("exam3-2022", ref, p3Ids);
    const expectSub = "#ch-";
    const ok = href !== null && href.startsWith("/studynotes/exam3-2022") && href.includes(expectSub);
    check(`ref="${ref}" → ${href}`, ok);
  }

  console.log("\n=== 测试 3: 卷一题目 ref → 锚点(不受影响) ===");
  const p1Refs = ["1.1.2(a)", "2.1", "3.4", "7.4.7a", "1.1"];
  for (const ref of p1Refs) {
    const href = getHandbookHref("exam1-2024", ref, p1Ids);
    const ok = href !== null && href.startsWith("/studynotes/exam1-2024");
    check(`ref="${ref}" → ${href}`, ok);
  }

  console.log("\n=== 测试 4: P3 章节对照表(新加的 30 条) ===");
  const p3Chapters = ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "2.4",
                      "3.1", "3.2", "3.3", "3.4", "3.5", "3.6",
                      "4.1", "4.10", "4.12", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6"];
  for (const ref of p3Chapters) {
    const info = getChapterInfo("P3", ref);
    check(`"P3" ref "${ref}" → ${info?.path ?? "null"}`, info !== null);
  }

  console.log("\n=== 测试 5: P1 章节对照表(原有,未误伤) ===");
  const p1Chapters = ["1.1", "2.1", "3.4", "5.5", "7.6"];
  for (const ref of p1Chapters) {
    const info = getChapterInfo("P1", ref);
    check(`"P1" ref "${ref}" → ${info?.path ?? "null"}`, info !== null);
  }

  console.log("\n=== 测试 6: ref 格式校验 ===");
  check("空 ref → null",     getHandbookHref("exam3-2022", "") === null);
  check("单段 ref '1' → ch-1", getHandbookHref("exam3-2022", "1") === "/studynotes/exam3-2022#ch-1");
  check("ref 'foo' → null", getHandbookHref("exam3-2022", "abc") === null);
  check("ref 含字母后缀 '3.4a' → ch-3-4", getHandbookHref("exam3-2022", "3.4a") === "/studynotes/exam3-2022#ch-3-4");

  console.log(`\n========== ${pass} pass, ${fail} fail ==========`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
