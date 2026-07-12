/**
 * scripts/test_handbook_dropdown.mjs
 * 端到端验收顶部「研習手冊」下拉菜单(纯点击 + onClick router.push 模式):
 *   1. 顶部 nav 含「研習手冊」
 *   2. 不点 trigger,DOM 不含 [role="menu"]
 *   3. 点击 trigger → DOM 出现 [role="menu"] + 2 个 [role="menuitem"]
 *   4. menuitem 文案含「保險原理及實務」与「長期保險」;P3 项含 title 属性
 *   5. 点击 P3 menuitem → 跳到 /handbook/exam3-2022.html(router.push)
 *   6. /studynotes/exam3-2022 → 308 重定向到 /handbook/exam3-2022.html
 *   7. 顶部 nav 只有 1 个「首頁」(bug 已修)
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.TEST_BASE || "http://localhost:3001";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log("  ✅ " + label); }
  else    { fail++; console.log("  ❌ " + label + (extra ? "  →  " + extra : "")); }
}

async function main() {
  // ===== 测试 6: 重定向 (用 fetch, 不需 puppeteer) =====
  console.log("=== 测试 6: /studynotes/<slug> → 308 重定向 ===");
  const res = await fetch(`${BASE}/studynotes/exam3-2022`, { redirect: "manual" });
  check(
    `301/308 (got ${res.status})`,
    res.status === 301 || res.status === 308,
    res.statusText,
  );
  const location = res.headers.get("location") || "";
  check(
    `Location 指向 /handbook/exam3-2022.html (got "${location}")`,
    location === "/handbook/exam3-2022.html",
  );

  // ===== 测试 1-5, 7: puppeteer =====
  console.log("\n=== 测试 1-5, 7: 顶部 nav + 菜单交互 ===");
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });

  // 测试 1: 顶部存在「研習手冊」trigger
  const triggerText = await page.evaluate(() => {
    const t = document.querySelector('[data-slot="dropdown-menu-trigger"]');
    return t ? (t.textContent || "").trim() : null;
  });
  check(`存在 trigger (${triggerText})`, triggerText && triggerText.includes("研習手冊"));

  // 测试 2: 未交互前无菜单
  const menuBeforeClick = await page.evaluate(
    () => document.querySelectorAll('[role="menu"]').length,
  );
  check(`未交互前无菜单元素 (${menuBeforeClick} 个)`, menuBeforeClick === 0);

  // 测试 3: 点击触发器 → 出现菜单 + 2 个 menuitem
  await page.click('[data-slot="dropdown-menu-trigger"]');
  await new Promise((r) => setTimeout(r, 350));
  const menuAfter = await page.evaluate(() => {
    const menus = document.querySelectorAll('[role="menu"]');
    const items = document.querySelectorAll('[role="menuitem"]');
    return {
      menuCount: menus.length,
      itemCount: items.length,
      itemTexts: Array.from(items).map((el) => (el.textContent || "").trim()),
      itemTitles: Array.from(items).map((el) => el.getAttribute("title")),
    };
  });
  check(`点击后出现 1 个 [role=menu] (${menuAfter.menuCount})`, menuAfter.menuCount === 1);
  check(`菜单有 2 个 menuitem (${menuAfter.itemCount})`, menuAfter.itemCount === 2);

  // 测试 4: 文案 + title 属性
  const joined = menuAfter.itemTexts.join(" | ");
  check(`菜单文案含「保險原理及實務」`, joined.includes("保險原理及實務"), joined);
  check(`菜单文案含「長期保險」`, joined.includes("長期保險"));
  check(
    "P3 menuitem 含 title 属性 (年份)",
    menuAfter.itemTitles.some((t) => t && /\d{4}/.test(t)),
    JSON.stringify(menuAfter.itemTitles),
  );

  // 测试 5: 点击 P3 menuitem → 跳到对应 HTML
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('[role="menuitem"][title*="2022"]'),
  ]);
  const afterP3 = page.url();
  check(
    `点击 P3 后 URL = ${afterP3}`,
    afterP3 === `${BASE}/handbook/exam3-2022.html`,
    afterP3,
  );
  const p3Html = await page.content();
  check("P3 页面 HTML 含「長期保險」", p3Html.includes("長期保險"));

  // 测试 7: 顶部 nav 只有 1 个「首頁」
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  const firstPageCount = await page.evaluate(() => {
    const nav = document.querySelector("header nav");
    if (!nav) return 0;
    return Array.from(nav.querySelectorAll("a"))
      .filter((a) => (a.textContent || "").trim().includes("首頁")).length;
  });
  check(`顶部 nav 仅有 1 个「首頁」 (${firstPageCount})`, firstPageCount === 1);

  await browser.close();
  console.log(`\n========== ${pass} pass, ${fail} fail ==========`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
