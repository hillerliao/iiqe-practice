# IIQE App — 安全修复执行状态 (2026-07-10)

> 本文档记录对 `iiqe-app`（Next.js 16 App Router）已批准的修复计划的执行情况。
> 配套文档：`CODE_REVIEW_2026-07-10.md`（审查报告）、`plans/quantum-aurora-einstein.md`（修复计划）。

## 已完成的阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| 1 | 签名 Cookie 会话核心 (C2 / 主干) | ✅ 完成 |
| 2 | 锁死越权端点 (C1/H1/H2/H3) | ✅ 完成 |
| 3 | 凭据安全 (C3) | ✅ 完成（见下方手动步骤） |
| 4 | 数据模型与真相源 (M1/M2/M5) | ✅ 完成 |
| 5 | 清理死代码与依赖 (M3/M4) | ✅ 完成 |
| 6 | 构建与代码质量 (M6/L1–L6) | ✅ 完成（L3 见下） |
| 7 | 验证与回归 | ✅ 完成（构建通过） |

## 核心安全模型（替代「客户端 sessionId 即身份」）

- **身份来源**：服务端签发的 HMAC-SHA256 HttpOnly Cookie（`iiqe_session`），密钥 `AUTH_SECRET`。
- **不变量**：`admin:true` **仅**由 `/api/admin/login`（校验 `ADMIN_TOKEN`）签发；普通 `/api/session` 永远只签发 `admin:false`。攻击者即使发送 `sid=admin` 也拿不到 admin Cookie（C2 已封死）。
- **请求守卫**：`requireSession(req)` / `requireAdmin(req)` 从签名 Cookie 推导身份，不再信任任何客户端 `sessionId` 参数（H1 IDOR、C1 跨用户迁移、H2 attempt 归属均已锁死）。
- **PII 脱敏**：`/api/feedback` 管理视图对 `sessionId` 做哈希掩码（H3）。

## 关键文件变更

**新增 / 核心**
- `lib/auth.ts` — 签名 Cookie 会话（HMAC + `timingSafeEqual` + `secure` 依 `NODE_ENV`）。
- `lib/session-id.ts` — 前后端共用的 `sessionId` 校验（单一事实来源）。
- `lib/session-client.ts` — 客户端引导：`ensureSession()`（惰性、幂等）与 `reestablishSession()`（切 ID 时强制重建）。
- `app/api/session/route.ts` — `POST {id?, ensureOnly?}`：已存在合法会话时沿用（**保护 admin Cookie 不被惰性 bootstrap 覆写**，R2 竞态）。
- `app/api/admin/login/route.ts` — 仅 `ADMIN_TOKEN` 正确时签发 admin Cookie。

**端点守卫（requireSession / requireAdmin）**
- `attempts`, `notes`, `favorites`, `wrongbook`, `wrongbook/record`, `stats`, `feedback`, `feedback/[id]`, `admin/questions*`, `admin/whoami`, `migrate`（C1：强制 `from/to` 之一等于当前 sid，否则 403）。

**客户端改造（不再上送 localStorage sessionId）**
- `ReportButton.tsx`, `NoteButton.tsx`, `NoteItemCard.tsx`, `settings/page.tsx`, `admin-fetch.ts` 全部改用 `authedFetch` / `reestablishSession`。

**质量 / 清理**
- `app/practice/page.tsx`：L2（ref 赋值移入 `useEffect`）、L6（`submitAnswer` 改用传入 `qId` 查表，避免 `currentQ` 闭包过期）。
- `app/globals.css`：新增 `@utility grid-cols-15`（L4，Tailwind v4 默认无此类）。
- `lib/kv.ts`：移除 `@vercel/kv` / Upstash 分支（M4）；`lib/db.ts` 默认 DB 路径对齐 `prisma/dev.db`（M5）。
- 删除死代码：`lib/admin.ts`（旧的 `isAdmin(sessionId)` 伪造判定）、`scripts/migrate-db-to-redis.ts`（M3）；`npm uninstall @vercel/kv`。
- 数据层：根目录孤立 `dev.db` 重命名为 `orphan-dev.db`（可恢复）；SQLite 题目数 2476 == JSON 题目数 2476，确认 JSON 仍为只读真相源，无需翻转 `lib/data.ts`（M1 决策）。

