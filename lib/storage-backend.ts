// 平台/后端选择器:在整个 app/api、lib/data.ts、lib/kv.ts 中,平台差异都
// 必须通过这个模块来解析,不能散落到各路由和页面组件。
//
// 规则(按优先级):
//   1) 显式 STORAGE_BACKEND=memory|kv|sqlite 强制选择(仅本地调试、e2e 使用)
//   2) Vercel 运行时:有 KV/Upstash 配置 → kv;否则 → memory(并打 warning)
//   3) Self-host(VPS):有 DATABASE_URL → sqlite;否则降级 memory(并打 warning)
//
// 本地开发默认与 VPS 一致:sqlite(由 .env 中的 DATABASE_URL 决定路径)。
// 这样开发阶段就能暴露持久化、schema、并发问题,避免在 VPS 才发生。

export type StorageBackend = "kv" | "sqlite" | "memory";

const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  // 只在 server 端打 warning,避免污染客户端 bundle
  if (typeof process !== "undefined" && process.env) {
    console.warn(`[storage-backend] ${message}`);
  }
}

export function isVercelRuntime(): boolean {
  return !!(
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_REGION
  );
}

export function hasKvConfig(): boolean {
  const hasUpstash = !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  const hasVercelKv = !!(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );
  return hasUpstash || hasVercelKv;
}


export function hasSqliteConfig(): boolean {
  return !!process.env.DATABASE_URL;
}

export function pickStorageBackend(): StorageBackend {
  // 1) 显式覆盖
  const explicit = (process.env.STORAGE_BACKEND ?? "").toLowerCase();
  if (explicit === "memory" || explicit === "kv" || explicit === "sqlite") {
    return explicit;
  }

  // 2) Vercel 平台
  if (isVercelRuntime()) {
    if (hasKvConfig()) return "kv";
    warnOnce(
      "vercel-no-kv",
      "Vercel runtime detected without KV/Upstash config. Falling back to in-memory storage; " +
        "data will NOT survive cold starts. Set UPSTASH_REDIS_REST_URL + TOKEN, or KV_REST_API_*."
    );
    return "memory";
  }

  // 3) Self-host / VPS / 本地
  if (hasSqliteConfig()) {
    return "sqlite";
  }

  // 4) 兜底:仅在没有 DATABASE_URL 也没有 KV 时退回 memory
  warnOnce(
    "fallback-memory",
    "No DATABASE_URL and no KV/Upstash config. Falling back to in-memory storage; " +
      "data will be lost on process restart. Configure DATABASE_URL for SQLite or Upstash env vars."
  );
  return "memory";
}

// 调试用:导出当前 backend,方便 verify-storage.ts 与 health check 直接读取
export function describeBackend(): {
  backend: StorageBackend;
  isVercel: boolean;
  hasKv: boolean;
  hasSqlite: boolean;
  databaseUrlSet: boolean;
} {
  return {
    backend: pickStorageBackend(),
    isVercel: isVercelRuntime(),
    hasKv: hasKvConfig(),
    hasSqlite: hasSqliteConfig(),
    databaseUrlSet: hasSqliteConfig(),
  };
}

