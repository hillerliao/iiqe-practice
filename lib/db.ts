// Prisma client 工厂:仅在 sqlite backend 时被 storage-backend 选择引入。
// 业务调用入口(lib/data.ts、lib/kv.ts)统一从这里取 client,
// 避免在路由或页面里直接 new PrismaClient。

import { PrismaClient } from "@/lib/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

let _client: PrismaClient | null = null;

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./prisma/prod.db";
  const path = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: path });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!_client) {
    _client = createPrismaClient();
  }
  return _client;
}

// 仅供 verify-storage / health check 使用,避免在路由里到处 new。
// 返回 Promise,允许调用方 await 完成 disconnect,避免进程退出时 pending。
export async function resetPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect().catch(() => undefined);
  }
  _client = null;
}
