// POST /api/wrongbook/record — 將「錯題本 · 重做練習」的作答寫入作答紀錄
//
// 目的:讓使用者在錯題本重做時「又錯了」能被記錄,使 wrongCount(反覆錯標籤)
// 正確累積。這些紀錄標記 source = "wrongbook-redo"。統計頁(/api/stats)會
// 將其排除,避免污染總正確率;但錯題本 GET 仍會計入(其查詢僅過濾 isCorrect:false)。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const REDO_SOURCE = "wrongbook-redo";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { sessionId?: string; answers?: Record<string, string> };
  const { sessionId, answers } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }
  if (!answers || Object.keys(answers).length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  // 只處理有實際作答(非空)的題目
  const valid = Object.entries(answers).filter(
    ([qId, userAns]) => qId && typeof userAns === "string" && userAns.trim() !== ""
  ) as [string, string][];
  if (valid.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  const questionIds = valid.map(([qId]) => qId);

  // 查詢各題的 paperId 與正確答案
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, paperId: true, answer: true },
  });
  const qMeta = new Map<string, { paperId: string; answer: string }>(
    questions.map((q: { id: string; paperId: string; answer: string }) => [q.id, { paperId: q.paperId, answer: q.answer }])
  );

  // 依 paperId 分組
  const byPaper = new Map<string, { questionId: string; userAnswer: string }[]>();
  for (const [qId, userAnswer] of valid) {
    const meta = qMeta.get(qId);
    if (!meta) continue; // 題目不存在,跳過
    const paperId = meta.paperId;
    if (!byPaper.has(paperId)) byPaper.set(paperId, []);
    byPaper.get(paperId)!.push({ questionId: qId, userAnswer });
  }

  // 驗證 paper 存在，防止 FK constraint 失敗
  const paperIds = Array.from(byPaper.keys());
  const existingPapers = await prisma.paper.findMany({
    where: { id: { in: paperIds } },
    select: { id: true },
  });
  const validPaperIds = new Set(existingPapers.map((p: { id: string }) => p.id));

  const now = new Date();
  let recorded = 0;

  for (const [paperId, list] of byPaper) {
    if (list.length === 0) continue;
    // 跳過不存在的 paper，避免 FK 違規
    if (!validPaperIds.has(paperId)) {
      console.warn(`[wrongbook/record] 跳過不存在的 paper: ${paperId}`);
      continue;
    }

    let correctCount = 0;
    const answerRecords = list.map((a) => {
      const meta = qMeta.get(a.questionId)!;
      const isCorrect =
        a.userAnswer.toUpperCase() === meta.answer.toUpperCase();
      if (isCorrect) correctCount++;
      return {
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        isCorrect,
        timeSpentMs: null as number | null,
      };
    });

    // 創建 Attempt 記錄
    try {
      const attempt = await prisma.attempt.create({
        data: {
          sessionId,
          paperId,
          mode: REDO_SOURCE,
          source: REDO_SOURCE,
          startedAt: now,
          finishedAt: now,
          totalQ: list.length,
          correct: correctCount,
        },
      });

      // 批量創建 Answer 記錄
      await prisma.answer.createMany({
        data: answerRecords.map((a) => ({
          attemptId: attempt.id,
          questionId: a.questionId,
          userAnswer: a.userAnswer,
          isCorrect: a.isCorrect,
          timeSpentMs: a.timeSpentMs,
        })),
      });

      recorded += list.length;
    } catch (e) {
      console.error(`[wrongbook/record] 寫入 paper ${paperId} 失敗:`, e);
    }
  }

  return NextResponse.json({ ok: true, recorded });
}
