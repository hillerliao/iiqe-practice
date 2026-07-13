// verify-storage.ts — 跨平台存储后端冒烟测试
//
// 目的:在 VPS / 本地启动前,验证 storage backend 选型、Prisma schema、运行时持久化
// 是否健康。把结果打印到 stdout,并以非 0 退出码报告失败,方便部署脚本做 health check。
//
// 覆盖:
//  1) describeBackend() 输出当前 backend / env 状态
//  2) 如果 backend === "sqlite":连接 Prisma,检查 6 张表是否齐备,Paper/Question 是否已 seed
//  3) Attempt / Answer 增改的事务语义(createAttempt → getAttempt → 答案追加 → 再次读取)
//  4) Favorite / Note 的 upsert 语义
//  5) Feedback 创建+列出
//  6) 关键冒烟:写一个 attempt 后,显式 resetPrisma() + getPrisma() 模拟"重启",数据仍在
//
// 注意:本脚本只检查 storage 层,不会触碰 data/*.json;题库源始终是 JSON,seed 路径
// 由 prisma/seed.ts 负责。

import { describeBackend } from "@/lib/storage-backend";
import {
  createAttempt,
  getAttempt,
  listAttempts,
  addFavorite,
  removeFavorite,
  listFavorites,
  saveNote,
  getNote,
  listNotes,
  createFeedback,
  listFeedback,
  listAllFeedback,
  deleteFeedback,
  type AttemptRecord,
  type AnswerRecord,
  type FeedbackRecord,
} from "@/lib/kv";
import { getPrisma, resetPrisma } from "@/lib/db";

