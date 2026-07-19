// SQLite 业务实现:对应 lib/kv.ts 中的高层函数,只在 backend === "sqlite" 时被调用。
// 关键决策:不模拟 Redis 整套原语,而是把 Attempt / Answer / Favorite / Note / Feedback
// 用关系表表达,migrateSession / listAllFeedback 改为直接 SQL 事务和聚合查询。
//
// 表与字段由 prisma/schema.prisma 决定;这里用 Prisma client 操作,避免写裸 SQL。

import { getPrisma } from "@/lib/db";
import type { AttemptRecord, AnswerRecord, FavoriteRecord, NoteRecord, FeedbackRecord, ToolCallRecord } from "@/lib/kv";
import type { QuestionData } from "@/lib/data";
import type { Prisma } from "@/lib/generated/prisma";

type TransactionClient = Prisma.TransactionClient;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") ||
    (error instanceof Error && /unique constraint/i.test(error.message))
  );
}

function parseQuestionIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

type FeedbackRow = {
  id: string;
  sessionId: string;
  questionId: string;
  paperCode: string;
  source: string;
  sourceLabel: string | null;
  number: number;
  ref: string | null;
  category: string;
  description: string;
  userAnswer: string | null;
  userAgent: string;
  createdAt: Date;
};

function toAnswerRecord(a: {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpentMs: number | null;
  createdAt: Date;
}): AnswerRecord {
  return {
    questionId: a.questionId,
    userAnswer: a.userAnswer ?? "",
    isCorrect: a.isCorrect,
    timeSpentMs: a.timeSpentMs,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
  };
}

function toAttemptRecord(a: {
  id: string;
  sessionId: string;
  paperId: string;
  mode: string;
  source: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationSec: number | null;
  totalQ: number;
  questionIds: string;
  correct: number;
  answers: Array<{
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
    timeSpentMs: number | null;
    createdAt: Date;
  }>;
}): AttemptRecord {
  return {
    id: a.id,
    sessionId: a.sessionId,
    paperId: a.paperId,
    mode: a.mode,
    source: a.source,
    startedAt: a.startedAt instanceof Date ? a.startedAt.toISOString() : String(a.startedAt),
    finishedAt: a.finishedAt instanceof Date ? a.finishedAt.toISOString() : a.finishedAt,
    durationSec: a.durationSec,
    totalQ: a.totalQ,
    questionIds: parseQuestionIds(a.questionIds),
    correct: a.correct,
    answers: a.answers.map(toAnswerRecord),
  };
}

// ---------- Question CRUD (管理员编辑题目) ----------

type QuestionRow = {
  id: string;
  paperId: string;
  number: number;
  ref: string | null;
  question: string;
  options: string;
  answer: string;
  explanation: string | null;
  page: number | null;
  source: string;
  sourceLabel: string | null;
};

function toQuestionData(r: QuestionRow): QuestionData {
  let options: Record<string, string> = {};
  try {
    const parsed = JSON.parse(r.options);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      options = parsed as Record<string, string>;
    }
  } catch {
    // 容错:JSON 损坏时回退为空对象,避免上层崩溃
  }
  return {
    id: r.id,
    number: r.number,
    ref: r.ref ?? "",
    question: r.question,
    options,
    answer: r.answer,
    explanation: r.explanation,
    page: r.page,
    source: r.source,
    sourceLabel: r.sourceLabel,
  };
}

export async function getQuestionSqlite(id: string): Promise<QuestionData | null> {
  const prisma = getPrisma();
  const row = await prisma.question.findUnique({ where: { id } });
  return row ? toQuestionData(row) : null;
}

