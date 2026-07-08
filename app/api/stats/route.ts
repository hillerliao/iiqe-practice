// GET /api/stats?sessionId=... — 統計:總作答、總正確率、各 ref 表現
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  // 取此 session 所有作答(排除錯題本重做)
  const answers = await prisma.answer.findMany({
    where: { attempt: { sessionId, source: { not: "wrongbook-redo" } } },
    include: {
      question: true,
      attempt: { include: { paper: true } },
    },
  });

  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const accuracy = total > 0 ? correct / total : 0;

  // 各 ref prefix(取前兩段 X.Y),依 (paperCode, ref) 區分不同卷別
  const refGroups: Record<string, { paperCode: string; total: number; correct: number }> = {};
  for (const a of answers) {
    const ref = a.question.ref || "其他";
    const prefix = ref.split(".").slice(0, 2).join("."); // "1.1.2a" → "1.1"
    const paperCode = a.attempt.paper.code;
    const key = `${paperCode}::${prefix}`;
    if (!refGroups[key]) refGroups[key] = { paperCode, total: 0, correct: 0 };
    refGroups[key].total++;
    if (a.isCorrect) refGroups[key].correct++;
  }
  const refStats = Object.entries(refGroups)
    .map(([key, v]) => ({
      ref: key.split("::")[1],
      paperCode: v.paperCode,
      total: v.total,
      correct: v.correct,
      accuracy: v.total > 0 ? v.correct / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // 各 paper 表現
  const paperGroups: Record<string, { name: string; total: number; correct: number }> = {};
  for (const a of answers) {
    const code = a.attempt.paperId;
    if (!paperGroups[code]) paperGroups[code] = { name: "", total: 0, correct: 0 };
    paperGroups[code].total++;
    if (a.isCorrect) paperGroups[code].correct++;
  }
  // 補 paper name
  const papers = await prisma.paper.findMany();
  for (const p of papers) {
    if (paperGroups[p.id]) paperGroups[p.id].name = p.name;
  }

  // 最近 10 次 attempts
  // 即時從 Answer 表聚合 correct(避免未交卷 attempt 的 Attempt.correct=0 誤判)
  const recent = await prisma.attempt.findMany({
    where: { sessionId, source: { not: "wrongbook-redo" } },
    orderBy: { startedAt: "desc" },
    take: 10,
    include: {
      paper: true,
      answers: {
        select: {
          isCorrect: true,
          question: { select: { number: true } },
        },
      },
    },
  });
  // 統計未交卷的 session 數(給前端提示用)
  const unfinishedCount = recent.filter((a) => a.finishedAt == null).length;

  return NextResponse.json({
    total,
    correct,
    accuracy,
    refStats,
    paperStats: Object.entries(paperGroups).map(([id, v]) => ({
      paperId: id,
      name: v.name,
      total: v.total,
      correct: v.correct,
      accuracy: v.total > 0 ? v.correct / v.total : 0,
    })),
    recentAttempts: recent.map((a) => {
      const liveCorrect = a.answers.filter((x) => x.isCorrect).length;
      // 取得這個 session 作答過的題目序號(去重並由小到大)
      const questionNumbers = Array.from(
        new Set(a.answers.map((x) => x.question.number))
      ).sort((x, y) => x - y);
      return {
        id: a.id,
        paperName: a.paper.name,
        paperCode: a.paper.code,
        mode: a.mode,
        source: a.source,
        totalQ: a.totalQ,
        answeredCount: a.answers.length, // 實際已作答題數
        correct: liveCorrect, // 即時算,不再讀 Attempt.correct
        questionNumbers,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
      };
    }),
    unfinishedCount,
  });
}
