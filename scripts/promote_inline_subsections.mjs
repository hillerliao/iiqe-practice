// scripts/promote_inline_subsections.mjs
// 一次性腳本: 將 <p>...<strong>X.Y.Z[a-z] </strong>標題...</p>
// 整段升級為 <h4 id="ch-X-Y-Zx">X.Y.Zx 標題...</h4>。
//
// 對 <p> 中內嵌多個子節編號 (例如 5.3.2a 段中夾帶 5.3.2b) 的情況,
// 腳本先把它拆成多個獨立 <p>, 再逐個升級。
//
// 區分「真正的下一子節」與「內文引用」: 真正的子節編號在 </strong>
// 之後必須緊接「非引用連接詞」的內容 (排除 "(a)"、"(i)"、"及"、
// "或"、"，" 等)。如果不能確定, 該段整段跳過 (留人工處理)。
//
// 處理範圍: 第一個 <h1> 之後, apx-mock-1 / apx-glossary / apx-vocab
// 之前的主內文區段。
//
// 用法: node scripts/promote_inline_subsections.mjs [--dry-run] <file.html> ...

import fs from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: node promote_inline_subsections.mjs [--dry-run] <file.html> ...");
  process.exit(1);
}

// 判斷 inner 中某個 <strong>X.Y.Z[a-z]</strong> 是否「真下一子節」還是「內文引用」。
// 我們看「在 inner 文本中, 該子節編號的上下文是不是被包在 (見 ... ) 之類的
// 引用括號裡」。簡化做法: 看該子節編號前面 30 字符內是否出現
// 「見」「參」「根據」「如」「詳」「關」等引用動詞, 或緊接著子節編號後
// 5 字符內是否為 (a)/(i) 等子項標記。如果任一條件成立, 視為引用。
const PRE_REF_WORDS = ["見", "參", "見 ", "參閱", "根據", "按 ", "如 ", "詳 ", "關 ", "見下", "見上", "見前", "見後", "詳見", "（見", "(見", "（參"];
const POST_REF_TOKENS = [/^\s*\(a\)/i, /^\s*\(b\)/i, /^\s*\(c\)/i, /^\s*\(d\)/i, /^\s*\(e\)/i, /^\s*\(f\)/i, /^\s*\(g\)/i, /^\s*\(h\)/i, /^\s*\(i\)/i, /^\s*\(ii\)/i, /^\s*\(iii\)/i, /^\s*\(iv\)/i, /^\s*\(v\)/i, /^\s*的/, /^\s*，/];

function isSubsecRef(inner, absIdx, endIdx) {
  const before = inner.slice(Math.max(0, absIdx - 30), absIdx);
  const after = inner.slice(endIdx, Math.min(inner.length, endIdx + 30));
  for (const w of PRE_REF_WORDS) {
    if (before.includes(w)) return true;
  }
  for (const pat of POST_REF_TOKENS) {
    if (pat.test(after)) return true;
  }
  return false;
}