export async function listQuestionsSqlite(opts: {
  paperCode?: string;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: QuestionData[]; total: number }> {
  const prisma = getPrisma();
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const offset = Math.max(0, opts.offset ?? 0);

  // 根据 paperCode 先查 paperId;不指定时查所有 Paper。
  let paperIds: string[] | undefined;
  if (opts.paperCode) {
    const paper = await prisma.paper.findUnique({
      where: { code: opts.paperCode },
      select: { id: true },
    });
    if (!paper) return { items: [], total: 0 };
    paperIds = [paper.id];
  } else {
    const papers = await prisma.paper.findMany({ select: { id: true } });
    paperIds = papers.map((p) => p.id);
    if (paperIds.length === 0) return { items: [], total: 0 };
  }

  const where: Prisma.QuestionWhereInput = {
    paperId: { in: paperIds },
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.search
      ? {
          OR: [
            { question: { contains: opts.search } },
            { options: { contains: opts.search } },
            { ref: { contains: opts.search } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [{ paperId: "asc" }, { source: "asc" }, { number: "asc" }],
      skip: offset,
      take: limit,
    }),
  ]);

  return {
    items: rows.map((r) => toQuestionData(r as QuestionRow)),
    total,
  };
}

export async function upsertQuestionSqlite(q: QuestionData): Promise<void> {
  const prisma = getPrisma();
  const paperCode = q.id.split("-")[0] || "UNKNOWN";
  const paper = await prisma.paper.findUnique({
    where: { code: paperCode },
    select: { id: true },
  });
  if (!paper) {
    throw new Error(`Paper 不存在: code=${paperCode}。請先在 papers.json 中定義此試卷。`);
  }
  const optionsJson = JSON.stringify(q.options ?? {});
  await prisma.question.upsert({
    where: { id: q.id },
    create: {
      id: q.id,
      paperId: paper.id,
      number: q.number,
      ref: q.ref ?? "",
      question: q.question,
      options: optionsJson,
      answer: q.answer,
      explanation: q.explanation ?? null,
      page: q.page,
      source: q.source,
      sourceLabel: q.sourceLabel ?? null,
    },
    update: {
      paperId: paper.id,
      number: q.number,
      ref: q.ref ?? "",
      question: q.question,
      options: optionsJson,
      answer: q.answer,
      explanation: q.explanation ?? null,
      page: q.page,
      source: q.source,
      sourceLabel: q.sourceLabel ?? null,
    },
  });
}

function toFeedbackRecord(r: FeedbackRow): FeedbackRecord {
  return {
    id: r.id,
    sessionId: r.sessionId,
    questionId: r.questionId,
    paperCode: r.paperCode,
    source: r.source,
    sourceLabel: r.sourceLabel,
    number: r.number,
    ref: r.ref,
    category: r.category as FeedbackRecord["category"],
    description: r.description,
    userAnswer: r.userAnswer,
    userAgent: r.userAgent,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}


export async function createAttemptSqlite(record: AttemptRecord): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.attempt.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        sessionId: record.sessionId,
        paperId: record.paperId,
        mode: record.mode,
        source: record.source ?? "exam",
        startedAt: new Date(record.startedAt),
        finishedAt: record.finishedAt ? new Date(record.finishedAt) : null,
        durationSec: record.durationSec,
        totalQ: record.totalQ,
        questionIds: JSON.stringify(record.questionIds),
        correct: record.correct,
      },
      update: {},
    });
    for (const ans of record.answers) {
      const answerId = `${record.id}::${ans.questionId}`;
      await tx.answer.upsert({
        where: { id: answerId },
        create: {
          id: answerId,
          attemptId: record.id,
          questionId: ans.questionId,
          userAnswer: ans.userAnswer,
          isCorrect: ans.isCorrect,
          timeSpentMs: ans.timeSpentMs,
          createdAt: new Date(ans.createdAt),
        },
        update: {
          userAnswer: ans.userAnswer,
          isCorrect: ans.isCorrect,
          timeSpentMs: ans.timeSpentMs,
        },
      });
    }
  });
}

export async function createAttemptIfAbsentSqlite(record: AttemptRecord): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.attempt.create({
        data: {
          id: record.id,
          sessionId: record.sessionId,
          paperId: record.paperId,
          mode: record.mode,
          source: record.source ?? "exam",
          startedAt: new Date(record.startedAt),
          finishedAt: record.finishedAt ? new Date(record.finishedAt) : null,
          durationSec: record.durationSec,
          totalQ: record.totalQ,
          questionIds: JSON.stringify(record.questionIds),
          correct: record.correct,
        },
      });
      for (const ans of record.answers) {
        await tx.answer.create({
          data: {
            id: `${record.id}::${ans.questionId}`,
            attemptId: record.id,
            questionId: ans.questionId,
            userAnswer: ans.userAnswer,
            isCorrect: ans.isCorrect,
            timeSpentMs: ans.timeSpentMs,
            createdAt: new Date(ans.createdAt),
          },
        });
      }
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.attempt.findUnique({
        where: { id: record.id },
        select: { id: true },
      });
      if (existing) return false;
    }
    throw error;
  }
}

export async function getAttemptSqlite(id: string): Promise<AttemptRecord | null> {
  const prisma = getPrisma();
  const a = await prisma.attempt.findUnique({
    where: { id },
    include: { answers: { orderBy: { createdAt: "asc" } } },
  });
  return a ? toAttemptRecord(a) : null;
}