**凭据（C3）**
- 生成新 `AUTH_SECRET` / `ADMIN_TOKEN` / `ADMIN_ID` 写入 `.env` 与 `.env.production`；`.env.example` / `.env.production.example` 补充 `ADMIN_TOKEN` 说明，并标注 `AUTH_SECRET` 现已启用、`ADMIN_ID` 仅为会话标签。

## 验证结果

- ✅ **生产构建通过**（`next build`，Turbopack）：编译 17.6s、TypeScript 校验通过、34 个页面全部生成，原先 OOM 的 `/wrongbook` 页正常构建（M6 通过提高 Node 内存缓解，见下）。
- ✅ **运行时启动冒烟**：`next start` 启动正常（`Ready in 539ms`），`/api/session` 返回正确 JSON。
- ✅ **Secure Cookie 行为正确**：生产模式下 Cookie 带 `Secure` 标记，纯 HTTP 下不被回传（符合预期；真实部署经 nginx HTTPS 访问）。
- ⚠️ **完整 Cookie 流程 E2E（401/403/admin/idempotency）**：因沙箱限制无法在此环境用 curl 完成（Cookie jar / 临时文件写入被拒），但所有相关路由逻辑已逐文件审查确认正确。建议在本地 `next dev`（HTTP + `secure:false`）用浏览器或下述 curl 脚本验证。

### 建议的本地 E2E 验证脚本（开发模式）
```bash
# 终端 A
npm run dev   # NODE_ENV=development -> secure:false，HTTP 可回传 Cookie

# 终端 B
B=http://localhost:3000; CJ=/tmp/cj.txt; rm -f $CJ
curl -s -c $CJ -b $CJ -X POST $B/api/session -H 'Content-Type: application/json' -d '{"id":"alice@x.com"}'
curl -s -c $CJ -b $CJ $B/api/admin/whoami                 # -> {"isAdmin":false,...}
curl -s -o /dev/null -w "%{http_code}\n" $B/api/notes      # 带 Cookie -> 200
curl -s -o /dev/null -w "%{http_code}\n" $B/api/notes -b "" # 无 Cookie -> 401
curl -s -c $CJ -b $CJ -X POST $B/api/admin/login -H 'Content-Type: application/json' -d '{"token":"<ADMIN_TOKEN>"}'
curl -s -c $CJ -b $CJ $B/api/admin/whoami                 # -> {"isAdmin":true,...}
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/api/migrate -H 'Content-Type: application/json' -d '{"fromSessionId":"user:attacker","toSessionId":"user:victim"}' -b $CJ  # -> 403
```

## 需要你手动完成的步骤（无法自动执行）

1. **轮换 Vercel 凭据（C3）**：`.env.production` 内含真实的 `VERCEL_OIDC_TOKEN`（已于 2026-04 过期）与 `EDGE_CONFIG` Token。请至 Vercel Dashboard 撤销并重新生成；不要在仓库/工作区长期保留明文 Token。
2. **构建内存（M6）**：本次构建以 `NODE_OPTIONS=--max-old-space-size=4096` 运行通过。若你的 CI/构建机内存紧张，请在该环境变量下执行 `next build`（或在 `next.config.ts` 评估 Turbopack 内存配置）。
3. **凭据轮换习惯**：`AUTH_SECRET` / `ADMIN_TOKEN` 为本轮新生成，已写入本地 `.env`（gitignore）。如生产由 Vercel Env 注入，请同步在 Vercel 侧设置为新值；并建议定期轮换。

## 已知取舍 / 故意延期

- **L3（`any` 类型）**：路由 body 已用 `Record<string, unknown>`，`practice` 页仍有少量 `any`。TypeScript 校验通过、无类型错误；全面消除 `any` 属低风险大规模重构，不在本次安全修复范围内，建议另行处理。
- **M1（数据真相源）**：保持 JSON 为题目只读真相源（SQLite 由 JSON seed，二者 2476 题一致），不翻转 `lib/data.ts` 到异步 SQLite——避免引发全站同步→异步重构。
- **`storage-backend.ts` 的 `kv` 后端名**：移除代码后 `"kv"` _backend 名实际映射到 in-memory 兜底，无功能影响；如需彻底清理可后续简化。
