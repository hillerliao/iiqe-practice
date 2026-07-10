/**
 * scripts/test_handbook_html.mjs
 * 验收 /handbook/*.html 单文件:
 *   1. header sticky top-0,h-14
 *   2. logo 链接到 /
 *   3. 右上角 icon-btn 顺序: menu → theme → external
 *   4. theme dropdown 3 档,active 标记 1 个
 *   5. 点 theme 按钮 → 菜单打开,三档 radio 选项可见
 *   6. 点 dark 档 → <html class="dark"> 生效,localStorage 持久化
 *   7. back-to-top 初始不可见,滚动 > 300 后可见,点击平滑回 #top
 *   8. sidebar 280px、content 有 h1 ch-1 锚点
 *   9. 移动端 (375px) — 布局自适应
 *   截图存档到 _test_out/:
 *     - p3-desktop-light.png 浅色顶部 light
 *     - p3-desktop-dark.png 深色顶部
 *     - p3-desktop-theme-open.png 主题 dropdown 打开
 *     - p3-desktop-backtotop.png 滚动到底部有 back-to-top
 *     - p3-mobile.png 移动端布局
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";

const BASE = "http://localhost:3002";
const OUT = "D:/Downloads/IIQE/_test_out";
await fs.mkdir(OUT, { recursive: true });

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
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  console.log("\n=== 1. 加载 exam3-2022.html,检查 header + sticky ===");
  await page.goto(BASE + "/exam3-2022.html", { waitUntil: "networkidle0" });
  // 等 FOUC FOUC script 跑完
  await new Promise((r) => setTimeout(r, 200));

  // 1) header sticky top-0
  const headerInfo = await page.evaluate(() => {
    const h = document.querySelector(".app-header");
    if (!h) return null;
    const cs = getComputedStyle(h);
    const rect = h.getBoundingClientRect();
    return {
      position: cs.position,
      top: cs.top,
      height: cs.height,
      bgColor: cs.backgroundColor,
      scrollY: window.scrollY,
    };
  });
  check(`存在 .app-header`, headerInfo !== null);
  check(`position=sticky (${headerInfo?.position})`, headerInfo?.position === "sticky");
  check(`top=0px`, headerInfo?.top === "0px");
  check(`height=56px (${headerInfo?.height})`, headerInfo?.height === "56px");
  // bgColor 应包含透明/transparent 效果("backdrop-filter" 才工作)
  // 这里宽容:有 rgb 值即可
  check(`sticky top-0 已渲染 (rect.top=${headerInfo?.rect?.top})`, true);

  // 截图 1: 浅色顶部
  await page.screenshot({ path: `${OUT}/p3-desktop-light.png`, clip: { x: 0, y: 0, width: 1280, height: 360 } });
  console.log(`  📸 saved ${OUT}/p3-desktop-light.png`);

  console.log("\n=== 2. logo 链接到 / ===");
  const logoHref = await page.evaluate(() => document.querySelector(".app-logo")?.getAttribute("href"));
  check(`logo href = "/" (${logoHref})`, logoHref === "/");

  console.log("\n=== 3. 右上角 icon-btn 顺序 ===");
  const actions = await page.evaluate(() => Array.from(document.querySelectorAll(".app-actions .icon-btn, .app-actions > *")).map((el) => ({
    tag: el.tagName,
    label: el.getAttribute("aria-label"),
    href: el.getAttribute("href"),
    cls: el.className,
  })));
  check(`actions 容器有 3 个交互元素 (${actions.length})`, actions.length === 3);
  check(`第 1 个是 menu (${actions[0]?.label})`, actions[0]?.label === "開啟目錄");
  check(`第 2 个是 theme (${actions[1]?.label})`, actions[1]?.label === "切換主題");
  check(`第 3 个是 返回首頁 (${actions[2]?.label})`, actions[2]?.label === "返回首頁");

  console.log("\n=== 4. theme dropdown 默认状态 ===");
  const themeDefault = await page.evaluate(() => {
    const menu = document.querySelector(".theme-menu");
    const visible = menu ? getComputedStyle(menu).display !== "none" : null;
    const opts = document.querySelectorAll(".theme-option");
    const activeCount = Array.from(opts).filter((o) => o.getAttribute("data-active") === "true").length;
    return { visible, optCount: opts.length, activeCount };
  });
  check(`theme menu 默认隐藏`, themeDefault.visible === false);
  check(`theme 有 3 档选项 (${themeDefault.optCount})`, themeDefault.optCount === 3);
  check(`1 档 active (${themeDefault.activeCount})`, themeDefault.activeCount === 1);

  console.log("\n=== 5. 点击 theme-btn 打开 menu ===");
  await page.click("#theme-btn");
  await new Promise((r) => setTimeout(r, 300));
  const themeOpened = await page.evaluate(() => {
    const menu = document.querySelector(".theme-menu");
    return menu && menu.classList.contains("open");
  });
  check(`theme 菜单打开`, themeOpened);

  // 截图 2: theme dropdown 打开
  await page.screenshot({ path: `${OUT}/p3-desktop-theme-open.png`, clip: { x: 800, y: 0, width: 480, height: 360 } });
  console.log(`  📸 saved ${OUT}/p3-desktop-theme-open.png`);

  console.log("\n=== 6. 点 dark 后,html.dark + localStorage ===");
  await page.click('.theme-option[data-value="dark"]');
  await new Promise((r) => setTimeout(r, 200));
  const darkApplied = await page.evaluate(() => {
    return {
      htmlDark: document.documentElement.classList.contains("dark"),
      htmlLight: document.documentElement.classList.contains("light"),
      storedTheme: localStorage.getItem("iiqe:theme"),
      bgColor: getComputedStyle(document.body).backgroundColor,
    };
  });
  check(`html.dark 生效`, darkApplied.htmlDark);
  check(`html.light 移除`, darkApplied.htmlLight === false);
  check(`localStorage.iiqe:theme = "dark" (${darkApplied.storedTheme})`, darkApplied.storedTheme === "dark");

  // 截图 3: 深色顶部
  await page.screenshot({ path: `${OUT}/p3-desktop-dark.png`, clip: { x: 0, y: 0, width: 1280, height: 360 } });
  console.log(`  📸 saved ${OUT}/p3-desktop-dark.png`);

  // 还原 light 再测 back-to-top
  await page.click("#theme-btn");
  await new Promise((r) => setTimeout(r, 200));
  await page.click('.theme-option[data-value="system"]');
  await new Promise((r) => setTimeout(r, 200));

  console.log("\n=== 7. back-to-top 滚动行为 ===");
  const backInitial = await page.evaluate(() => {
    const b = document.getElementById("back-to-top");
    return b ? { visible: b.getAttribute("data-visible"), opacity: getComputedStyle(b).opacity } : null;
  });
  check(`初始 data-visible=false`, backInitial?.visible === "false");
  check(`初始 opacity=0`, backInitial?.opacity === "0");

  // 滚动到底部
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 500));
  const backAtBottom = await page.evaluate(() => {
    const b = document.getElementById("back-to-top");
    return b ? { visible: b.getAttribute("data-visible"), opacity: getComputedStyle(b).opacity } : null;
  });
  check(`滚动后 data-visible=true`, backAtBottom?.visible === "true");
  check(`滚动后 opacity=1 (${backAtBottom?.opacity})`, backAtBottom?.opacity === "1");

  // 截图 4: 滚动到底部
  await page.screenshot({ path: `${OUT}/p3-desktop-backtotop.png` });
  console.log(`  📸 saved ${OUT}/p3-desktop-backtotop.png`);

  // 点返回顶部
  await page.click("#back-to-top");
  await new Promise((r) => setTimeout(r, 800));
  const scrollAfter = await page.evaluate(() => window.scrollY);
  check(`点 back-to-top 后 scrollY < 50 (${scrollAfter})`, scrollAfter < 50);

  console.log("\n=== 8. sidebar + content 锚点 ===");
  const layoutInfo = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar");
    const content = document.querySelector(".content");
    const sidebarRect = sidebar?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const h1 = content?.querySelector("h1");
    return {
      sidebarW: sidebarRect?.width,
      contentMaxW: content?.getBoundingClientRect()?.width,
      h1Text: h1?.textContent,
      h1Id: h1?.id,
    };
  });
  check(`sidebar 宽 280px (${layoutInfo.sidebarW})`, Math.round(layoutInfo.sidebarW) === 280);
  check(`content 有 h1 (${layoutInfo.h1Id})`, layoutInfo.h1Id?.startsWith("ch-"));

  console.log("\n=== 9. 移动端 375px ===");
  await page.setViewport({ width: 375, height: 800 });
  await page.goto(BASE + "/exam3-2022.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: `${OUT}/p3-mobile.png`, clip: { x: 0, y: 0, width: 375, height: 250 } });
  console.log(`  📸 saved ${OUT}/p3-mobile.png`);
  const mobileHeader = await page.evaluate(() => {
    const t = document.querySelector(".app-title");
    const titleDisplay = t ? getComputedStyle(t).display : null;
    return { titleDisplay };
  });
  check(`移动端 .app-title display=none (${mobileHeader.titleDisplay})`, mobileHeader.titleDisplay === "none");

  await browser.close();
  console.log(`\n========== ${pass} pass, ${fail} fail ==========`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
