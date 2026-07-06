// POST /api/migrate — 把 fromSessionId 的所有資料遷移到 toSessionId
// 遷移範圍:Attempt(含 Answer via cascade)、Favorite、Note
// 衝突處理(Favorite/Note 同 questionId):保留 to 的,刪除 from 的
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
    return NextResponse.json({ ok: true, migrated: { attempts: 0, favorites: 0, notes: 0 }, message: "來源與目標相同,無需遷移" });
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
    const toFavQuestionIds = new Set(toFavs.map((f) => f.questionId));
    const favConflictQuestionIds = fromFavs
      .map((f) => f.questionId)
      .filter((qid) => toFavQuestionIds.has(qid));

    if (favConflictQuestionIds.length > 0) {
      await tx.favorite.deleteMany({
        where: {
          sessionId: fromSessionId,
          questionId: { in: favConflictQuestionIds },
        },
      });
    }

    const favResult = await tx.favorite.updateMany({
      where: { sessionId: fromSessionId },
      data: { sessionId: toSessionId },
    });

    // 3. 遷移 Note — 同樣處理衝突(同 questionId,保留 to 既有的)
    const toNotes = await tx.note.findMany({
      where: { sessionId: toSessionId },
      select: { questionId: true },
    });
    const fromNotes = await tx.note.findMany({
      where: { sessionId: fromSessionId },
      select: { questionId: true },
    });
    const toNoteQuestionIds = new Set(toNotes.map((n) => n.questionId));
    const noteConflictQuestionIds = fromNotes
      .map((n) => n.questionId)
      .filter((qid) => toNoteQuestionIds.has(qid));

    if (noteConflictQuestionIds.length > 0) {
      await tx.note.deleteMany({
        where: {
          sessionId: fromSessionId,
          questionId: { in: noteConflictQuestionIds },
        },
      });
    }

    const noteResult = await tx.note.updateMany({
      where: { sessionId: fromSessionId },
      data: { sessionId: toSessionId },
    });

    return {
      attempts: attemptResult.count,
      favorites: favResult.count,
      notes: noteResult.count,
      conflicts:
        favConflictQuestionIds.length + noteConflictQuestionIds.length,
    };
  });

  return NextResponse.json({ ok: true, migrated: result });
}
