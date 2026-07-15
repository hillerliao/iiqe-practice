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
  upsertAnswer,
  type AttemptRecord,
  type AnswerRecord,
  type FeedbackRecord,
} from "@/lib/kv";
import { getPrisma, resetPrisma } from "@/lib/db";
import { DomainError, finishAttempt, submitAnswer } from "@/lib/attempt-service";

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

async function checkFinishAnswerAtomicity(): Promise<void> {
  if (describeBackend().backend !== "sqlite") {
    log("attempt-finish-atomicity.sqlite-skipped", true, "non-sqlite backend");
    return;
  }

  const createRecord = (id: string): AttemptRecord => ({
    id,
    sessionId: FAKE_SESSION,
    paperId: "P1",
    mode: "exam",
    source: "exam",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationSec: null,
    totalQ: 1,
    questionIds: ["P1-exam-1"],
    correct: 0,
    answers: [],
  });

  const finishedId = `at_finished_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await createAttempt(createRecord(finishedId));
  await finishAttempt(FAKE_SESSION, finishedId);
  let finishedCode = "";
  try {
    await submitAnswer({
      sessionId: FAKE_SESSION,
      attemptId: finishedId,
      questionId: "P1-exam-1",
      userAnswer: "c",
    });
  } catch (error) {
    if (error instanceof DomainError) finishedCode = error.code;
  }
  const finished = await getAttempt(finishedId);
  check("attempt.finished.rejects-answer", finishedCode === "ATTEMPT_FINISHED", `code=${finishedCode || "none"}`);
  check("attempt.finished.has-no-late-answer", finished?.answers.length === 0, `answers=${finished?.answers.length ?? -1}`);

  const concurrentId = `at_finish_race_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await createAttempt(createRecord(concurrentId));
  const [finishResult, answerResult] = await Promise.allSettled([
    finishAttempt(FAKE_SESSION, concurrentId),
    submitAnswer({
      sessionId: FAKE_SESSION,
      attemptId: concurrentId,
      questionId: "P1-exam-1",
      userAnswer: "c",
    }),
  ]);
  const concurrent = await getAttempt(concurrentId);
  const persistedCorrect = concurrent?.answers.filter((answer) => answer.isCorrect).length;
  check("attempt.finish-race.finish-succeeds", finishResult.status === "fulfilled");
  check(
    "attempt.finish-race.answer-outcome",
    answerResult.status === "fulfilled" ||
      (answerResult.status === "rejected" &&
        answerResult.reason instanceof DomainError &&
        answerResult.reason.code === "ATTEMPT_FINISHED"),
    answerResult.status === "rejected" ? String(answerResult.reason) : undefined,
  );
  check("attempt.finish-race.finished", concurrent?.finishedAt != null);
  check(
    "attempt.finish-race.score-matches-answers",
    concurrent?.correct === persistedCorrect,
    `correct=${concurrent?.correct ?? -1} persisted=${persistedCorrect ?? -1}`,
  );
}

