// POST /api/attempts — 建立作答 session
// GET  /api/attempts?sessionId=... — 列出歷史
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, paperId, mode, source, durationSec, questionIds, fromAttemptId } = body;

  // 「重做」模式:不傳 questionIds,改從既有 attempt 的 Answer 記錄撈
  let finalQuestionIds: string[] = questionIds;
  let finalPaperId = paperId;
  let finalMode = mode;
  let finalSource = source;
  let finalDurationSec = durationSec;

  if (fromAttemptId) {
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId 必填" },
        { status: 400 }
      );
    }
    const src = await prisma.attempt.findUnique({
      where: { id: fromAttemptId },
      include: {
        answers: { select: { questionId: true } },
      },
    });
    if (!src) {
      return NextResponse.json(
        { error: "來源 attempt 找不到" },
        { status: 404 }
      );
    }
    finalQuestionIds = src.answers.map((a) => a.questionId);
    finalPaperId = src.paperId;
    finalMode = src.mode;
    finalSource = src.source;
    finalDurationSec = src.durationSec;
  }

  if (!sessionId || !finalPaperId || !Array.isArray(finalQuestionIds) || finalQuestionIds.length === 0) {
    return NextResponse.json(
      { error: "sessionId, paperId, questionIds[] 必填(fromAttemptId 模式需有作答記錄)" },
      { status: 400 }
    );
  }

  const attempt = await prisma.attempt.create({
    data: {
      sessionId,
      paperId: finalPaperId,
      mode: finalMode ?? "exam",
      source: finalSource ?? "exam",
      durationSec: finalDurationSec ?? null,
      totalQ: finalQuestionIds.length,
    },
  });

  // 「重做」模式下,同步回傳題目完整資料,讓前端可以預先存到 sessionStorage
  // (避免 practice 頁 fallback 抓到整卷題目而非本次子集)
  let questions: Array<{
    id: string;
    number: number;
    ref: string;
    question: string;
    options: Record<string, string>;
    answer: string;
    explanation: string | null;
    page: number | null;
  }> | undefined;
  if (fromAttemptId) {
    const qs = await prisma.question.findMany({
      where: { id: { in: finalQuestionIds } },
    });
    // 保持與原 attempt 一致的題目順序
    const byId = new Map(qs.map((q) => [q.id, q]));
    questions = finalQuestionIds
      .map((qid) => byId.get(qid))
      .filter((q): q is NonNullable<typeof q> => q != null)
      .map((q) => ({
        id: q.id,
        number: q.number,
        ref: q.ref,
        question: q.question,
        options: JSON.parse(q.options),
        answer: q.answer?.toLowerCase() ?? "",
        explanation: q.explanation,
        page: q.page,
      }));
  }

  return NextResponse.json({ attempt, questions });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  const unfinished = url.searchParams.get("unfinished") === "1";
  const paperId = url.searchParams.get("paperId");
  const source = url.searchParams.get("source");

  const where: {
    sessionId: string;
    finishedAt: null;
    paperId?: string;
    source?: string;
  } = { sessionId, finishedAt: null };

  if (unfinished) {
    if (paperId) where.paperId = paperId;
    if (source) where.source = source;
    // 取最近一筆未完成的 attempt
    const attempt = await prisma.attempt.findFirst({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        paper: true,
        answers: { select: { questionId: true, userAnswer: true } },
      },
    });

    // 額外撈出此 session 在此 paper/source 曾經作答過的最大題目序號,
    // 作為新開 session 的「從第幾題開始」欄位預設值
    let latestAnsweredNumber: number | null = null;
    if (paperId) {
      const latest = await prisma.answer.findFirst({
        where: {
          attempt: {
            sessionId,
            paperId,
            ...(source ? { source } : {}),
          },
        },
        orderBy: { question: { number: "desc" } },
        select: { question: { select: { number: true } } },
      });
      latestAnsweredNumber = latest?.question.number ?? null;
    }

    return NextResponse.json({ attempt, latestAnsweredNumber });
  }

  const attempts = await prisma.attempt.findMany({
    where: { sessionId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { paper: true },
  });
  return NextResponse.json({ attempts });
}
