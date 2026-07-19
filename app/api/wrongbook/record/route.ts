// POST /api/wrongbook/record — 將「錯題本 · 重做練習」的作答寫入作答紀錄
//
// 目的:讓使用者在錯題本重做時「又錯了」能被記錄,使 wrongCount(反覆錯標籤)
// 正確累積。這些紀錄標記 source = "wrongbook-redo"。統計頁(/api/stats)會
// 將其排除,避免污染總正確率;但錯題本 GET 仍會計入(其查詢僅過濾 isCorrect:false)。
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createAttemptIfAbsent,
  ensureAttemptIndexed,
  getAttempt,
  type AttemptRecord,
  type AnswerRecord,
} from "@/lib/kv";
import { getQuestionById } from "@/lib/data";
import { gradeAnswer, normalizeAnswer } from "@/lib/grading";
import { requireSession } from "@/lib/auth";

const REDO_SOURCE = "wrongbook-redo";

let idCounter = Date.now();
function genId(): string {
  return `at_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type RecordedAnswer = { questionId: string; userAnswer?: string };

function sameAttemptContent(existing: AttemptRecord, expected: AttemptRecord): boolean {
  if (
    existing.sessionId !== expected.sessionId ||
    existing.paperId !== expected.paperId ||
    existing.mode !== expected.mode ||
    existing.source !== expected.source ||
    existing.totalQ !== expected.totalQ ||
    existing.correct !== expected.correct ||
    existing.answers.length !== expected.answers.length ||
    existing.questionIds.length !== expected.questionIds.length
  ) {
    return false;
  }
  const existingQuestionIds = [...existing.questionIds].sort();
  const expectedQuestionIds = [...expected.questionIds].sort();
  if (existingQuestionIds.some((id, index) => id !== expectedQuestionIds[index])) return false;

  const existingAnswers = new Map(
    existing.answers.map((answer) => [
      answer.questionId,
      `${answer.userAnswer}:${answer.isCorrect ? "1" : "0"}`,
    ]),
  );
  const expectedAnswers = new Map(
    expected.answers.map((answer) => [
      answer.questionId,
      `${answer.userAnswer}:${answer.isCorrect ? "1" : "0"}`,
    ]),
  );
  if (
    existingAnswers.size !== existing.answers.length ||
    expectedAnswers.size !== expected.answers.length
  ) {
    return false;
  }
  return [...expectedAnswers].every(
    ([questionId, value]) => existingAnswers.get(questionId) === value,
  );
}

function isValidSubmissionId(value: unknown): value is string {
  return typeof value === "string" && /^redo_[a-z0-9_]{8,80}$/.test(value);
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const body = (await req.json().catch(() => null)) as
    | { answers?: RecordedAnswer[]; submissionId?: unknown }
    | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const { answers, submissionId } = body;
  const hasSubmissionId = Object.prototype.hasOwnProperty.call(body, "submissionId");
  if (hasSubmissionId && !isValidSubmissionId(submissionId)) {
    return NextResponse.json({ error: "提交識別碼格式錯誤" }, { status: 400 });
  }
  const safeSubmissionId = isValidSubmissionId(submissionId) ? submissionId : null;

  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  const seenQuestionIds = new Set<string>();
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== "string") continue;
    if (seenQuestionIds.has(answer.questionId)) {
      return NextResponse.json({ error: "題目識別碼重複" }, { status: 400 });
    }
    seenQuestionIds.add(answer.questionId);
  }

  // 只處理有實際作答(非空)的題目
  const valid = answers.filter(
    (a) => a && a.questionId && typeof a.userAnswer === "string" && a.userAnswer.trim() !== ""
  );
  if (valid.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  // 依 paper 分組(錯題本可能跨多卷,而 Attempt 只能屬於單一卷)
  // paperId 取自題號 id 的前綴,例如 "exam1-2024-123" → "exam1-2024"
  const byPaper = new Map<string, AnswerRecord[]>();
  for (const a of valid) {
    const q = getQuestionById(a.questionId);
    if (!q) continue; // 題目不存在則跳過
    const paperId = q.id.split("-")[0];
    const normalizedAnswer = normalizeAnswer(a.userAnswer);
    if (!normalizedAnswer) continue;
    const rec: AnswerRecord = {
      questionId: a.questionId,
      userAnswer: normalizedAnswer,
      isCorrect: gradeAnswer(q, normalizedAnswer),
      timeSpentMs: null,
      createdAt: new Date().toISOString(),
    };
    if (!byPaper.has(paperId)) byPaper.set(paperId, []);
    byPaper.get(paperId)!.push(rec);
  }

  const now = new Date().toISOString();
  let recorded = 0;
  for (const [paperId, list] of byPaper) {
    if (list.length === 0) continue;
    const submissionScope = safeSubmissionId
      ? createHash("sha256")
          .update(`${sessionId}\0${safeSubmissionId}`)
          .digest("hex")
          .slice(0, 32)
      : null;
    const recordId = submissionScope ? `redo_${submissionScope}_${paperId}` : genId();
    const correctCount = list.filter((x) => x.isCorrect).length;
    const record: AttemptRecord = {
      id: recordId,
      sessionId,
      paperId,
      mode: REDO_SOURCE,
      source: REDO_SOURCE,
      startedAt: now,
      finishedAt: now,
      durationSec: null,
      totalQ: list.length,
      questionIds: list.map((answer) => answer.questionId),
      correct: correctCount,
      answers: list,
    };
    const created = await createAttemptIfAbsent(record);
    if (created) {
      recorded += list.length;
      continue;
    }

    const existing = await getAttempt(recordId);
    if (!existing || !sameAttemptContent(existing, record)) {
      return NextResponse.json({ error: "提交識別碼衝突" }, { status: 409 });
    }
    await ensureAttemptIndexed(sessionId, recordId);
    recorded += existing.answers.length;
  }

  return NextResponse.json({ ok: true, recorded });
}
