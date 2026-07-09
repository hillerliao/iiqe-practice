// Prisma 7 配置:让 prisma CLI(postinstall、db push、db seed)读取 DATABASE_URL,
// 默认指向 ./prisma/dev.db;生产部署时由 .env.production 覆盖为 ./prisma/prod.db。
//
// Prisma 7 重要变化:
// - schema.prisma 不再支持 `url = env(...)`,连接字符串只在此处声明
// - 运行时需要把 adapter 传给 PrismaClient 构造函数
// (lib/db.ts 已经做了:PrismaBetterSqlite3({ url: path }) + new PrismaClient({ adapter }))
//
// 注意:此文件是 Prisma 7 推荐的 prisma.config.ts(替代旧 prisma + schema 模式),
// 不要删,否则 npm run db:push / prisma generate 会在本地与 VPS 失败。

import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const url = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "prisma", "dev.db")}`;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url,
  },
});