export async function getPaperCodeSqlite(paperId: string): Promise<string | null> {
  const paper = await getPrisma().paper.findFirst({
    where: { OR: [{ id: paperId }, { code: paperId }] },
    select: { code: true },
  });
  return paper?.code ?? null;
}

export async function updateAttemptSqlite(
  id: string,
  data: Partial<AttemptRecord>
): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx: TransactionClient) => {
    const existing = await tx.attempt.findUnique({ where: { id } });
    if (!existing) return;
    await tx.attempt.update({
      where: { id },
      data: {
        sessionId: data.sessionId ?? existing.sessionId,
        paperId: data.paperId ?? existing.paperId,
        mode: data.mode ?? existing.mode,
        source: data.source ?? existing.source,
        startedAt: data.startedAt ? new Date(data.startedAt) : existing.startedAt,
        finishedAt: data.finishedAt === undefined
          ? existing.finishedAt
          : data.finishedAt
          ? new Date(data.finishedAt)
          : null,
        durationSec: data.durationSec === undefined ? existing.durationSec : data.durationSec,
        totalQ: data.totalQ ?? existing.totalQ,
        questionIds: data.questionIds === undefined ? existing.questionIds : JSON.stringify(data.questionIds),
        correct: data.correct ?? existing.correct,
      },
    });
    if (data.answers) {
      // 简化策略:删除旧 answer,重写;Answer 主键是 attemptId::questionId
      // 注意:此分支只在外部以整卷重写方式传入时使用。日常答题请走 upsertAnswerSqlite,
      // 避免同 attempt 不同题目并发提交时的 last-write-wins 丢答案问题。
      await tx.answer.deleteMany({ where: { attemptId: id } });
      for (const ans of data.answers) {
        const answerId = `${id}::${ans.questionId}`;
        await tx.answer.create({
          data: {
            id: answerId,
            attemptId: id,
            questionId: ans.questionId,
            userAnswer: ans.userAnswer,
            isCorrect: ans.isCorrect,
            timeSpentMs: ans.timeSpentMs,
            createdAt: new Date(ans.createdAt),
          },
        });
      }
    }
  });
}

/**
 * 单题原子 upsert:把同 attemptId+questionId 的答案替换为最新一条,
 * 不影响其它题目的答案。历史 Answer 可能使用非确定性主键或存在重复行,
 * 因此保留最新一行的既有 ID，并在同一事务中清理该题其余重复记录。
 *
 * 为什么需要:之前 updateAttemptSqlite 用 deleteMany + 重写全部 answers,
 * 当用户同时打开多题切换时,并发两个 PATCH 会按 commit 顺序互相覆盖,
 * 表现为"刚保存的另一题答案消失"。此函数把写锁范围缩到一条 Answer。
 */
export async function upsertAnswerSqlite(
  attemptId: string,
  answer: AnswerRecord
): Promise<void> {
  const result = await upsertAnswerIfUnfinishedSqlite(attemptId, answer);
  if (result === "missing") throw new Error(`Attempt 不存在: ${attemptId}`);
}

/**
 * 在同一事务中确认 Attempt 尚未交卷并写入答案。conditional update 是写入锁的一部分，
 * 因此交卷一旦先完成，迟到的答题请求不会再留下 Answer 行。
 */
export async function upsertAnswerIfUnfinishedSqlite(
  attemptId: string,
  answer: AnswerRecord
): Promise<"written" | "finished" | "missing"> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: TransactionClient) => {
    // increment 0 让 unfinished 条件成为原子写操作，同时不改变最终成绩。
    const gate = await tx.attempt.updateMany({
      where: { id: attemptId, finishedAt: null },
      data: { correct: { increment: 0 } },
    });
    if (gate.count === 0) {
      const existing = await tx.attempt.findUnique({
        where: { id: attemptId },
        select: { finishedAt: true },
      });
      return existing ? "finished" : "missing";
    }

    const existingAnswers = await tx.answer.findMany({
      where: { attemptId, questionId: answer.questionId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true },
    });
    const answerId = existingAnswers[0]?.id ?? `${attemptId}::${answer.questionId}`;
    await tx.answer.upsert({
      where: { id: answerId },
      create: {
        id: answerId,
        attemptId,
        questionId: answer.questionId,
        userAnswer: answer.userAnswer,
        isCorrect: answer.isCorrect,
        timeSpentMs: answer.timeSpentMs,
        createdAt: new Date(answer.createdAt),
      },
      update: {
        userAnswer: answer.userAnswer,
        isCorrect: answer.isCorrect,
        timeSpentMs: answer.timeSpentMs,
        createdAt: new Date(answer.createdAt),
      },
    });
    if (existingAnswers.length > 1) {
      await tx.answer.deleteMany({
        where: {
          attemptId,
          questionId: answer.questionId,
          id: { not: answerId },
        },
      });
    }
    return "written";
  });
}

