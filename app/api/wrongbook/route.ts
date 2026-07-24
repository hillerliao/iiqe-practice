import { NextRequest, NextResponse } from "next/server";
import { listAttempts, updateAttempt } from "@/lib/kv";
import { getQuestionById, getPapers } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { buildWrongbookItems } from "@/lib/wrongbook";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const attempts = await listAttempts(sessionId);
  const items = buildWrongbookItems(attempts, getQuestionById, getPapers());

  return NextResponse.json({
    count: items.length,
    repeatedCount: items.filter((it) => it.wrongCount >= 2).length,
    items,
  });
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;
  const body = await req.json();
  const { questionId } = body;
  if (!questionId) {
    return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
  }

  const attempts = await listAttempts(sessionId);
  let lastAnswer: { userAnswer: string; isCorrect: boolean } | null = null;
  for (const at of attempts) {
    const found = at.answers.find((a) => a.questionId === questionId);
    if (found) lastAnswer = { userAnswer: found.userAnswer, isCorrect: found.isCorrect };
  }

  return NextResponse.json({ ok: true, questionId, lastAnswer });
}

export async function DELETE(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;
  const url = new URL(req.url);
  const questionId = url.searchParams.get("questionId");
  if (!questionId) {
    return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
  }

  const attempts = await listAttempts(sessionId);
  let deleted = 0;
  for (const at of attempts) {
    const before = at.answers.length;
    at.answers = at.answers.filter(
      (a) => !(a.questionId === questionId && !a.isCorrect)
    );
    if (at.answers.length !== before) {
      deleted += before - at.answers.length;
      await updateAttempt(at.id, { answers: at.answers });
    }
  }

  return NextResponse.json({ ok: true, deleted });
}
