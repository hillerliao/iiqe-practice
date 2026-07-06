// GET   /api/attempt?id=...   — 取作答完整資料
// PATCH /api/attempt          — 提交一題答案 / finish / favorite
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }
  const attempt = await prisma.attempt.findUnique({
    where: { id },
    include: {
      paper: true,
      answers: {
        include: { question: true },
        orderBy: { question: { number: "asc" } },
      },
    },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  // 單獨查詢此 attempt session 的筆記(避免 include 鏈中自引用)
  const noteMap = new Map<string, string>();
  if (attempt.answers.length > 0) {
    const noteRows = await prisma.note.findMany({
      where: {
        sessionId: attempt.sessionId,
        questionId: { in: attempt.answers.map((a) => a.questionId) },
      },
      select: { questionId: true, content: true },
    });
    for (const n of noteRows) {
      noteMap.set(n.questionId, n.content);
    }
  }
  // 查詢完整題目列表(用於跨 session 恢復進度時,不依賴瀏覽器存儲)
  const allQuestions = await prisma.question.findMany({
    where: { paperId: attempt.paperId, source: attempt.source ?? "exam" },
    orderBy: { number: "asc" },
  });
  return NextResponse.json({
    attempt: {
      ...attempt,
      allQuestions: allQuestions.map((q) => ({
        id: q.id,
        number: q.number,
        ref: q.ref,
        question: q.question,
        options: JSON.parse(q.options),
        answer: q.answer?.toLowerCase() ?? "",
        explanation: q.explanation,
        page: q.page,
      })),
      answers: attempt.answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect,
        timeSpentMs: a.timeSpentMs,
        note: noteMap.get(a.questionId) ?? null,
        question: {
          id: a.question.id,
          number: a.question.number,
          ref: a.question.ref,
          question: a.question.question,
          options: JSON.parse(a.question.options),
          answer: a.question.answer?.toLowerCase() ?? "",
          explanation: a.question.explanation,
          page: a.question.page,
        },
      })),
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
      const question = await prisma.question.findUnique({ where: { id: questionId } });
      if (!question) {
        return NextResponse.json({ error: "Question not found" }, { status: 404 });
      }
      const isCorrect = (userAnswer ?? "").toUpperCase() === question.answer.toUpperCase();
      const answer = await prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId: id, questionId } },
        create: {
          attemptId: id,
          questionId,
          userAnswer: userAnswer ?? "",
          isCorrect,
          timeSpentMs: timeSpentMs ?? null,
        },
        update: {
          userAnswer: userAnswer ?? "",
          isCorrect,
          timeSpentMs: timeSpentMs ?? null,
        },
      });
      return NextResponse.json({ answer, isCorrect });
    } catch (e) {
      console.error("[PATCH /api/attempt answer] 寫入失敗:", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "寫入答案失敗" },
        { status: 500 }
      );
    }
  }

  if (action === "finish") {
    const answers = await prisma.answer.findMany({ where: { attemptId: id } });
    const correct = answers.filter((a) => a.isCorrect).length;
    const attempt = await prisma.attempt.update({
      where: { id },
      data: { finishedAt: new Date(), correct },
    });
    return NextResponse.json({ attempt, correct, total: answers.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
