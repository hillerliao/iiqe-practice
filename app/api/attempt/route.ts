import { NextRequest, NextResponse } from "next/server";
import { getAttempt, getNote, getPaperCode, listNotes } from "@/lib/kv";
import { finishAttempt, submitAnswer, DomainError } from "@/lib/attempt-service";
import { getQuestionById, getQuestions, getPapers } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const attempt = await getAttempt(id);
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  // H2: 僅允許擁有者讀取自己的作答(含逐題筆記)
  if (attempt.sessionId !== session.sessionId) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const noteMap = new Map<string, string>();
  if (attempt.answers.length > 0) {
    const questionIds = attempt.answers.map((a) => a.questionId);
    const notes = await listNotes(attempt.sessionId, questionIds);
    for (const [qid, n] of Object.entries(notes)) {
      noteMap.set(qid, n.content);
    }
  }

  const paperCode = (await getPaperCode(attempt.paperId)) ?? attempt.paperId;
  const allQuestions = (attempt.questionIds.length > 0
    ? attempt.questionIds.map((qid) => getQuestionById(qid)).filter((q): q is NonNullable<typeof q> => q != null)
    : getQuestions(paperCode, attempt.source ?? "exam"));
  const paperInfo = getPapers().find((p) => p.code === paperCode || p.id === attempt.paperId);

  return NextResponse.json({
    attempt: {
      ...attempt,
      paper: paperInfo ? { name: paperInfo.name, code: paperInfo.code } : { name: attempt.paperId, code: attempt.paperId },
      allQuestions: allQuestions.map((q) => ({
        id: q.id,
        number: q.number,
        ref: q.ref,
        question: q.question,
        options: q.options,
        answer: q.answer?.toLowerCase() ?? "",
        explanation: q.explanation,
        page: q.page,
      })),
      answers: attempt.answers.map((a) => {
        const q = getQuestionById(a.questionId);
        return {
          id: `${a.questionId}_${id}`,
          questionId: a.questionId,
          userAnswer: a.userAnswer,
          isCorrect: a.isCorrect,
          timeSpentMs: a.timeSpentMs,
          note: noteMap.get(a.questionId) ?? null,
          question: q ? {
            id: q.id,
            number: q.number,
            ref: q.ref,
            question: q.question,
            options: q.options,
            answer: q.answer?.toLowerCase() ?? "",
            explanation: q.explanation,
            page: q.page,
          } : null,
        };
      }),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await req.json();
  const { action, id } = body;
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  if (action === "answer") {
    const { questionId, userAnswer, timeSpentMs } = body;
    if (!questionId) {
      return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
    }
    try {
      const answerRecord = await submitAnswer({
        sessionId: session.sessionId,
        attemptId: id,
        questionId,
        userAnswer: userAnswer ?? "",
        timeSpentMs: timeSpentMs ?? null,
      });
      return NextResponse.json({ answer: answerRecord, isCorrect: answerRecord.isCorrect });
    } catch (e) {
      console.error("[PATCH /api/attempt answer] 寫入失敗:", e);
      if (e instanceof DomainError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "寫入答案失敗" },
        { status: 500 }
      );
    }
  }

  if (action === "finish") {
    try {
      const attempt = await finishAttempt(session.sessionId, id);
      return NextResponse.json({ attempt, correct: attempt.correct, total: attempt.answers.length });
    } catch (e) {
      if (e instanceof DomainError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      throw e;
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