async function checkLegacyAttemptAnswer(): Promise<void> {
  const id = `at_legacy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const rec: AttemptRecord = {
    id,
    sessionId: FAKE_SESSION,
    paperId: "P3",
    mode: "exam",
    source: "exam",
    startedAt: now,
    finishedAt: null,
    durationSec: null,
    totalQ: 10,
    questionIds: [],
    correct: 0,
    answers: [],
  };
  await createAttempt(rec);

  const answer = await submitAnswer({
    sessionId: FAKE_SESSION,
    attemptId: id,
    questionId: "P3-exam-321",
    userAnswer: "c",
    timeSpentMs: 321,
  });
  check("legacy-attempt.answer.graded", answer.isCorrect);

  const got = await getAttempt(id);
  check(
    "legacy-attempt.answer.persisted",
    got?.answers.some((item) => item.questionId === "P3-exam-321") === true,
  );
  check(
    "legacy-attempt.questionIds.stays-sentinel",
    got?.questionIds.length === 0,
    `len=${got?.questionIds.length ?? -1}`,
  );

  let crossPaperCode = "";
  try {
    await submitAnswer({
      sessionId: FAKE_SESSION,
      attemptId: id,
      questionId: "P1-exam-1",
      userAnswer: "c",
    });
  } catch (error) {
    if (error instanceof DomainError) crossPaperCode = error.code;
  }
  check(
    "legacy-attempt.cross-paper.rejected",
    crossPaperCode === "QUESTION_NOT_IN_ATTEMPT",
    `code=${crossPaperCode || "none"}`,
  );

  const strictId = `${id}_strict`;
  await createAttempt({
    ...rec,
    id: strictId,
    totalQ: 1,
    questionIds: ["P3-exam-321"],
  });
  let strictCode = "";
  try {
    await submitAnswer({
      sessionId: FAKE_SESSION,
      attemptId: strictId,
      questionId: "P3-exam-320",
      userAnswer: "a",
    });
  } catch (error) {
    if (error instanceof DomainError) strictCode = error.code;
  }
  check(
    "new-attempt.exact-roster.enforced",
    strictCode === "QUESTION_NOT_IN_ATTEMPT",
    `code=${strictCode || "none"}`,
  );

  const p3Mock106AttemptId = `${id}_p3_mock_106`;
  await createAttempt({
    ...rec,
    id: p3Mock106AttemptId,
    source: "mock",
    totalQ: 1,
    questionIds: ["P3-mock-106"],
  });
  const p3Mock106Answer = await submitAnswer({
    sessionId: FAKE_SESSION,
    attemptId: p3Mock106AttemptId,
    questionId: "P3-mock-106",
    userAnswer: "b",
  });
  check("p3-mock-106.answer.graded", p3Mock106Answer.isCorrect);

  let ownershipCode = "";
  try {
    await submitAnswer({
      sessionId: `${FAKE_SESSION}-other`,
      attemptId: id,
      questionId: "P3-exam-321",
      userAnswer: "c",
    });
  } catch (error) {
    if (error instanceof DomainError) ownershipCode = error.code;
  }
  check(
    "legacy-attempt.ownership.enforced",
    ownershipCode === "ATTEMPT_NOT_FOUND",
    `code=${ownershipCode || "none"}`,
  );
}

async function checkHistoricalAnswerUpsert(): Promise<void> {
  if (describeBackend().backend !== "sqlite") {
    log("historical-answer.sqlite-skipped", true, "non-sqlite backend");
    return;
  }

  const id = `at_history_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const historicalAnswerId = `legacy-answer-${crypto.randomUUID()}`;
  const duplicateAnswerId = `duplicate-answer-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await createAttempt({
    id,
    sessionId: FAKE_SESSION,
    paperId: "P3",
    mode: "exam",
    source: "exam",
    startedAt: now,
    finishedAt: null,
    durationSec: null,
    totalQ: 2,
    questionIds: ["P3-exam-320", "P3-exam-321"],
    correct: 0,
    answers: [],
  });

  const prisma = getPrisma();
  await prisma.answer.createMany({
    data: [
      {
        id: historicalAnswerId,
        attemptId: id,
        questionId: "P3-exam-321",
        userAnswer: "a",
        isCorrect: false,
        timeSpentMs: 100,
        createdAt: new Date(now),
      },
      {
        id: duplicateAnswerId,
        attemptId: id,
        questionId: "P3-exam-321",
        userAnswer: "d",
        isCorrect: false,
        timeSpentMs: 150,
        createdAt: new Date(Date.now() - 1_000),
      },
      {
        id: `${id}::P3-exam-320`,
        attemptId: id,
        questionId: "P3-exam-320",
        userAnswer: "b",
        isCorrect: false,
        timeSpentMs: 200,
        createdAt: new Date(now),
      },
    ],
  });

  await upsertAnswer(id, {
    questionId: "P3-exam-321",
    userAnswer: "c",
    isCorrect: true,
    timeSpentMs: 321,
    createdAt: new Date().toISOString(),
  });

  const targetRows = await prisma.answer.findMany({
    where: { attemptId: id, questionId: "P3-exam-321" },
  });
  check("historical-answer.single-row", targetRows.length === 1, `rows=${targetRows.length}`);
  check("historical-answer.id-preserved", targetRows[0]?.id === historicalAnswerId);
  check(
    "historical-answer.fields-updated",
    targetRows[0]?.userAnswer === "c" &&
      targetRows[0]?.isCorrect === true &&
      targetRows[0]?.timeSpentMs === 321,
  );
  const other = await prisma.answer.findFirst({
    where: { attemptId: id, questionId: "P3-exam-320" },
  });
  check("historical-answer.other-question-preserved", other?.userAnswer === "b");
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
  await checkFinishAnswerAtomicity();
  await checkLegacyAttemptAnswer();
  await checkHistoricalAnswerUpsert();
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
