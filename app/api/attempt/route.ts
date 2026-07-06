import { NextRequest, NextResponse } from "next/server";
import { getAttempt, updateAttempt, getNote, listNotes, AnswerRecord } from "@/lib/kv";
import { getQuestionById, getQuestions } from "@/lib/data";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const attempt = await getAttempt(id);
  if (!attempt) {
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

  const allQuestions = getQuestions(attempt.paperId, attempt.source ?? "exam");

  return NextResponse.json({
    attempt: {
      ...attempt,
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
      const question = getQuestionById(questionId);
      if (!question) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
      }
      const isCorrect = (userAnswer ?? "").toUpperCase() === question.answer.toUpperCase();

      const attempt = await getAttempt(id);
      if (!attempt) {
        return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
      }

      const existingIdx = attempt.answers.findIndex((a) => a.questionId === questionId);
      const answerRecord: AnswerRecord = {
        questionId,
        userAnswer: userAnswer ?? "",
        isCorrect,
        timeSpentMs: timeSpentMs ?? null,
        createdAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        attempt.answers[existingIdx] = answerRecord;
      } else {
        attempt.answers.push(answerRecord);
      }

      await updateAttempt(id, { answers: attempt.answers });

      return NextResponse.json({ answer: answerRecord, isCorrect });
    } catch (e) {
      console.error("[PATCH /api/attempt answer] 寫入失敗:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "寫入答案失敗" },
        { status: 500 }
      );
    }
  }

  if (action === "finish") {
    const attempt = await getAttempt(id);
    if (!attempt) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }
    const correct = attempt.answers.filter((a) => a.isCorrect).length;
    await updateAttempt(id, { finishedAt: new Date().toISOString(), correct });
    return NextResponse.json({ attempt, correct, total: attempt.answers.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
