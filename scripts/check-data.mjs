// 检查数据库里所有 session 的笔记/收藏
import { PrismaClient } from "../lib/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "prisma/dev.db" });
const p = new PrismaClient({ adapter });

const notesBySession = await p.note.groupBy({
  by: ['sessionId'],
  _count: { _all: true },
});
const favsBySession = await p.favorite.groupBy({
  by: ['sessionId'],
  _count: { _all: true },
});
const attemptsBySession = await p.attempt.groupBy({
  by: ['sessionId'],
  _count: { _all: true },
});

console.log("=== Notes by session ===");
for (const n of notesBySession) {
  console.log(`  ${n.sessionId}: ${n._count._all} notes`);
}
console.log("=== Favorites by session ===");
for (const f of favsBySession) {
  console.log(`  ${f.sessionId}: ${f._count._all} favorites`);
}
console.log("=== Attempts by session ===");
for (const a of attemptsBySession) {
  console.log(`  ${a.sessionId}: ${a._count._all} attempts`);
}

console.log("\n=== Last 10 notes (any session) ===");
const lastNotes = await p.note.findMany({
  take: 10,
  orderBy: { updatedAt: 'desc' },
  include: { question: { select: { number: true, ref: true } } },
});
for (const n of lastNotes) {
  console.log(`  [${n.sessionId.substring(0, 20)}] Q${n.question.number} (${n.question.ref}): "${n.content.substring(0, 50)}..." [${n.updatedAt.toISOString()}]`);
}

await p.$disconnect();
