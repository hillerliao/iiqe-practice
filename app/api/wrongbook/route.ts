import { NextRequest, NextResponse } from "next/server";
import { listAttempts, updateAttempt } from "@/lib/kv";
import { getQuestionById, getPapers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  const attempts = await listAttempts(sessionId);
  const papers = getPapers();

  const wrongAnswers = attempts.flatMap((at) =>
    at.answers
      .filter((a) => !a.isCorrect)
      .map((a) => ({
        ...a,
        paperId: at.paperId,
        startedAt: at.startedAt,
      }))
  );

  const wrongCountMap = new Map<string, number>();
  for (const a of wrongAnswers) {
    wrongCountMap.set(a.questionId, (wrongCountMap.get(a.questionId) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const unique: typeof wrongAnswers = [];
  for (const a of wrongAnswers) {
    if (seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    unique.push(a);
  }

  const items = unique.map((a) => {
    const q = getQuestionById(a.questionId);
    if (!q) return null;
    const paper = papers.find((p) => p.id === q.id.split("-")[0]);
    return {
      questionId: a.questionId,
      userAnswer: a.userAnswer,
      correctAnswer: q.answer?.toLowerCase() ?? "",
      lastWrongAt: a.createdAt ?? a.startedAt,
      wrongCount: wrongCountMap.get(a.questionId) ?? 1,
      paperCode: paper?.code ?? "",
      paperName: paper?.name ?? "",
      note: null,
      question: {
        id: q.id,
        number: q.number,
        ref: q.ref,
        question: q.question,
        options: q.options,
        answer: q.answer?.toLowerCase() ?? "",
        explanation: q.explanation,
        page: q.page,
        source: q.source,
        sourceLabel: q.sourceLabel,
      },
    };
  }).filter((it): it is NonNullable<typeof it> => it != null);

  items.sort((a, b) => b.wrongCount - a.wrongCount);

  return NextResponse.json({
    count: items.length,
    repeatedCount: items.filter((it) => it.wrongCount >= 2).length,
    items,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, questionId } = body;
  if (!sessionId || !questionId) {
    return NextResponse.json({ error: "sessionId, questionId 必填" }, { status: 400 });
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
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const questionId = url.searchParams.get("questionId");
  if (!sessionId || !questionId) {
    return NextResponse.json({ error: "sessionId, questionId 必填" }, { status: 400 });
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