for (const f of files) {
  const orig = fs.readFileSync(f, "utf8");
  let s = orig;

  // === 範圍邊界 ===
  const h1Match = s.match(/<h1\b/);
  if (!h1Match) {
    console.error(`[skip] ${f} — no <h1> found`);
    continue;
  }
  const start = h1Match.index;
  const stopMarkers = ["apx-mock-1", "apx-glossary", "apx-vocab"]
    .map((k) => s.indexOf(`id="${k}"`))
    .filter((i) => i > start);
  const stop = stopMarkers.length ? Math.min(...stopMarkers) : s.length;

  // === 預處理: 拆解 <p> 中多個子節編號的內嵌 ===
  // 匹配: <p(屬性)>...<strong>X.Y.Z[a-z]</strong>...內文...</p>
  // 對 inner 中除了第一個以外的 <strong>X.Y.Z[a-z]</strong> 切開。
  // 但只切「真正下一子節」(非引用上下文)。
  const splitRe = /<p([^>]*)>(\s*)<strong>(\s*\d+\.\d+\.\d+[a-z]?)\s*<\/strong>([\s\S]*?)<\/p>/g;
  const subsecRe = /<strong>(\s*\d+\.\d+\.\d+[a-z]?)\s*<\/strong>/;
  const splitEdits = [];
  let m1;
  while ((m1 = splitRe.exec(s)) !== null) {
    const idx = m1.index;
    if (idx < start || idx >= stop) continue;
    const attrs = m1[1] || "";
    const inner = m1[4];
    // 在 inner 內找「真正的下一子節編號」位置, 切開成多段
    // 規則: inner 中從頭開始找 <strong>X.Y.Z[a-z]</strong>,
    //       它「前面」必須是純文本(無其他強標籤),且不算引用上下文。
    //       找到後從這個位置切;然後從切點後繼續找。
    const cuts = []; // { from, to }
    let cursor = 0;
    while (true) {
      const nextMatch = inner.slice(cursor).match(subsecRe);
      if (!nextMatch) break;
      const absIdx = cursor + nextMatch.index;
      if (isSubsecRef(inner, absIdx, absIdx + nextMatch[0].length)) {
        // 視為引用, 跳過
        cursor = absIdx + nextMatch[0].length;
        continue;
      }
      // 真正的下一子節
      cuts.push({ from: absIdx, to: absIdx + nextMatch[0].length });
      cursor = absIdx + nextMatch[0].length;
    }
    if (cuts.length === 0) continue; // 沒有真正內嵌下一子節
    // 把 m1[0] 重新組裝: 第一段(含原 m1[3] 編號)+ 後續段各自包成 <p>
    // segments[0] = 開頭空白 + m1[3] wrapped + 空格 + inner 開頭到 cuts[0].from
    // segments[i>0] = inner[cuts[i-1].from .. cuts[i].from]
    //                 (含 cuts[i-1] 的 strong 標籤 — 這是下一子節的編號)
    // segments[last] = inner[最後一個 cut.from .. end]
    const leading = m1[2] || "";
    const numTag = m1[3].trim();
    const numTagWrapped = `<strong>${numTag}</strong>`;
    const segments = [];
    segments.push(leading + numTagWrapped + " " + inner.slice(0, cuts[0].from));
    for (let i = 1; i < cuts.length; i++) {
      segments.push(inner.slice(cuts[i - 1].from, cuts[i].from));
    }
    segments.push(inner.slice(cuts[cuts.length - 1].from));
    const parts = segments.map((seg) => `<p${attrs}>${seg}</p>`);
    const newReplacement = parts.join("\n");
    splitEdits.push({
      from: idx,
      to: idx + m1[0].length,
      replacement: newReplacement,
      line: s.slice(0, idx).split(/\n/).length,
      debug: numTag + " (+" + cuts.length + " more)",
    });
  }
  // 套用 split edits (從後往前)
  splitEdits.sort((a, b) => b.from - a.from);
  for (const e of splitEdits) {
    s = s.slice(0, e.from) + e.replacement + s.slice(e.to);
  }

  // === 第二步: 升級為 <h4> ===
  const promoteRe = /<p([^>]*)>(\s*)<strong>(\s*\d+\.\d+\.\d+[a-z]?)\s*<\/strong>([\s\S]*?)<\/p>/g;
  const edits = [];
  let m2;
  while ((m2 = promoteRe.exec(s)) !== null) {
    const idx = m2.index;
    if (idx < start || idx >= stop) continue;
    const num = m2[3].trim();
    const inner = m2[4];
    if (!/^\d+\.\d+\.\d+[a-z]?$/.test(num)) continue;
    const slug = "ch-" + num.replace(/\./g, "-");
    const replacement = `<h4 id="${slug}">${num}${inner}</h4>`;
    edits.push({
      from: idx,
      to: idx + m2[0].length,
      replacement,
      line: s.slice(0, idx).split(/\n/).length,
      num,
    });
  }

  if (splitEdits.length === 0 && edits.length === 0) {
    console.log(`[no-op] ${f}`);
    continue;
  }
  if (dryRun) {
    console.log(
      `[dry-run] ${f} — split ${splitEdits.length} merged <p>, promote ${edits.length} subsection title(s):`,
    );
    for (const e of splitEdits) {
      console.log(`  SPLIT  L${e.line}  ${e.debug}  ==>  ${e.replacement.replace(/\n/g, "⏎").slice(0, 200)}`);
    }
    for (const e of edits) {
      console.log(`  PROMOTE L${e.line}  ${e.num}  ==>  ${e.replacement.replace(/\n/g, "⏎").slice(0, 200)}`);
    }
    continue;
  }

  // 從後往前套用 promote edits
  edits.sort((a, b) => b.from - a.from);
  let out = s;
  for (const e of edits) {
    out = out.slice(0, e.from) + e.replacement + out.slice(e.to);
  }
  const beforeLines = orig.split("\n").length;
  const afterLines = out.split("\n").length;
  console.log(
    `[ok]    ${f} — split ${splitEdits.length}, promoted ${edits.length} (lines ${beforeLines} -> ${afterLines})`,
  );
  fs.writeFileSync(f, out, "utf8");
}
