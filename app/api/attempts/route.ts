// POST /api/attempts — 建立作答 session
// GET  /api/attempts?sessionId=... — 列出歷史
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, paperId, mode, source, durationSec, questionIds } = body;

  if (!sessionId || !paperId || !Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json(
      { error: "sessionId, paperId, questionIds[] 必填" },
      { status: 400 }
    );
  }

  const attempt = await prisma.attempt.create({
    data: {
      sessionId,
      paperId,
      mode: mode ?? "exam",
      source: source ?? "exam",
      durationSec: durationSec ?? null,
      totalQ: questionIds.length,
    },
  });

  return NextResponse.json({ attempt });
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
    return NextResponse.json({ attempt });
  }

  const attempts = await prisma.attempt.findMany({
    where: { sessionId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { paper: true },
  });
  return NextResponse.json({ attempts });
}
