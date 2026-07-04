// POST /api/migrate — 把 fromSessionId 的所有資料遷移到 toSessionId
// 遷移範圍:Attempt(含 Answer via cascade)、Favorite
// 衝突處理(Favorite 同 questionId):保留 to 的,刪除 from 的
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fromSessionId, toSessionId } = body;

  if (!fromSessionId || !toSessionId) {
    return NextResponse.json(
      { error: "fromSessionId, toSessionId 必填" },
      { status: 400 }
    );
  }
  if (fromSessionId === toSessionId) {
    return NextResponse.json({ ok: true, migrated: { attempts: 0, favorites: 0 }, message: "來源與目標相同,無需遷移" });
  }

  // 用交易確保原子性
  const result = await prisma.$transaction(async (tx) => {
    // 1. 遷移 Attempt(Answer 透過 attemptId cascade,自動跟著)
    const attemptResult = await tx.attempt.updateMany({
      where: { sessionId: fromSessionId },
      data: { sessionId: toSessionId },
    });

    // 2. 遷移 Favorite — 先處理衝突(同 questionId 已存在於 to)
    const toFavs = await tx.favorite.findMany({
      where: { sessionId: toSessionId },
      select: { questionId: true },
    });
    const fromFavs = await tx.favorite.findMany({
      where: { sessionId: fromSessionId },
      select: { questionId: true },
    });
    const toQuestionIds = new Set(toFavs.map((f) => f.questionId));
    const conflictQuestionIds = fromFavs
      .map((f) => f.questionId)
      .filter((qid) => toQuestionIds.has(qid));

    if (conflictQuestionIds.length > 0) {
      // 刪除 from 中與 to 衝突的(保留 to 既有的)
      await tx.favorite.deleteMany({
        where: {
          sessionId: fromSessionId,
          questionId: { in: conflictQuestionIds },
        },
      });
    }

    // 更新其餘的 from → to
    const favResult = await tx.favorite.updateMany({
      where: { sessionId: fromSessionId },
      data: { sessionId: toSessionId },
    });

    return {
      attempts: attemptResult.count,
      favorites: favResult.count,
      conflicts: conflictQuestionIds.length,
    };
  });

  return NextResponse.json({ ok: true, migrated: result });
}
