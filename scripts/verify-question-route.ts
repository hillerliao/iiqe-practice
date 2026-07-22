import assert from "node:assert/strict";

import { NextRequest } from "next/server";
import { GET } from "../app/api/question/route.ts";

async function getQuestion(id?: string): Promise<Response> {
  const url = new URL("http://localhost/api/question");
  if (id !== undefined) url.searchParams.set("id", id);
  return GET(new NextRequest(url));
}

async function expectJson(response: Response, status: number, body: unknown): Promise<void> {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), body);
}

async function main(): Promise<void> {
  const valid = await getQuestion("P3-mock-106");
  assert.equal(valid.status, 200);
  const validBody = await valid.json() as { question: { id: string; answer: string } };
  assert.equal(validBody.question.id, "P3-mock-106");
  assert.equal(validBody.question.answer, "b");

  for (const id of ["P1-exam-117", "P1-mock-594"] as const) {
    const response = await getQuestion(id);
    assert.equal(response.status, 200);
    const body = await response.json() as { question: { id: string; answer: string } };
    assert.equal(body.question.id, id);
    assert.equal(["a", "b", "c", "d"].includes(body.question.answer), true);
  }
  await expectJson(await getQuestion("missing-question"), 404, { error: "Question not found" });
  await expectJson(await getQuestion(), 400, { error: "id 必填" });

  console.log("Question route tests passed.");
}

main().catch((error) => {
  console.error("Question route tests failed:", error);
  process.exit(1);
});
