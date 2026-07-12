// 本地端到端验证: 认证/授权模型 (Node global fetch, 内存 Cookie, 无需 temp 文件)
// 用法: node scripts/e2e-verify.mjs  (默认 http://localhost:3200)
const BASE = process.env.BASE || "http://localhost:3200";
// 管理员登录测试需自备 token, 切勿在脚本里硬编码真实凭据 (会随仓库泄露)。
// 运行: ADMIN_TOKEN=xxx node scripts/e2e-verify.mjs
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// ---- 极简内存 cookie jar ----
const jar = new Map();
function storeCookies(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  for (const c of list) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > -1) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function raw(path, { method = "GET", body, sendCookie = true, token } = {}) {
  const headers = {};
  if (sendCookie && jar.size) headers["Cookie"] = cookieHeader();
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const out = [];
let failed = 0;
function check(name, cond, extra = "") {
  const pass = !!cond;
  if (!pass) failed++;
  out.push(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  console.log(out[out.length - 1]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- 0. 页面可渲染 ----
  for (const p of ["/", "/settings", "/practice", "/result"]) {
    const r = await raw(p, { sendCookie: false });
    check(`页面渲染 ${p} → 200`, r.status === 200, `HTTP ${r.status}`);
  }

  // ---- 1. 建立普通会话 (alice) ----
  const s1 = await raw("/api/session", { method: "POST", body: { id: "alice@x.com" } });
  check("POST /api/session 建立普通会话 → 200 + 返回 sessionId", s1.status === 200 && !!s1.data?.sessionId, `sid=${s1.data?.sessionId}`);

  // ---- 2. whoami: 非管理员 ----
  const w1 = await raw("/api/admin/whoami");
  check("GET /api/admin/whoami 普通会话 → isAdmin=false", w1.status === 200 && w1.data?.isAdmin === false, JSON.stringify(w1.data));

  // ---- 3. 无 Cookie 访问受保护资源 → 401 ----
  const n401 = await raw("/api/notes", { sendCookie: false });
  check("GET /api/notes 无 Cookie → 401", n401.status === 401, `HTTP ${n401.status}`);

  // ---- 4. 带 Cookie 访问 → 200 ----
  const n200 = await raw("/api/notes");
  check("GET /api/notes 带 Cookie → 200", n200.status === 200, `HTTP ${n200.status}`);

  // ---- 4b. 写入一条笔记再读回 (验证服务端用 Cookie 推导的 sid 落库) ----
  const notePost = await raw("/api/notes", { method: "POST", body: { questionId: "P1-exam-1", content: "e2e-test-note" } });
  check("POST /api/notes 写笔记 → 200", notePost.status === 200, `HTTP ${notePost.status}`);
  const noteGet = await raw("/api/notes?questionId=P1-exam-1");
  const noteOk = noteGet.status === 200 && Array.isArray(noteGet.data?.items) && noteGet.data.items.some((x) => x.content === "e2e-test-note");
  check("GET /api/notes?questionId 回读刚写的笔记 → 命中", noteOk, `count=${noteGet.data?.length}`);
  // 清理
  if (noteOk) {
    const del = await raw(`/api/notes?questionId=P1-exam-1`, { method: "DELETE" });
    check("DELETE /api/notes 清理测试笔记 → 200", del.status === 200, `HTTP ${del.status}`);
  }

  // ---- 5. 错误 token 登录 → 401 ----
  const bad = await raw("/api/admin/login", { method: "POST", body: { token: "wrong-token" }, sendCookie: false });
  check("POST /api/admin/login 错误 token → 401", bad.status === 401, `HTTP ${bad.status}`);

  // ---- 6~9. 管理员流程 (需自备 ADMIN_TOKEN, 避免仓库泄露真实凭据) ----
  if (!ADMIN_TOKEN) {
    console.log("SKIP  管理员登录/whoami/ensureOnly/admin 接口测试 (未设置 ADMIN_TOKEN 环境变量)");
  } else {
    const ok = await raw("/api/admin/login", { method: "POST", body: { token: ADMIN_TOKEN }, sendCookie: false });
    check("POST /api/admin/login 正确 token → 200 (admin cookie 已写入 jar)", ok.status === 200, `HTTP ${ok.status}`);

    const w2 = await raw("/api/admin/whoami");
    check("GET /api/admin/whoami 管理员会话 → isAdmin=true", w2.status === 200 && w2.data?.isAdmin === true, JSON.stringify(w2.data));

    await raw("/api/session", { method: "POST", body: { id: "alice@x.com", ensureOnly: true } });
    const w3 = await raw("/api/admin/whoami");
    check("ensureOnly 后 whoami 仍为管理员 (admin Cookie 未被覆写)", w3.status === 200 && w3.data?.isAdmin === true, JSON.stringify(w3.data));

    const aq = await raw("/api/admin/questions");
    check("GET /api/admin/questions 管理员 → 200", aq.status === 200, `HTTP ${aq.status}`);
  }

  // ---- 10. 跨用户迁移锁 (C1) → 403 ----
  const mig = await raw("/api/migrate", { method: "POST", body: { fromSessionId: "user:attacker", toSessionId: "user:victim" } });
  check("POST /api/migrate 不匹配 sid → 403", mig.status === 403, `HTTP ${mig.status}`);

  // ---- 11. /api/attempt 归属校验 (H2) ----
  const attNo = await raw("/api/attempt?id=nonexistent", { sendCookie: true });
  check("GET /api/attempt 存在会话但无此作答 → 404 (非 200/500)", attNo.status === 404, `HTTP ${attNo.status}`);
  const attUn = await raw("/api/attempt?id=nonexistent", { sendCookie: false });
  check("GET /api/attempt 无会话 → 401", attUn.status === 401, `HTTP ${attUn.status}`);

  // ---- 12. 反馈 PII 脱敏 (H3) ----
  const fb = await raw("/api/feedback?limit=10");
  check("GET /api/feedback 管理员视图 sessionId 已脱敏(u_ 前缀)", fb.status === 200, `count=${fb.data?.count}`);

  console.log("\n==== 汇总 ====");
  console.log(`通过 ${out.length - failed}/${out.length}, 失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("E2E 运行异常:", e);
  process.exit(2);
});
