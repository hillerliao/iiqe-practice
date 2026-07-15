// 只读诊断旧 Attempt 的题单与答案状态。
// 用法:
//   DATABASE_URL=file:/home/ecs-user/iiqe-app/prisma/prod.db \
//     node scripts/diag/attempt-answer.mjs at_mrgmyomi_ny24sc P3-exam-321
import Database from "better-sqlite3";

const attemptId = process.argv[2] ?? "at_mrgmyomi_ny24sc";
const questionId = process.argv[3] ?? "P3-exam-321";
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/prod.db";
const dbPath = databaseUrl.replace(/^file:/, "");

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const attempt = db.prepare(`
    SELECT id, paperId, mode, source, startedAt, finishedAt, totalQ, questionIds, correct
    FROM Attempt
    WHERE id = ?
  `).get(attemptId);
  const answers = db.prepare(`
    SELECT id, questionId, userAnswer, isCorrect, timeSpentMs, createdAt
    FROM Answer
    WHERE attemptId = ?
    ORDER BY createdAt
  `).all(attemptId);
  const question = db.prepare(`
    SELECT q.id, q.paperId, p.code AS paperCode, q.number, q.ref, q.source, q.answer
    FROM Question q
    LEFT JOIN Paper p ON p.id = q.paperId
    WHERE q.id = ?
  `).get(questionId);
  const attemptPaper = attempt
    ? db.prepare(`SELECT id, code, name FROM Paper WHERE id = ? OR code = ? LIMIT 1`)
        .get(attempt.paperId, attempt.paperId)
    : null;

  const duplicateAnswers = db.prepare(`
    SELECT attemptId, questionId, COUNT(*) AS count
    FROM Answer
    GROUP BY attemptId, questionId
    HAVING COUNT(*) > 1
    ORDER BY count DESC, attemptId, questionId
  `).all();

  console.log(JSON.stringify({
    database: dbPath,
    attempt,
    attemptPaper,
    question,
    answers,
    duplicateAnswers,
  }, null, 2));
} finally {
  db.close();
}
