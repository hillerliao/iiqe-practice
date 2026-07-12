# iiqe-app 代码审查报告

> 项目：iiqe-app（IIQE 保险从业员考试练习 Web App）
> 技术栈：Next.js 16.2.10（App Router）/ React 19.2.4 / Prisma 7 + better-sqlite3 / @base-ui + Radix UI / Tailwind v4
> 审查日期：2026-07-10
> 运行时存储：当前 `.env` 有 `DATABASE_URL`，无 `STORAGE_BACKEND` 覆盖 → **sqlite（Prisma + better-sqlite3，prisma/dev.db）**

---

## 一、总体结论

代码整体**功能完整、结构清晰**，存储后端抽象（`lib/storage-backend.ts`）和 `verify-storage.ts` 冒烟测试思路不错。但**鉴权模型存在根本性缺陷**——整个 App 把"用户身份"等同于"客户端自填的 `sessionId` 字符串"，所有写操作和所谓"管理员校验"都建立在这个可被任意伪造的值之上，导致**越权读写他人数据、冒充管理员、劫持他人账号数据**等严重漏洞。

优先级：**先修鉴权（Critical/High），再清技术债（Medium/Low）**。

---

## 二、严重度汇总

| 级别 | 编号 | 问题 |
|---|---|---|
| 🔴 Critical | C1 | `/api/migrate` 完全无鉴权 → 任意用户数据劫持/销毁 |
| 🔴 Critical | C2 | `isAdmin(sessionId)` = 客户端字符串等值比较 → 管理员可被任意冒充 |
| 🔴 Critical | C3 | 敏感凭据（AUTH_SECRET / Vercel OIDC JWT / Edge Config token）落盘，需确认是否泄露并轮换 |
| 🟠 High | H1 | 系统性 IDOR：`sessionId` 作为未经验证的租户键，贯穿 notes/attempts/wrongbook/favorites/stats/feedback |
| 🟠 High | H2 | `/api/attempt` GET/PATCH 无归属校验，泄露他人逐题答案与笔记、可被篡改 |
| 🟠 High | H3 | 管理员反馈列表泄露其他用户的 `sessionId`（即其邮箱/账号，PII） |
| 🟡 Medium | M1 | 题目"唯一真相源"分裂：练习用 JSON（`lib/data.ts`），后台用 SQLite → 数据可能不一致 |
| 🟡 Medium | M2 | 孤儿文件 `dev.db`（根目录）与运行时 `prisma/dev.db` 并存，存在数据误用风险 |
| 🟡 Medium | M3 | 遗留已废弃脚本 `scripts/migrate-db-to-redis.ts`（KV 迁移，@ts-nocheck），与现行 SQLite 主设计冲突 |
| 🟡 Medium | M4 | sqlite 模式下仍实例化未使用的 KV 客户端，`@vercel/kv` 依赖在活动路径上已死 |
| 🟡 Medium | M5 | `lib/db.ts` 默认值 `prod.db` ≠ `prisma.config.ts` 默认值 `dev.db` |
| 🟡 Medium | M6 | Turbopack 构建 `/wrongbook/page` 时 OOM 崩溃（`localerr.log`） |
| 🟢 Low | L1 | `/api/notes` 错误响应回显原始请求体（泄露用户输入） |
| 🟢 Low | L2 | `app/practice/page.tsx:313` 在渲染期给 ref 赋值（`finishRef.current = handleFinish`） |
| 🟢 Low | L3 | 大量 `any` 类型（practice page、各 route body） |
| 🟢 Low | L4 | `app/practice/page.tsx:533` `grid-cols-15` 非 Tailwind 默认工具类（最大 12），类被忽略 |
| 🟢 Low | L5 | 鉴权令牌（`sessionId`）以 URL query 明文传输，无 CSRF / HttpOnly Cookie 绑定 |
| 🟢 Low | L6 | `submitAnswer` 存在 `currentQ` 闭包过期可能 |

---

## 三、Critical 详解（必须修）

### C1 · `/api/migrate` 任意账号数据劫持 🔴

`app/api/migrate/route.ts` 整个 POST 处理器**没有任何 `isAdmin` / `sessionId` / 归属校验**：

```ts
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fromSessionId, toSessionId } = body;   // 直接信任客户端
  ...
  const result = await migrateSession(fromSessionId, toSessionId);
```

而 `lib/kv-sqlite.ts:530` 的 `migrateSessionSqlite` 会把 `fromSessionId` 名下**所有** Attempt / Favorite / Note 的 `sessionId` 改成 `toSessionId`：

```ts
const fromAttempts = await tx.attempt.findMany({ where: { sessionId: fromSessionId } });
for (const a of fromAttempts) {
  await tx.attempt.update({ where: { id: a.id }, data: { sessionId: toSessionId } });
}
// Favorites、Notes 同理
```

**攻击场景**：因为 `sessionId` 可被用户自填为 `user:<email>`（`lib/session.ts` 允许自定义邮箱/账号），攻击者只需：

