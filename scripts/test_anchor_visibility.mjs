/**
 * scripts/test_anchor_visibility.mjs
 * 用本地 Chrome + puppeteer-core 验证:
 *   1. 跳转 hash 后,锚点 top 距离 viewport 顶部的 px
 *   2. 这个距离必须 > 两个 sticky header 的总高度,否则会被遮挡
 *
 * 期望:ch-* 锚点跳转后,scroll-margin-top 让 anchor top ≥ ~144px
 */
import puppeteer from "puppeteer-core";

const URL = process.env.TEST_URL || "http://localhost:3001/studynotes/exam3-2022";
const ANCHOR = process.env.TEST_ANCHOR || "ch-1-2-3";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(URL + "#" + ANCHOR, { waitUntil: "networkidle0" });
// 等 scroll-margin 生效
await new Promise((r) => setTimeout(r, 500));

const data = await page.evaluate((anchor) => {
  const el = document.getElementById(anchor);
  const header = document.querySelector("header");
  const sticky2 = document.querySelector(".sticky.top-14");
  const sticky2Rect = sticky2 ? sticky2.getBoundingClientRect() : null;
  return {
    scrollY: window.scrollY,
    anchorTop: el ? el.getBoundingClientRect().top : null,
    anchorText: el ? (el.textContent || "").slice(0, 60) : null,
    headerHeight: header ? header.getBoundingClientRect().height : null,
    sticky2Height: sticky2Rect ? sticky2Rect.height : null,
    sticky2Top: sticky2Rect ? sticky2Rect.top : null,
    viewportH: window.innerHeight,
  };
}, ANCHOR);

console.log("URL:    ", URL);
console.log("Anchor: #" + ANCHOR);
console.log("---");
console.log("scrollY (页面已滚动 px):", data.scrollY);
console.log("anchor top 距 viewport 顶:", data.anchorTop, "px");
console.log("锚点文字:", data.anchorText);
console.log("---");
console.log("全局 header 高度:", data.headerHeight, "px (sticky top-0)");
console.log("studynotes 子 header:", data.sticky2Height, "px tall @ y=" + data.sticky2Top);
console.log("总 sticky 占用:", (data.sticky2Top || 0) + (data.sticky2Height || 0), "px");

const totalSticky = (data.sticky2Top || 0) + (data.sticky2Height || 0);
const ok = data.anchorTop != null && data.anchorTop >= totalSticky - 5; // 允许 5px 容差
console.log("---");
if (ok) {
  console.log(`✅ PASS: anchor 在 ${data.anchorTop}px 处,sticky 总高 ${totalSticky}px,可见`);
} else {
  console.log(`❌ FAIL: anchor 在 ${data.anchorTop}px,sticky 总高 ${totalSticky}px,被遮挡`);
}

// 截图存档
await page.screenshot({ path: "D:/Downloads/IIQE/_test_out/p3_anchor_visible.png" });
console.log("截图已保存: D:/Downloads/IIQE/_test_out/p3_anchor_visible.png");

await browser.close();
process.exit(ok ? 0 : 1);
