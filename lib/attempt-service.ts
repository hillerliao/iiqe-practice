import "server-only";

import { createHash } from "node:crypto";
import { createAttempt, createToolCall, getAttempt, getToolCall, updateAttempt, type AnswerRecord, type AttemptRecord } from "@/lib/kv";
import { getQuestionById, getQuestions } from "@/lib/data";
import { gradeAnswer, normalizeAnswer } from "@/lib/grading";

export class DomainError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requireOwned(attempt: AttemptRecord | null, sessionId: string): AttemptRecord {
  if (!attempt || attempt.sessionId !== sessionId) throw new DomainError("Attempt not found", 404, "ATTEMPT_NOT_FOUND");
  return attempt;
}

export async function startAttempt(input: {
  sessionId: string;
  paperId: string;
  mode?: string;
  source?: string;
  durationSec?: number | null;
  questionIds: string[];
}): Promise<AttemptRecord> {
  const questionIds = [...new Set(input.questionIds)];
  if (!input.paperId || questionIds.length === 0) throw new DomainError("paperId, questionIds[] 必填", 400, "INVALID_INPUT");
  const source = input.source ?? "exam";
  const available = new Set(getQuestions(input.paperId, source).map((q) => q.id));
  if (questionIds.some((qid) => !available.has(qid))) throw new DomainError("題目不屬於指定試卷或來源", 400, "QUESTION_SCOPE_MISMATCH");
  const record: AttemptRecord = {
    id: id("at"), sessionId: input.sessionId, paperId: input.paperId,
    mode: input.mode ?? "exam", source, startedAt: new Date().toISOString(), finishedAt: null,
    durationSec: input.durationSec ?? null, totalQ: questionIds.length, questionIds, correct: 0, answers: [],
  };
  await createAttempt(record);
  return record;
}

export async function readAttempt(sessionId: string, attemptId: string): Promise<AttemptRecord> {
  return requireOwned(await getAttempt(attemptId), sessionId);
}

export async function submitAnswer(input: {
  sessionId: string; attemptId: string; questionId: string; userAnswer: string; timeSpentMs?: number | null;
}): Promise<AnswerRecord> {
  const attempt = requireOwned(await getAttempt(input.attemptId), input.sessionId);
  if (attempt.finishedAt) throw new DomainError("Attempt 已完成", 409, "ATTEMPT_FINISHED");
  if (!attempt.questionIds.includes(input.questionId)) throw new DomainError("題目不在本次作答中", 400, "QUESTION_NOT_IN_ATTEMPT");
  const question = getQuestionById(input.questionId);
  if (!question || !question.answer) throw new DomainError("Question not gradeable", 422, "QUESTION_NOT_GRADEABLE");
  const normalizedAnswer = normalizeAnswer(input.userAnswer);
  if (!normalizedAnswer) throw new DomainError("答案必須是 A、B、C 或 D", 400, "INVALID_ANSWER");
  const answer: AnswerRecord = {
    questionId: input.questionId,
    userAnswer: normalizedAnswer,
    isCorrect: gradeAnswer(question, normalizedAnswer),
    timeSpentMs: input.timeSpentMs ?? null,
    createdAt: new Date().toISOString(),
  };
  const answers = attempt.answers.filter((item) => item.questionId !== input.questionId);
  answers.push(answer);
  await updateAttempt(attempt.id, { answers });
  return answer;
}

export async function finishAttempt(sessionId: string, attemptId: string): Promise<AttemptRecord> {
  const attempt = requireOwned(await getAttempt(attemptId), sessionId);
  if (attempt.finishedAt) return attempt;
  const finishedAt = new Date().toISOString();
  const correct = attempt.answers.filter((answer) => answer.isCorrect).length;
  await updateAttempt(attempt.id, { finishedAt, correct });
  return { ...attempt, finishedAt, correct };
}

export async function idempotentToolCall<T>(input: {
  sessionId: string; toolCallId: string; toolName: string; payload: unknown; execute: () => Promise<T>;
}): Promise<T> {
  if (!input.toolCallId) throw new DomainError("toolCallId 必填", 400, "TOOL_CALL_ID_REQUIRED");
  const requestHash = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  const existing = await getToolCall(input.sessionId, input.toolCallId);
  if (existing) {
    if (existing.toolName !== input.toolName || existing.requestHash !== requestHash) {
      throw new DomainError("toolCallId 已用於不同請求", 409, "TOOL_CALL_CONFLICT");
    }
    return JSON.parse(existing.responseJson) as T;
  }
  const result = await input.execute();
  const created = await createToolCall({
    id: input.toolCallId, sessionId: input.sessionId, toolName: input.toolName,
    requestHash, responseJson: JSON.stringify(result), createdAt: new Date().toISOString(),
  });
  if (!created) {
    const raced = await getToolCall(input.sessionId, input.toolCallId);
    if (raced?.toolName === input.toolName && raced.requestHash === requestHash) return JSON.parse(raced.responseJson) as T;
    throw new DomainError("toolCallId 已用於不同請求", 409, "TOOL_CALL_CONFLICT");
  }
  return result;
}
