import { NextRequest, NextResponse } from "next/server";
import { listAttempts } from "@/lib/kv";
import { getQuestionByIdAsync, getPapersAsync } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { aggregateChapterStats } from "@/lib/stats-aggregation";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  // 排除錯題本重做練習(source=wrongbook-redo),避免復習刷題污染總正確率
  const attempts = (await listAttempts(sessionId)).filter(
    (a) => a.source !== "wrongbook-redo"
  );
  const papers = await getPapersAsync();

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

  const refStats = aggregateChapterStats(
    (
      await Promise.all(
        allAnswers.map(async (answer) => {
          const question = await getQuestionByIdAsync(answer.questionId);
          if (!question) return null;
          return {
            paperCode: question.id.split("-")[0],
            ref: question.ref,
            isCorrect: answer.isCorrect,
          };
        })
      )
    ).filter((answer) => answer !== null)
  );

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
    recentAttempts: await Promise.all(
      recent.map(async (a) => {
        const questionNumbers = Array.from(
          new Set(
            await Promise.all(
              a.answers.map(async (x) => {
                const q = await getQuestionByIdAsync(x.questionId);
                return q?.number ?? 0;
              })
            )
          )
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
      })
    ),
    unfinishedCount,
  });
}
