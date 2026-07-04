// GET /api/questions?paperCode=P1&source=exam&shuffle=1&limit=348
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("paperCode");
  const source = url.searchParams.get("source") ?? "exam";
  const shuffle = url.searchParams.get("shuffle") === "1";
  const limit = parseInt(url.searchParams.get("limit") ?? "9999", 10);

  if (!code) {
    return NextResponse.json({ error: "paperCode 必填" }, { status: 400 });
  }

  const paper = await prisma.paper.findUnique({ where: { code } });
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const questions = await prisma.question.findMany({
    where: { paperId: paper.id, source },
    orderBy: { number: "asc" },
    take: limit,
  });

  let ordered = questions;
  if (shuffle) {
    // Fisher-Yates 洗牌,確保均勻分布
    ordered = [...questions];
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }

  return NextResponse.json({
    paper: { id: paper.id, code: paper.code, name: paper.name },
    source,
    total: questions.length,
    questions: ordered.map((q) => ({
      id: q.id,
      number: q.number,
      ref: q.ref,
      question: q.question,
      options: JSON.parse(q.options),
      answer: q.answer?.toLowerCase() ?? "",
      explanation: q.explanation,
      page: q.page,
      source: q.source,
      sourceLabel: q.sourceLabel,
    })),
  });
}
