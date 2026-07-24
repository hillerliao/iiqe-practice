import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "verify-wrongbook-record-secret";
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || "memory";

type RequestAnswer = { questionId: string; userAnswer: string };
type JsonResult = { ok?: boolean; recorded?: number; error?: string };

async function main(): Promise<void> {
  const { POST } = await import("../app/api/wrongbook/record/route");
  const { SESSION_COOKIE, makePayload, signSession } = await import("../lib/auth");
  const { listAttempts } = await import("../lib/kv");
  const { getQuestionById } = await import("../lib/data");

  function cookieFor(sessionId: string): string {
    return `${SESSION_COOKIE}=${signSession(makePayload(sessionId, false))}`;
  }

  function makeRequest(sessionId: string, body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/wrongbook/record", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieFor(sessionId) },
      body: JSON.stringify(body),
    });
  }

  function makeRawRequest(sessionId: string, body: string): NextRequest {
    return new NextRequest("http://localhost/api/wrongbook/record", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieFor(sessionId) },
      body,
    });
  }

  async function submit(sessionId: string, body: unknown) {
    const response = await POST(makeRequest(sessionId, body));
    return { status: response.status, body: (await response.json()) as JsonResult };
  }

  function answerFor(questionId: string): string {
    const question = getQuestionById(questionId);
    assert.ok(question, `missing fixture question ${questionId}`);
    return question.answer;
  }

  function differentAnswer(answer: string): string {
    return ["a", "b", "c", "d"].find((candidate) => candidate !== answer.toLowerCase()) ?? "a";
  }

  const p1Id = "P1-exam-1";
  const p3Id = "P3-exam-321";
  const p1Answer = answerFor(p1Id);
  const p3Answer = answerFor(p3Id);

  const invalidShape = await submit(`route-invalid-shape-${crypto.randomUUID()}`, []);
  assert.equal(invalidShape.status, 400, "JSON arrays must not be accepted as request objects");

  const malformedJsonResponse = await POST(
    makeRawRequest(`route-malformed-json-${crypto.randomUUID()}`, "{"),
  );
  assert.equal(malformedJsonResponse.status, 400, "malformed JSON must be rejected");

  const invalid = await submit(`route-invalid-${crypto.randomUUID()}`, {
    submissionId: "INVALID",
    answers: [{ questionId: p1Id, userAnswer: p1Answer }],
  });
  assert.equal(invalid.status, 400, "malformed submissionId must be rejected");

  const duplicate = await submit(`route-duplicate-${crypto.randomUUID()}`, {
    submissionId: `redo_duplicate_${crypto.randomUUID().replaceAll("-", "")}`,
    answers: [
      { questionId: p1Id, userAnswer: p1Answer },
      { questionId: p1Id, userAnswer: p1Answer },
    ],
  });
  assert.equal(duplicate.status, 400, "duplicate questionId must be rejected");

  {
    const sessionId = `route-legacy-${crypto.randomUUID()}`;
    const legacy = await submit(sessionId, {
      answers: [{ questionId: p1Id, userAnswer: p1Answer }],
    });
    assert.equal(legacy.status, 200, "missing submissionId must retain legacy behavior");
    assert.equal((await listAttempts(sessionId)).length, 1);
  }

  {
    const sessionId = `route-replay-${crypto.randomUUID()}`;
    const submissionId = `redo_replay_${crypto.randomUUID().replaceAll("-", "")}`;
    const body = { submissionId, answers: [{ questionId: p1Id, userAnswer: p1Answer }] };
    assert.equal((await submit(sessionId, body)).status, 200);
    assert.equal((await submit(sessionId, body)).status, 200);
    assert.equal((await listAttempts(sessionId)).length, 1, "sequential replay must create once");
  }

  {
    const sessionId = `route-concurrent-${crypto.randomUUID()}`;
    const submissionId = `redo_concurrent_${crypto.randomUUID().replaceAll("-", "")}`;
    const body = { submissionId, answers: [{ questionId: p1Id, userAnswer: p1Answer }] };
    const results = await Promise.all(Array.from({ length: 12 }, () => submit(sessionId, body)));
    assert.ok(results.every((result) => result.status === 200));
    const attempts = await listAttempts(sessionId);
    assert.equal(attempts.length, 1, "identical concurrent requests must create once");
    assert.equal(attempts[0]?.answers.length, 1);
  }

  {
    const sessionId = `route-conflict-${crypto.randomUUID()}`;
    const submissionId = `redo_conflict_${crypto.randomUUID().replaceAll("-", "")}`;
    const original: RequestAnswer[] = [{ questionId: p1Id, userAnswer: p1Answer }];
    const changed: RequestAnswer[] = [{ questionId: p1Id, userAnswer: differentAnswer(p1Answer) }];
    assert.equal((await submit(sessionId, { submissionId, answers: original })).status, 200);
    assert.equal((await submit(sessionId, { submissionId, answers: changed })).status, 409);
    const attempts = await listAttempts(sessionId);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.answers[0]?.userAnswer, p1Answer.toUpperCase());
  }

  {
    const sessionId = `route-conflict-race-${crypto.randomUUID()}`;
    const submissionId = `redo_conflict_race_${crypto.randomUUID().replaceAll("-", "")}`;
    const firstBody = {
      submissionId,
      answers: [{ questionId: p1Id, userAnswer: p1Answer }],
    };
    const secondAnswer = differentAnswer(p1Answer);
    const secondBody = {
      submissionId,
      answers: [{ questionId: p1Id, userAnswer: secondAnswer }],
    };
    const results = await Promise.all([
      submit(sessionId, firstBody),
      submit(sessionId, secondBody),
    ]);
    assert.deepEqual(
      results.map((result) => result.status).sort(),
      [200, 409],
      "different concurrent payloads must have one winner and one conflict",
    );
    const attempts = await listAttempts(sessionId);
    assert.equal(attempts.length, 1);
    assert.ok(
      [p1Answer.toUpperCase(), secondAnswer.toUpperCase()].includes(
        attempts[0]?.answers[0]?.userAnswer ?? "",
      ),
    );
  }

  {
    const submissionId = `redo_isolated_${crypto.randomUUID().replaceAll("-", "")}`;
    const firstSession = `route-session-a-${crypto.randomUUID()}`;
    const secondSession = `route-session-b-${crypto.randomUUID()}`;
    const body = { submissionId, answers: [{ questionId: p1Id, userAnswer: p1Answer }] };
    assert.equal((await submit(firstSession, body)).status, 200);
    assert.equal((await submit(secondSession, body)).status, 200);
    const firstAttempts = await listAttempts(firstSession);
    const secondAttempts = await listAttempts(secondSession);
    assert.equal(firstAttempts.length, 1);
    assert.equal(secondAttempts.length, 1);
    assert.notEqual(firstAttempts[0]?.id, secondAttempts[0]?.id);
  }

  {
    const sessionId = `route-partial-${crypto.randomUUID()}`;
    const submissionId = `redo_partial_${crypto.randomUUID().replaceAll("-", "")}`;
    assert.equal((await submit(sessionId, {
      submissionId,
      answers: [{ questionId: p1Id, userAnswer: p1Answer }],
    })).status, 200);
    const retry = await submit(sessionId, {
      submissionId,
      answers: [
        { questionId: p1Id, userAnswer: p1Answer },
        { questionId: p3Id, userAnswer: p3Answer },
      ],
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.recorded, 2);
    const attempts = await listAttempts(sessionId);
    assert.equal(attempts.length, 2, "retry after partial success must fill missing paper");
    assert.deepEqual(new Set(attempts.map((attempt) => attempt.paperId)), new Set(["P1", "P3"]));
  }

  console.log(
    "[wrongbook-record-route] OK: validation, legacy fallback, isolation, replay, conflict and retry verified",
  );
}

main().catch((error) => {
  console.error("[wrongbook-record-route] FAILED:", error);
  process.exit(1);
});
