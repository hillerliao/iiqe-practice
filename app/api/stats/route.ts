import { NextRequest, NextResponse } from "next/server";
import { listAttempts } from "@/lib/kv";
import { getQuestionById, getPapers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  // 排除錯題本重做練習(source=wrongbook-redo),避免復習刷題污染總正確率
  const attempts = (await listAttempts(sessionId)).filter(
    (a) => a.source !== "wrongbook-redo"
  );
  const papers = getPapers();

  const allAnswers = attempts.flatMap((at) =>
    at.answers.map((a) => ({
      ...a,
      paperId: at.paperId,
      paperCode: at.paperId,
      startedAt: at.startedAt,
    }))
  );

  const total = allAnswers.length;
  const correct = allAnswers.filter((a) => a.isCorrect).length;
  const accuracy = total > 0 ? correct / total : 0;

  const refGroups: Record<string, { paperCode: string; total: number; correct: number }> = {};
  for (const a of allAnswers) {
    const q = getQuestionById(a.questionId);
    if (!q) continue;
    const ref = q.ref || "其他";
    const prefix = ref.split(".").slice(0, 2).join(".");
    const paperCode = q.id.split("-")[0];
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
    .sort((a, b) => {
      if (a.paperCode !== b.paperCode) return a.paperCode.localeCompare(b.paperCode);
      const aParts = a.ref.split(".").map(Number);
      const bParts = b.ref.split(".").map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (aParts[i] || 0) - (bParts[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

  const paperGroups: Record<string, { name: string; total: number; correct: number }> = {};
  for (const a of allAnswers) {
    const pid = a.paperId;
    if (!paperGroups[pid]) paperGroups[pid] = { name: "", total: 0, correct: 0 };
    paperGroups[pid].total++;
    if (a.isCorrect) paperGroups[pid].correct++;
  }
  for (const p of papers) {
    if (paperGroups[p.id]) paperGroups[p.id].name = p.name;
  }

  const recent = attempts
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 10);

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
      const questionNumbers = Array.from(
        new Set(a.answers.map((x) => {
          const q = getQuestionById(x.questionId);
          return q?.number ?? 0;
        }))
      ).sort((x, y) => x - y);
      const liveCorrect = a.answers.filter((x) => x.isCorrect).length;
      const paper = papers.find((p) => p.id === a.paperId);
      return {
        id: a.id,
        paperName: paper?.name ?? "",
        paperCode: paper?.code ?? "",
        mode: a.mode,
        source: a.source,
        totalQ: a.totalQ,
        answeredCount: a.answers.length,
        correct: liveCorrect,
        questionNumbers,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
      };
    }),
    unfinishedCount,
  });
}
