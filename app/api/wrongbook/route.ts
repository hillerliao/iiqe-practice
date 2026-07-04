// GET    /api/wrongbook?sessionId=... — 錯題本(此 session 答錯過的題)
// POST   /api/wrongbook — 手動加入錯題
// DELETE /api/wrongbook?sessionId=...&questionId=... — 從錯題本移除
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  // 找出此 session 所有答錯的題(同題多次作答,以最後一次為準)
  const answers = await prisma.answer.findMany({
    where: { attempt: { sessionId }, isCorrect: false },
    include: { question: { include: { paper: true } } },
    orderBy: { createdAt: "desc" },
  });

  // 統計每題在此 session 下的錯誤次數(跨多次 attempt 累積)
  const wrongCountMap = new Map<string, number>();
  for (const a of answers) {
    wrongCountMap.set(a.questionId, (wrongCountMap.get(a.questionId) ?? 0) + 1);
  }

  // 去重(同題以最新一次為準)
  const seen = new Set<string>();
  const unique: typeof answers = [];
  for (const a of answers) {
    if (seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    unique.push(a);
  }

  const items = unique.map((a) => ({
    questionId: a.questionId,
    userAnswer: a.userAnswer,
    correctAnswer: a.question.answer?.toLowerCase() ?? "",
    lastWrongAt: a.createdAt,
    wrongCount: wrongCountMap.get(a.questionId) ?? 1,
    paperCode: a.question.paper.code,
    paperName: a.question.paper.name,
    question: {
      id: a.question.id,
      number: a.question.number,
      ref: a.question.ref,
      question: a.question.question,
      options: JSON.parse(a.question.options),
      answer: a.question.answer?.toLowerCase() ?? "",
      explanation: a.question.explanation,
      page: a.question.page,
      source: a.question.source,
      sourceLabel: a.question.sourceLabel,
    },
  }));

  // 反覆錯(≥2 次)的題排前面,且按錯誤次數降序
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
    return NextResponse.json(
      { error: "sessionId, questionId 必填" },
      { status: 400 }
    );
  }
  // 錯題本以「最後一次答錯」為準,這裡僅記錄標記,
  // 實際內容由 GET 時從 answer 表彙整。此端點保留供未來擴充。
  const existing = await prisma.answer.findFirst({
    where: { attempt: { sessionId }, questionId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    ok: true,
    questionId,
    lastAnswer: existing
      ? { userAnswer: existing.userAnswer, isCorrect: existing.isCorrect }
      : null,
  });
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
  // 從錯題本移除 = 將此 session 下該題的錯誤作答紀錄刪除
  const result = await prisma.answer.deleteMany({
    where: {
      attempt: { sessionId },
      questionId,
      isCorrect: false,
    },
  });
  return NextResponse.json({ ok: true, deleted: result.count });
}
