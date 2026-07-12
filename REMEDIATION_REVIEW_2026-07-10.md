# 修复后复检报告 (Post-Remediation Review)

日期: 2026-07-10
范围: 复核已实施的 7 阶段修复，确认安全闭环、排查回归、记录残留风险。

## 结论

修复整体**有效且无重大回归**。认证核心设计正确，所有数据接口已从"客户端 sessionId 即身份"改为"服务端签名 Cookie 派生身份"。复检中发现 **1 个回归 bug 并已修复** (`app/result/page.tsx`)。另有 4 项残留风险/建议，均为设计层面或低危，非本次修复引入。

---

## 一、已验证的安全闭环 ✅

| 项 | 验证点 | 结果 |
|---|---|---|
| 签名核心 | `lib/auth.ts`:HMAC-SHA256 对**完整 payload**(含 `admin` 字段)签名,`timingSafeEqual` 比对 | ✅ 篡改 `admin` 会使签名失效 |
| C2 管理员伪造 | `admin:true` 仅 `establishAdminSession` 签发,调用方仅 `/api/admin/login`(校验 `ADMIN_TOKEN`);普通 `/api/session` 恒 `admin:false` | ✅ 攻击者传 `sid=admin` 拿不到 admin Cookie |
| H1/C1 身份冒用 | 14 个数据路由全部用 `requireSession`,`sessionId` 取自 `session.sessionId`,**无一路由信任客户端传值** | ✅ |
| C1 跨用户迁移 | `/api/migrate` 强制 `from/to` 之一等于当前会话,否则 403 | ✅ |
| H2 作答归属 | `/api/attempt` 的 GET/PATCH(answer/finish) 均 `attempt.sessionId !== session.sessionId → 404` | ✅ |
| H3 PII 脱敏 | `/api/feedback` 管理视图用 `maskSessionId` 哈希 `sessionId` | ✅ |
| L5/L1 | `sessionId` 不再出现在 URL/query;notes 原始 body 泄露已移除 | ✅ |
| R2 竞态(复检重点) | `ensureSession` 经 `ensureOnly` 幂等,惰性 bootstrap 不会降级/覆写已有 admin Cookie | ✅ 设计正确 |

## 二、复检发现的回归(已修复) 🔧

**`app/result/page.tsx` 使用裸 `fetch("/api/attempt")`**
- 问题: `/api/attempt` GET 已改为 `requireSession`。结果页在 `useEffect` 中裸 fetch,**未先确保会话 Cookie**。若用户直接刷新 `/result?id=...`(未经过练习页的 `authedFetch` 引导),Cookie 尚未建立 → 服务端返回 401 → 前端显示"載入結果失敗"。
- 修复: 改为 `authedFetch(\`/api/attempt?id=${attemptId}\`)`,`authedFetch` 会先 `ensureSession()`(建立 Cookie)再带凭据请求。
- 影响: 仅影响"直接打开/刷新结果页"的路径;正常练习→结果流程本来就有 Cookie,故此前未被发现。
- 验证: `tsc --noEmit` 通过。

## 三、残留风险与建议(非本次修复引入)

### R1(低,设计权衡) 共享自定义 ID 命名空间
- 现状: `sid` 为用户自填(`user:email@x.com`),任何人知道/猜中他人自定义 ID 即可读取(甚至经 `/api/migrate` 合并)该用户练习数据。
- 说明: 修复**正确关闭了管理员伪造与强制迁移**,但**未提供真正的用户隔离**——因为标识符本质是自证(subject-generated)。原 localStorage 方案本就如此,非回归。
- 建议:
  - (廉价) 服务端对自定义 ID 做哈希再作为存储 key,使库中不直接存明文 email;
  - (彻底) 改为真实账号体系(email+密码 / OAuth),从根本上隔离。

### R2(低) `maskSessionId` 用无盐非加密哈希
- 现状: 管理视图用 `h*31+charCode` 的确定性哈希隐藏 email,能避免明文泄露,但短 ID 理论上可暴力反推。
- 建议: 用 `HMAC(sid, AUTH_SECRET)` 替代,脱敏更强,改动极小。

### R3(信息级) 缺 `AUTH_SECRET` 无启动告警
- 现状: 若 `AUTH_SECRET` 未配置,`verifySession` 返回 null → 全站 401(fail-closed,安全),但应用会"静默全坏"。
- 建议: 在启动/构建期检测缺失并打 warning,便于部署排查。

### R4(琐碎) 重复校验死代码
- `app/api/feedback/route.ts` 第 87–92 行有两段完全相同的 `if (!questionId || typeof questionId !== "string")` 检查,后者为死代码。无害,可顺手删。

## 四、质量/构建状态

- `tsc --noEmit`:**通过**(修复前与本次复检修复后均 0 错误)。
- `next build`(Turbopack,`NODE_OPTIONS=--max-old-space-size=4096`):**通过**,34 页全部生成,含新增 `/api/session`、`/api/admin/login` 等路由。
- 已清理:删除死代码 `lib/admin.ts`、`scripts/migrate-db-to-redis.ts`;卸载 `@vercel/kv`;重命名孤儿 `dev.db` → `orphan-dev.db`;`lib/db.ts` 默认路径对齐 `prisma/dev.db`。

## 五、仍需人工处理(与修复计划一致,未变)

1. **轮换 Vercel OIDC / Edge-Config Token**(`.env.production` 中是真实且已过期的凭据,请到 Vercel Dashboard 撤销并轮换)。
2. 内存紧张的构建器部署时加 `NODE_OPTIONS=--max-old-space-size=4096`(M6 OOM 缓解)。
3. 若经 Vercel 部署,将新 `AUTH_SECRET` / `ADMIN_TOKEN` 同步到 Vercel Env。
4. 环境提示:`better-sqlite3` 编译目标为 **Node 24**(系统 `D:\apps\nodejs\node.exe`),托管 Node 22 无法加载,构建/运行须用系统 Node。
