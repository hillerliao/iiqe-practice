// GET    /api/favorites?sessionId=... — 收藏題
// POST   /api/favorites — 加入收藏
// DELETE /api/favorites?sessionId=...&questionId=... — 移除
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  const favs = await prisma.favorite.findMany({
    where: { sessionId },
    include: { question: { include: { paper: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    count: favs.length,
    items: favs.map((f) => ({
      questionId: f.questionId,
      createdAt: f.createdAt,
      paperCode: f.question.paper.code,
      paperName: f.question.paper.name,
      question: {
        id: f.question.id,
        number: f.question.number,
        ref: f.question.ref,
        question: f.question.question,
        options: JSON.parse(f.question.options),
        answer: f.question.answer?.toLowerCase() ?? "",
        explanation: f.question.explanation,
        page: f.question.page,
        source: f.question.source,
        sourceLabel: f.question.sourceLabel,
      },
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, questionId } = body;
  if (!sessionId || !questionId) {
    return NextResponse.json(
      { error: "sessionId, questionId 必填" },
      { status: 400 }
    );
  }
  const fav = await prisma.favorite.upsert({
    where: { sessionId_questionId: { sessionId, questionId } },
    create: { sessionId, questionId },
    update: {},
  });
  return NextResponse.json({ favorite: fav });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const questionId = url.searchParams.get("questionId");
  if (!sessionId || !questionId) {
    return NextResponse.json(
      { error: "sessionId, questionId 必填" },
      { status: 400 }
    );
  }
  await prisma.favorite.deleteMany({
    where: { sessionId, questionId },
  });
  return NextResponse.json({ ok: true });
}