/**
 * 先原子地取得交卷权，再读取已冻结的答案计算成绩，避免答题与交卷并发时的旧快照分数。
 */
export async function finishAttemptAtomicallySqlite(
  attemptId: string,
  finishedAt: string,
): Promise<AttemptRecord | null> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: TransactionClient) => {
    const finish = await tx.attempt.updateMany({
      where: { id: attemptId, finishedAt: null },
      data: { finishedAt: new Date(finishedAt) },
    });

    if (finish.count === 0) {
      const existing = await tx.attempt.findUnique({
        where: { id: attemptId },
        include: { answers: { orderBy: { createdAt: "asc" } } },
      });
      return existing ? toAttemptRecord(existing) : null;
    }

    const answers = await tx.answer.findMany({ where: { attemptId } });
    const correct = answers.filter((answer) => answer.isCorrect).length;
    await tx.attempt.update({ where: { id: attemptId }, data: { correct } });
    const finalized = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: { orderBy: { createdAt: "asc" } } },
    });
    return finalized ? toAttemptRecord(finalized) : null;
  });
}

export async function findUnfinishedAttemptSqlite(
  sessionId: string,
  paperId?: string,
  source?: string
): Promise<AttemptRecord | null> {
  const prisma = getPrisma();
  const rows = await prisma.attempt.findMany({
    where: {
      sessionId,
      finishedAt: null,
      ...(paperId ? { paperId } : {}),
      ...(source ? { source } : {}),
    },
    orderBy: { startedAt: "desc" },
    include: { answers: { orderBy: { createdAt: "asc" } } },
    take: 1,
  });
  return rows[0] ? toAttemptRecord(rows[0]) : null;
}

export async function listAttemptsSqlite(sessionId: string): Promise<AttemptRecord[]> {
  const prisma = getPrisma();
  const rows = await prisma.attempt.findMany({
    where: { sessionId },
    orderBy: { startedAt: "asc" },
    include: { answers: { orderBy: { createdAt: "asc" } } },
  });
  return rows.map(toAttemptRecord);
}

export async function getToolCallSqlite(sessionId: string, id: string): Promise<ToolCallRecord | null> {
  const row = await getPrisma().toolCall.findUnique({ where: { id: `${sessionId}::${id}` } });
  if (!row || row.sessionId !== sessionId) return null;
  return { ...row, id, createdAt: row.createdAt.toISOString() };
}

