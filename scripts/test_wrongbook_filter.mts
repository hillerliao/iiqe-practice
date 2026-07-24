import assert from "node:assert/strict";
import type { AttemptRecord, AnswerRecord } from "../lib/kv";
import type { PaperInfo, QuestionData } from "../lib/data";
import { buildWrongbookItems } from "../lib/wrongbook";
import {
  DEFAULT_REPEATED_THRESHOLD,
  getWrongbookThresholdKey,
  normalizeRepeatedThreshold,
} from "../lib/wrongbook-filter";

// —— 門檻工具 ——
assert.equal(normalizeRepeatedThreshold(null), DEFAULT_REPEATED_THRESHOLD);
assert.equal(normalizeRepeatedThreshold(""), DEFAULT_REPEATED_THRESHOLD);
assert.equal(normalizeRepeatedThreshold("abc"), DEFAULT_REPEATED_THRESHOLD);
assert.equal(normalizeRepeatedThreshold("0"), 1, "低於下限應收斂為 1");
assert.equal(normalizeRepeatedThreshold("3"), 3);
assert.equal(normalizeRepeatedThreshold("999"), 99, "高於上限應收斂為 99");
assert.equal(
  getWrongbookThresholdKey("user/name + test@example.com"),
  "iiqe:wrongbook:threshold:v1:user%2Fname%20%2B%20test%40example.com",
  "threshold key must be session-scoped and URL encoded",
);

// —— 錯題聚合:最近錯誤不依賴 Attempt 排序 ——
const question: QuestionData = {
  id: "P1-q1",
  number: 1,
  ref: "1.1",
  question: "Q1",
  options: { a: "A", b: "B", c: "C", d: "D" },
  answer: "A",
  explanation: null,
  page: null,
  source: "exam",
  sourceLabel: "Exam",
};
const papers: PaperInfo[] = [
  { id: "P1", code: "P1", name: "Paper 1", total: 1, bySource: { exam: 1, mock: 0 } },
];
const getQuestionById = (id: string) => (id === question.id ? question : null);

function answer(partial: Partial<AnswerRecord> & { questionId: string }): AnswerRecord {
  return {
    userAnswer: "B",
    isCorrect: false,
    timeSpentMs: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

function attempt(
  id: string,
  startedAt: string,
  answers: AnswerRecord[],
): AttemptRecord {
  return {
    id,
    sessionId: "s1",
    paperId: "P1",
    mode: "practice",
    source: "practice",
    startedAt,
    finishedAt: startedAt,
    durationSec: null,
    totalQ: answers.length,
    questionIds: answers.map((a) => a.questionId),
    correct: answers.filter((a) => a.isCorrect).length,
    answers,
  };
}

const olderWrong = attempt("at-old", "2024-01-01T00:00:00.000Z", [
  answer({ questionId: question.id, userAnswer: "B", createdAt: "2024-01-01T00:00:00.000Z" }),
]);
const newerWrong = attempt("at-new", "2024-02-01T00:00:00.000Z", [
  answer({ questionId: question.id, userAnswer: "C", createdAt: "2024-02-01T00:00:00.000Z" }),
]);
const correctBetween = attempt("at-correct", "2024-01-15T00:00:00.000Z", [
  answer({ questionId: question.id, userAnswer: "A", isCorrect: true, createdAt: "2024-01-15T00:00:00.000Z" }),
]);

const newToOld = buildWrongbookItems(
  [newerWrong, correctBetween, olderWrong],
  getQuestionById,
  papers,
);
const oldToNew = buildWrongbookItems(
  [olderWrong, correctBetween, newerWrong],
  getQuestionById,
  papers,
);

for (const items of [newToOld, oldToNew]) {
  assert.equal(items.length, 1, "同一題只應出現一次");
  assert.equal(items[0]?.wrongCount, 2, "正確答案不計入 wrongCount");
  assert.equal(items[0]?.userAnswer, "C", "應顯示最近一次錯誤答案");
  assert.equal(items[0]?.lastWrongAt, "2024-02-01T00:00:00.000Z");
}

// 沒有 createdAt 的舊資料應回退到 attempt 時間
const legacyAttempt = attempt("at-legacy", "2024-03-01T00:00:00.000Z", [
  { questionId: question.id, userAnswer: "D", isCorrect: false, timeSpentMs: null, createdAt: "" },
]);
const legacyItems = buildWrongbookItems([legacyAttempt], getQuestionById, papers);
assert.equal(legacyItems[0]?.lastWrongAt, "2024-03-01T00:00:00.000Z");

// 門檻篩選模擬:wrongCount >= threshold
const repeated2 = newToOld.filter((it) => it.wrongCount >= normalizeRepeatedThreshold("2"));
const repeated3 = newToOld.filter((it) => it.wrongCount >= normalizeRepeatedThreshold("3"));
assert.equal(repeated2.length, 1, "錯 2 次應符合門檻 2");
assert.equal(repeated3.length, 0, "錯 2 次不應符合門檻 3");

console.log("[wrongbook-filter] OK: threshold normalization and latest-wrong aggregation verified");