```
POST /api/migrate  { "fromSessionId": "user:victim@x.com", "toSessionId": "user:attacker@x.com" }
```

即可**把受害者的全部做题记录、收藏、笔记转移到自己账号下**，受害者侧数据随之消失。这是典型的 Broken Access Control + 数据销毁。

**修复建议**：
- 该接口本应仅供"本人把旧匿名 UUID 账号合并到已登录账号"，必须：①要求已通过真实鉴权；②只允许 `fromSessionId === 当前登录用户`；③`toSessionId` 也必须是当前登录用户。即**双方都必须是当前已认证身份**，禁止跨用户。
- 更彻底：删除这个公开端点，合并逻辑放到服务端会话升级流程内，不再接受任意 `from/to`。

### C2 · 管理员身份 = 客户端字符串等值比较 🔴

`lib/admin.ts`：

```ts
const ADMIN_ID = process.env.ADMIN_ID ?? "";
export function isAdmin(sessionId) {
  return !!sessionId && !!ADMIN_ID && sessionId === ADMIN_ID;
}
```

而 `sessionId` 来自 `lib/session.ts`（localStorage，用户可在 `/settings` 自填任意 `user:xxx`）。于是**任何人把客户端 `sessionId` 设为环境变量里的 `ADMIN_ID` 值，即成为管理员**。

`/api/admin/whoami` 只是把这个比较结果回显给客户端，**没有做任何服务端验证**：

```ts
export async function GET(req) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
  return NextResponse.json({ isAdmin: isAdmin(sessionId) });
}
```

所有后台接口（增删改题目等）都靠这个可伪造的 `isAdmin` 把关 → **后台写接口全部可被冒充**：攻击者 `sessionId=ADMIN_ID` 即可 `POST /api/admin/questions` 注入/删除题目，`DELETE` 同理。项目内**无任何 `middleware.ts`**，没有集中鉴权层兜底。

**修复建议**（任选其一，强烈建议组合）：
1. 把"身份"从"客户端自填字符串"改为**服务端签发的会话**：登录后下发 HttpOnly + Secure + SameSite Cookie（JWT 或会话表），`isAdmin` 读 Cookie 中的服务端可信声明，而非客户端 query 参数。
2. `ADMIN_ID` 不应是用户可猜测的字符串；至少为强随机、不暴露给用户。
3. 引入 `middleware.ts` 对 `/admin/*` 与所有写接口做集中拦截。

### C3 · 敏感凭据落盘 🔴

`.env` 含 `AUTH_SECRET`、`ADMIN_ID`；`.env.production` 含 **Vercel OIDC JWT**（`VERCEL_OIDC_TOKEN=eyJ...`，带 `exp`）和 **Edge Config URL（含 token）**。这些虽被 `.gitignore` 忽略（未进 git），但**当前副本在磁盘上、且 OIDC/JWT 是短期有效凭据**。

**修复建议**：
- 确认这些文件**从未**被提交/推送到远端；若曾泄露，立即轮换 OIDC token 与 Edge Config token。
- 永远不要把 JWT/OIDC 长存于 `.env.production` 明文；改用平台 Secret 注入。
- 不要在仓库里留下真实 `.env` 样本（可用 `.env.example` 只放占位）。

---

## 四、High 详解

### H1 · 系统性 IDOR 🟠

以下端点都以 URL query 里的 `sessionId` 作为数据归属键，无任何"你确实拥有这个 sessionId"的证明：

- `app/api/attempts/route.ts`（`?sessionId=` → 返回该用户全部 attempt + 答案）
- `app/api/wrongbook/route.ts`、`app/api/favorites/route.ts`、`app/api/notes/route.ts`、`app/api/stats/route.ts`、`app/api/feedback/route.ts`

由于自定义 `sessionId` 常为邮箱/账号（如 `user:bruce@x.com`），**知道或猜中他人 ID 即可读取其做题历史、笔记、收藏、反馈**。这是设计层面的 IDOR。

**修复建议**：服务端会话可信后，所有端点从会话取 owner，不再接受客户端 `sessionId`；或至少校验 `sessionId` 属于当前已认证用户。

### H2 · `/api/attempt` 无归属校验 🟠

`app/api/attempt/route.ts`：
- `GET ?id=`：直接 `getAttempt(id)` 并返回完整 attempt（含每题 `userAnswer`、`note`），**无任何 session 校验**（`:5-66`）。attempt id 形如 `at_<counter>_<6位随机>`，强度有限，且枚举/泄露即可读他人答案与笔记。
- `PATCH`：`action=answer / finish` 同样无归属校验，可篡改/结束他人 attempt（`:68-130`）。

**修复建议**：GET/PATCH 必须校验该 attempt 的 `sessionId === 当前已认证用户`，否则 403/404。

### H3 · 管理员反馈列表泄露 PII 🟠

`app/api/feedback/route.ts`（admin 分支）`listAllFeedback()` 返回**所有用户**的反馈，其中包含其 `sessionId`（对自定义 ID 即邮箱）。管理员界面会暴露其他用户标识符。