export async function createToolCallSqlite(record: ToolCallRecord): Promise<boolean> {
  try {
    await getPrisma().toolCall.create({
      data: {
        id: `${record.sessionId}::${record.id}`,
        sessionId: record.sessionId,
        toolName: record.toolName,
        requestHash: record.requestHash,
        responseJson: record.responseJson,
        createdAt: new Date(record.createdAt),
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) return false;
    throw error;
  }
}

export async function addFavoriteSqlite(
  sessionId: string,
  questionId: string
): Promise<void> {
  const prisma = getPrisma();
  const id = `${sessionId}::${questionId}`;
  await prisma.favorite.upsert({
    where: { id },
    create: { id, sessionId, questionId },
    update: {},
  });
}

export async function removeFavoriteSqlite(
  sessionId: string,
  questionId: string
): Promise<void> {
  const prisma = getPrisma();
  await prisma.favorite.deleteMany({ where: { sessionId, questionId } });
}

export async function listFavoritesSqlite(sessionId: string): Promise<string[]> {
  const prisma = getPrisma();
  const rows = await prisma.favorite.findMany({
    where: { sessionId },
    select: { questionId: true },
  });
  return rows.map((r: { questionId: string }) => r.questionId);
}

export async function getFavoriteMetaSqlite(
  sessionId: string,
  questionId: string
): Promise<{ createdAt: string } | null> {
  const prisma = getPrisma();
  const row = await prisma.favorite.findUnique({
    where: { id: `${sessionId}::${questionId}` },
  });
  if (!row) return null;
  return {
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export async function saveNoteSqlite(
  sessionId: string,
  questionId: string,
  content: string
): Promise<void> {
  const prisma = getPrisma();
  const id = `${sessionId}::${questionId}`;
  const now = new Date();
  const existing = await prisma.note.findUnique({ where: { id } });
  await prisma.note.upsert({
    where: { id },
    create: { id, sessionId, questionId, content, createdAt: now, updatedAt: now },
    update: { content, updatedAt: now, createdAt: existing?.createdAt ?? now },
  });
}

export async function deleteNoteSqlite(
  sessionId: string,
  questionId: string
): Promise<void> {
  const prisma = getPrisma();
  await prisma.note.deleteMany({ where: { sessionId, questionId } });
}

export async function getNoteSqlite(
  sessionId: string,
  questionId: string
): Promise<NoteRecord | null> {
  const prisma = getPrisma();
  const row = await prisma.note.findUnique({ where: { id: `${sessionId}::${questionId}` } });
  if (!row) return null;
  return {
    content: row.content,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listNotesSqlite(
  sessionId: string,
  questionIds?: string[]
): Promise<Record<string, NoteRecord>> {
  const prisma = getPrisma();
  const rows = await prisma.note.findMany({
    where: {
      sessionId,
      ...(questionIds && questionIds.length > 0 ? { questionId: { in: questionIds } } : {}),
    },
  });
  const out: Record<string, NoteRecord> = {};
  for (const r of rows) {
    out[r.questionId] = {
      content: r.content,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    };
  }
  return out;
}

export async function createFeedbackSqlite(rec: FeedbackRecord): Promise<void> {
  const prisma = getPrisma();
  await prisma.feedback.upsert({
    where: { id: rec.id },
    create: {
      id: rec.id,
      sessionId: rec.sessionId,
      questionId: rec.questionId,
      paperCode: rec.paperCode,
      source: rec.source,
      sourceLabel: rec.sourceLabel,
      number: rec.number,
      ref: rec.ref,
      category: rec.category,
      description: rec.description,
      userAnswer: rec.userAnswer,
      userAgent: rec.userAgent,
    },
    update: {},
  });
}

export async function getFeedbackSqlite(id: string): Promise<FeedbackRecord | null> {
  const prisma = getPrisma();
  const r = await prisma.feedback.findUnique({ where: { id } });
  return r ? toFeedbackRecord(r) : null;
}

export async function listFeedbackSqlite(
  sessionId: string,
  limit = 100
): Promise<FeedbackRecord[]> {
  const prisma = getPrisma();
  const rows = await prisma.feedback.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toFeedbackRecord);
}

export async function listAllFeedbackSqlite(limit = 100): Promise<FeedbackRecord[]> {
  // SQLite 没有"按 session 分组再合并"的 KV 概念,直接按 createdAt 倒序拉取即可。
  const prisma = getPrisma();
  const rows = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toFeedbackRecord);
}

export async function deleteFeedbackSqlite(id: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.feedback.deleteMany({ where: { id } });
}

export async function migrateSessionSqlite(
  fromSessionId: string,
  toSessionId: string
): Promise<{ attempts: number; favorites: number; notes: number }> {
  if (fromSessionId === toSessionId) {
    return { attempts: 0, favorites: 0, notes: 0 };
  }
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: TransactionClient) => {
    // Attempts
    const fromAttempts = await tx.attempt.findMany({ where: { sessionId: fromSessionId } });
    let attemptCount = 0;
    for (const a of fromAttempts) {
      await tx.attempt.update({ where: { id: a.id }, data: { sessionId: toSessionId } });
      attemptCount++;
    }

    // Favorites
    const fromFavs = await tx.favorite.findMany({ where: { sessionId: fromSessionId } });
    let favoriteCount = 0;
    for (const f of fromFavs) {
      const newId = `${toSessionId}::${f.questionId}`;
      const conflict = await tx.favorite.findUnique({ where: { id: newId } });
      if (!conflict) {
        await tx.favorite.update({ where: { id: f.id }, data: { sessionId: toSessionId, id: newId } });
        favoriteCount++;
      } else {
        await tx.favorite.delete({ where: { id: f.id } });
      }
    }

    // Notes
    const fromNotes = await tx.note.findMany({ where: { sessionId: fromSessionId } });
    let noteCount = 0;
    for (const n of fromNotes) {
      const newId = `${toSessionId}::${n.questionId}`;
      const conflict = await tx.note.findUnique({ where: { id: newId } });
      if (!conflict) {
        await tx.note.update({ where: { id: n.id }, data: { sessionId: toSessionId, id: newId } });
        noteCount++;
      } else {
        await tx.note.delete({ where: { id: n.id } });
      }
    }

    return { attempts: attemptCount, favorites: favoriteCount, notes: noteCount };
  });
}
