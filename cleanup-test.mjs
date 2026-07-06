// 清理测试数据
import { PrismaClient } from "../lib/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "prisma/dev.db" });
const p = new PrismaClient({ adapter });

const SID = "test-session-001";
const favs = await p.favorite.deleteMany({ where: { sessionId: SID } });
const notes = await p.note.deleteMany({ where: { sessionId: SID } });
console.log(`Cleaned: ${favs.count} favorites, ${notes.count} notes`);
await p.$disconnect();
