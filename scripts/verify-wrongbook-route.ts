import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "verify-wrongbook-route-secret";
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

type WrongbookItem = {
  questionId: string;
  userAnswer: string;
  lastWrongAt: string;
  wrongCount: number;
};
type WrongbookResult = { count: number; repeatedCount: number; items: WrongbookItem[] };

async function main(): Promise<void> {
  const { GET } = await import("../app/api/wrongbook/route");
  const { POST } = await import("../app/api/wrongbook/record/route");
  const { SESSION_COOKIE, makePayload, signSession } = await import("../lib/auth");
  const { createAttempt } = await import("../lib/kv");
  const { getQuestionById } = await import("../lib/data");
  const { gradeAnswer, normalizeAnswer } = await import("../lib/grading");
  const { createWrongbookDraft, reconcileWrongbookDraft } = await import(
    "../lib/redo-practice-draft"
  );

  function cookieFor(sessionId: string): string {
    return `${SESSION_COOKIE}=${signSession(makePayload(sessionId, false))}`;
  }

  function getRequest(sessionId: string): NextRequest {
    return new NextRequest("http://localhost/api/wrongbook", {
      headers: { cookie: cookieFor(sessionId) },
    });
  }

  async function getWrongbook(sessionId: string): Promise<WrongbookResult> {
    const response = await GET(getRequest(sessionId));
    assert.equal(response.status, 200);
    return (await response.json()) as WrongbookResult;
  }

  const p1Id = "P1-exam-1";
  const p3Id = "P3-exam-321";
  const p1 = getQuestionById(p1Id);
  const p3 = getQuestionById(p3Id);
  assert.ok(p1 && p3, "fixture questions must exist");

  function wrongAnswerFor(questionId: string, exclude: string[] = []): string {
    const q = getQuestionById(questionId);
    assert.ok(q);
    const correct = q.answer.toLowerCase();
    const excluded = new Set([...exclude.map((letter) => letter.toLowerCase()), correct]);
    const candidate = ["a", "b", "c", "d"].find((letter) => !excluded.has(letter));
    assert.ok(candidate, "question must have an available wrong option");
    return candidate;
  }

  function makeAttempt(
    sessionId: string,
    paperId: string,
    startedAt: string,
    answers: { questionId: string; userAnswer: string; createdAt: string }[],
  ) {
    const records = answers.map((a) => {
      const q = getQuestionById(a.questionId);
      assert.ok(q);
      const normalized = normalizeAnswer(a.userAnswer);
      assert.ok(normalized);
      return {
        questionId: a.questionId,
        userAnswer: normalized,
        isCorrect: gradeAnswer(q, normalized),
        timeSpentMs: null,
        createdAt: a.createdAt,
      };
    });
    return {
      id: `verify_${crypto.randomUUID().replaceAll("-", "")}`,
      sessionId,
      paperId,
      mode: "practice",
      source: "practice",
      startedAt,
      finishedAt: startedAt,
      durationSec: null,
      totalQ: records.length,
      questionIds: records.map((r) => r.questionId),
      correct: records.filter((r) => r.isCorrect).length,
      answers: records,
    };
  }

  // 1) 最近錯誤聚合:即使舊 attempt 先被建立/回傳,也應取最近一次錯誤答案。
  {
    const sessionId = `wrongbook-order-${crypto.randomUUID()}`;
    const firstWrong = wrongAnswerFor(p1Id);
    const secondWrong = wrongAnswerFor(p1Id, [firstWrong]);
    await createAttempt(
      makeAttempt(sessionId, "P1", "2024-01-01T00:00:00.000Z", [
        { questionId: p1Id, userAnswer: firstWrong, createdAt: "2024-01-01T00:00:00.000Z" },
      ]),
    );
    await createAttempt(
      makeAttempt(sessionId, "P1", "2024-02-01T00:00:00.000Z", [
        { questionId: p1Id, userAnswer: secondWrong, createdAt: "2024-02-01T00:00:00.000Z" },
      ]),
    );
    const data = await getWrongbook(sessionId);
    assert.equal(data.count, 1);
    assert.equal(data.repeatedCount, 1);
    assert.equal(data.items[0]?.wrongCount, 2);
    assert.equal(
      data.items[0]?.userAnswer,
      secondWrong.toUpperCase(),
      "should expose latest wrong answer",
    );
    assert.equal(data.items[0]?.lastWrongAt, "2024-02-01T00:00:00.000Z");
  }

  // 2) 重做再次答錯會累計;同一 submissionId 重試不會重複累計。
  {
    const sessionId = `wrongbook-record-${crypto.randomUUID()}`;
    const firstWrong = wrongAnswerFor(p1Id);
    await createAttempt(
      makeAttempt(sessionId, "P1", "2024-01-01T00:00:00.000Z", [
        { questionId: p1Id, userAnswer: firstWrong, createdAt: "2024-01-01T00:00:00.000Z" },
      ]),
    );
    const before = await getWrongbook(sessionId);
    assert.equal(before.items[0]?.wrongCount, 1);

    const submissionId = `redo_route_${crypto.randomUUID().replaceAll("-", "")}`;
    const wrongAgain = wrongAnswerFor(p1Id, [firstWrong]);
    const body = JSON.stringify({
      submissionId,
      answers: [{ questionId: p1Id, userAnswer: wrongAgain }],
    });
    const recordOnce = () =>
      POST(
        new NextRequest("http://localhost/api/wrongbook/record", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: cookieFor(sessionId) },
          body,
        }),
      );

    const first = await recordOnce();
    assert.equal(first.status, 200);
    const replay = await recordOnce();
    assert.equal(replay.status, 200, "idempotent replay must succeed");

    const after = await getWrongbook(sessionId);
    assert.equal(after.items[0]?.wrongCount, 2, "redo wrong answer must increment once");
    assert.equal(after.repeatedCount, 1);
  }

  // 3) 重點重做草稿只包含篩選後題目;重新整理後不會擴大為全部錯題。
  {
    const allIds = [p1Id, p3Id];
    const repeatedIds = [p1Id];
    const draft = createWrongbookDraft(repeatedIds, false);
    const restored = reconcileWrongbookDraft(draft, allIds);
    assert.ok(restored);
    assert.deepEqual(restored.questionIds, repeatedIds);
    assert.equal(
      restored.questionIds.includes(p3Id),
      false,
      "focused redo draft must not expand to all wrong questions",
    );
  }

  console.log(
    "[wrongbook-route] OK: latest-wrong aggregation, redo count idempotency and focused draft verified",
  );
}

main().catch((error) => {
  console.error("[wrongbook-route] FAILED:", error);
  process.exit(1);
});