const FAKE_SESSION = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function log(label: string, ok: boolean, detail?: string): void {
  const tag = ok ? "OK  " : "FAIL";
  const line = `[verify] ${tag} ${label}${detail ? ` — ${detail}` : ""}`;
  if (ok) {
    console.log(line);
  } else {
    console.error(line);
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  log(label, ok, detail);
  if (!ok) failures++;
}

async function checkSqliteSchema(): Promise<void> {
  const prisma = getPrisma();
  // 6 张 model 都需要存在;count() 在表缺失时会抛错,直接走 try/catch 区分。
  const tables = ["paper", "question", "attempt", "answer", "favorite", "note", "feedback"] as const;
  for (const t of tables) {
    try {
      const c = await (prisma as any)[t].count();
      check(`sqlite.table.${t}.exists`, true, `rows=${c}`);
    } catch (e) {
      check(`sqlite.table.${t}.exists`, false, e instanceof Error ? e.message : String(e));
    }
  }
}

async function checkSeedPresent(): Promise<void> {
  const prisma = getPrisma();
  const paperCount = await prisma.paper.count();
  const questionCount = await prisma.question.count();
  check("seed.papers>=1", paperCount >= 1, `papers=${paperCount}`);
  check("seed.questions>=1", questionCount >= 1, `questions=${questionCount}`);
}

async function checkAttemptLifecycle(): Promise<void> {
  const id = `at_verify_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  // 1) create attempt with 1 answer
  const ans1: AnswerRecord = {
    questionId: "P1-exam-1",
    userAnswer: "c",
    isCorrect: true,
    timeSpentMs: 1000,
    createdAt: now,
  };
  const rec: AttemptRecord = {
    id,
    sessionId: FAKE_SESSION,
    paperId: "P1",
    mode: "exam",
    source: "exam",
    startedAt: now,
    finishedAt: null,
    durationSec: null,
    totalQ: 1,
    questionIds: ["P1-exam-1"],
    correct: 0,
    answers: [ans1],
  };
  await createAttempt(rec);

  const got = await getAttempt(id);
  check("attempt.create.read", got != null);
  check("attempt.answers.length", got?.answers.length === 1, `len=${got?.answers.length ?? 0}`);

  // 2) append a 2nd answer via updateAttempt
  const ans2: AnswerRecord = {
    questionId: "P1-exam-2",
    userAnswer: "a",
    isCorrect: true,
    timeSpentMs: 800,
    createdAt: now,
  };
  await import("@/lib/kv").then((m) => m.updateAttempt(id, { answers: [ans1, ans2] }));
  const got2 = await getAttempt(id);
  check("attempt.append.read", got2?.answers.length === 2, `len=${got2?.answers.length ?? 0}`);

  // 3) listAttempts
  const list = await listAttempts(FAKE_SESSION);
  check("attempt.list.contains", list.some((a) => a.id === id), `list=${list.length}`);

  // 4) finish
  await import("@/lib/kv").then((m) =>
    m.updateAttempt(id, { finishedAt: new Date().toISOString(), correct: 2 }),
  );
  const finished = await getAttempt(id);
  check("attempt.finish.finishedAt!=null", finished?.finishedAt != null);
  check("attempt.finish.correct=2", finished?.correct === 2, `correct=${finished?.correct}`);
}

async function checkFavoriteAndNote(): Promise<void> {
  await addFavorite(FAKE_SESSION, "P1-exam-1");
  let favs = await listFavorites(FAKE_SESSION);
  check("favorite.add.list", favs.includes("P1-exam-1"), `favs=${favs.join(",")}`);

  await saveNote(FAKE_SESSION, "P1-exam-1", "verify note content");
  const note = await getNote(FAKE_SESSION, "P1-exam-1");
  check("note.upsert.content", note?.content === "verify note content", `content=${note?.content}`);

  const map = await listNotes(FAKE_SESSION);
  check("note.list.contains", map["P1-exam-1"] != null, `keys=${Object.keys(map).join(",")}`);

  await removeFavorite(FAKE_SESSION, "P1-exam-1");
  favs = await listFavorites(FAKE_SESSION);
  check("favorite.remove.list", !favs.includes("P1-exam-1"), `favs=${favs.join(",")}`);
}

async function checkFeedback(): Promise<void> {
  const id = `fb_verify_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const rec: FeedbackRecord = {
    id,
    sessionId: FAKE_SESSION,
    questionId: "P1-exam-1",
    paperCode: "P1",
    source: "exam",
    sourceLabel: "2021年版",
    number: 1,
    ref: "1.1.2(a)",
    category: "typo",
    description: "verify feedback",
    userAnswer: "c",
    userAgent: "verify-storage/1.0",
    createdAt: now,
  };
  await createFeedback(rec);
  const list = await listFeedback(FAKE_SESSION, 100);
  check("feedback.create.listContains", list.some((f) => f.id === id), `list=${list.length}`);
  const all = await listAllFeedback(100);
  check("feedback.listAll.contains", all.some((f) => f.id === id), `all=${all.length}`);
  await deleteFeedback(id);
  const after = await listFeedback(FAKE_SESSION, 100);
  check("feedback.delete.removed", !after.some((f) => f.id === id), `after=${after.length}`);
}

async function checkPersistence(): Promise<void> {
  // 关键冒烟:写一条 attempt,显式模拟"进程重启"(disconnect + 重新 new client),再读出来。
  const id = `at_persist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const rec: AttemptRecord = {
    id,
    sessionId: FAKE_SESSION,
    paperId: "P1",
    mode: "exam",
    source: "exam",
    startedAt: now,
    finishedAt: now,
    durationSec: 10,
    totalQ: 1,
    questionIds: ["P1-exam-1"],
    correct: 1,
    answers: [
      {
        questionId: "P1-exam-1",
        userAnswer: "c",
        isCorrect: true,
        timeSpentMs: 500,
        createdAt: now,
      },
    ],
  };
  await createAttempt(rec);

  // 模拟"重启":断开 + 清空缓存的 PrismaClient,重新 new。
  // 如果是 KV/memory 路径,resetPrisma 是 no-op,但 attempt 仍要能从 KV/memory 读出来。
  await resetPrisma();
  const got = await getAttempt(id);
  check("persistence.afterReset.readable", got?.id === id, `got=${got?.id ?? "null"}`);

  // SQLite 路径额外:用刚 fresh 的 client 查 attempt 应能命中
  if (describeBackend().backend === "sqlite") {
    const prisma = getPrisma();
    const row = await prisma.attempt.findUnique({ where: { id } });
    check("persistence.sqlite.freshClient.readable", row?.id === id, `row=${row?.id ?? "null"}`);
  }
}

async function main(): Promise<void> {
  const info = describeBackend();
  console.log(
    `[verify] backend=${info.backend} vercel=${info.isVercel} hasKv=${info.hasKv} hasSqlite=${info.hasSqlite} db=${info.databaseUrlSet ? "configured" : "unset"}`,
  );


  if (info.backend === "sqlite") {
    await checkSqliteSchema();
    await checkSeedPresent();
  } else {
    log("sqlite-skipped", true, `backend=${info.backend}; sqlite-only checks skipped`);
  }

  // 无论 backend 选什么,都跑业务冒烟(让脚本对 KV/memory 也健康)
  await checkAttemptLifecycle();
  await checkFavoriteAndNote();
  await checkFeedback();
  await checkPersistence();

  await resetPrisma();

  if (failures > 0) {
    console.error(`[verify] FAILED with ${failures} check(s)`);
    process.exit(1);
  } else {
    console.log("[verify] all checks passed");
  }
}

main().catch(async (e) => {
  console.error("[verify] crashed:", e);
  await resetPrisma().catch(() => undefined);
  process.exit(1);
});
