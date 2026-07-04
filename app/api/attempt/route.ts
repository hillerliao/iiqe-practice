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
  return NextResponse.json({
    attempt: {
      ...attempt,
      answers: attempt.answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect,
        timeSpentMs: a.timeSpentMs,
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