**修复建议**：admin 视图脱敏 `sessionId`，或仅在确有管理需要时展示，且前端不默认罗列。

---

## 五、Medium / Low 详解

- **M1 题目真相源分裂**：练习/阅读走 `lib/data.ts`（JSON：`data/questions-*.json`；见 `app/api/questions`、`app/practice/page.tsx`），后台读写走 SQLite（`app/api/admin/questions` → `listQuestionsSqlite`）。后台新增题目会"双写 SQLite + JSON 快照"（`lib/question-write.ts`），但两者**并非强一致**——一旦重新 seed 或直接改 JSON，前后台看到的题库会不一致。建议统一为单一真相源（推荐 SQLite 为主，JSON 仅作初始化种子）。
- **M2 孤儿 `dev.db`**：根目录 `dev.db` 与运行时 `prisma/dev.db` 并存，易误连错库。清理根目录那份，或加启动校验。
- **M3 废弃脚本** `scripts/migrate-db-to-redis.ts`（`// @ts-nocheck`，node:sqlite→Upstash，无 package.json 引用）与现行设计冲突，应删除或归档。
- **M4 死依赖**：sqlite 模式下 `lib/kv.ts:175` 仍 `createInMemoryClient()` / `createUpstashClient()`，对象创建后永不使用；`@vercel/kv` 在活动路径上已死，可移除相关分支与依赖。
- **M5 默认路径不一致**：`lib/db.ts:11` 默认 `file:./prisma/prod.db` 与 `prisma.config.ts` 默认 `prisma/dev.db` 不同（当前被 `.env` 覆盖，但脆弱）。
- **M6 Turbopack OOM**：`localerr.log` 显示编译 `/wrongbook/page` 时 `Not enough memory resources`（os error 8）。属环境约束，但可通过 `next.config.ts` 设 `turbopack.root`、或增大构建内存缓解。
- **L1** `app/api/notes/route.ts:70` 错误响应 `raw: text` 回显原始请求体，泄露用户输入；改为只回错误类型。
- **L2** `app/practice/page.tsx:313` 在 render 期赋值 ref，应放入 `useEffect` / ref callback。
- **L3** 补强类型，消除 `any`。
- **L4** `grid-cols-15` 非 Tailwind 默认，类被忽略，跳转面板塌成单列；改用 `grid-cols-12` + `col-span` 或自定义。
- **L5** `sessionId` 以 query 参数明文传输，落日志/历史；应改为 HttpOnly Cookie。
- **L6** `submitAnswer` 中 `currentQ` 闭包在异步等待期间可能过期；用 ref 或先捕获稳定值。

---

## 六、做得好的地方 ✅

- 存储后端抽象 `lib/storage-backend.ts` 优先级清晰（显式 > Vercel > 自托管 > 兜底），并 `warnOnce` 避免噪音。
- `scripts/verify-storage.ts` 是个合格的冒烟测试（校验 schema / seed / 生命周期 / 持久化）。
- 路由输入校验较规范：admin 题目 POST 对 `paperCode/source/options/answer` 有显式校验与白名单。
- 所有 Prisma 查询均为参数化，活动路径无 SQL 注入；仅废弃脚本用到 `?` 占位（也安全）。
- 客户端组件 `"use client"` 声明齐全，未发现缺失导致的报错。
- `app/api/notes` 对 `content` 长度（1000）做了限制，防滥用。

---

## 七、修复优先级清单

1. **[C1]** 给 `/api/migrate` 加归属校验或下线该端点（最高优先）。
2. **[C2]** 用服务端签发会话（HttpOnly Cookie）替换"客户端 sessionId 即身份"模型；`isAdmin` 读服务端可信声明；加 `middleware.ts` 集中鉴权。
3. **[C3]** 排查凭据是否泄露，轮换 OIDC / Edge Config / AUTH_SECRET；改用平台 Secret 注入。
4. **[H1/H2]** 所有会话相关端点从可信会话取 owner，拒绝跨用户访问；`/api/attempt` 加 `sessionId` 归属校验。
5. **[H3]** admin 反馈视图脱敏 `sessionId`。
6. **[M1]** 统一题目真相源为 SQLite，JSON 仅作种子。
7. **[M2/M3/M4/M5]** 清理孤儿 `dev.db`、删除废弃 KV 脚本与死依赖、对齐默认路径。
8. **[L1–L6]** 收尾：不回显 raw body、修正 ref 赋值、去 `any`、修 `grid-cols-15`、Cookie 化 token。

---

> 注：本报告基于静态审查与对关键文件（`migrate/route.ts`、`admin.ts`、`attempt/route.ts`、`whoami/route.ts`、`notes/route.ts`、`kv-sqlite.ts`、`session.ts`、`storage-backend.ts`、`db.ts`）的直接核实。建议把 Critical/High 项在合并前完成修复，并补充鉴权回归测试。
