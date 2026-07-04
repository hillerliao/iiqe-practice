// Prisma 7 用 driver adapter 連接 SQLite
// 注意:在 Next.js 開發模式下要避免在 hot reload 重複 new client
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // 去掉 "file:" prefix
  const path = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: path });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
