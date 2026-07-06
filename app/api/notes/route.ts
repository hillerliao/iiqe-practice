// GET    /api/notes?sessionId=...                  — 列出此 session 所有筆記
// GET    /api/notes?sessionId=...&questionIds=a,b  — 批量取指定題目的筆記
// POST   /api/notes — 儲存/更新筆記(upsert)
// DELETE /api/notes?sessionId=...&questionId=...  — 刪除筆記
//
// 與 Favorite 模式一致:按 sessionId 隔離、純文字、1000 字上限
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MAX_LEN = 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  const questionIdsParam = url.searchParams.get("questionIds");

  if (questionIdsParam) {
    // 批量模式: 只回傳指定題目的筆記(供 practice 頁一次性載入)
    const ids = questionIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ count: 0, items: [] });
    }
    const notes = await prisma.note.findMany({
      where: { sessionId, questionId: { in: ids } },
    });
    return NextResponse.json({
      count: notes.length,
      items: notes.map((n) => ({
        questionId: n.questionId,
        content: n.content,
        updatedAt: n.updatedAt,
      })),
    });
  }

  // 列表模式: 包含 question + paper 資料(供筆記本頁與 favorites/wrongbook 列表)
  const notes = await prisma.note.findMany({
    where: { sessionId },
    include: { question: { include: { paper: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    count: notes.length,
    items: notes.map((n) => ({
      questionId: n.questionId,
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      paperCode: n.question.paper.code,
      paperName: n.question.paper.name,
      question: {
        id: n.question.id,
        number: n.question.number,
        ref: n.question.ref,
        question: n.question.question,
        options: JSON.parse(n.question.options),
        answer: n.question.answer?.toLowerCase() ?? "",
        explanation: n.question.explanation,
        page: n.question.page,
        source: n.question.source,
        sourceLabel: n.question.sourceLabel,
      },
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    const text = await req.text().catch(() => "");
    console.error("[POST /api/notes] Invalid JSON body:", text);
    return NextResponse.json(
      { error: "Invalid JSON body", raw: text },
      { status: 400 }
    );
  }
  const { sessionId, questionId, content } = body;

  if (!sessionId || !questionId) {
    return NextResponse.json(
      { error: "sessionId, questionId 必填" },
      { status: 400 }
    );
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content 必為字串" }, { status: 400 });
  }

  const trimmed = content.trim();

  // 空內容 = 刪除(保證資料庫不留空筆記)
  if (trimmed.length === 0) {
    await prisma.note.deleteMany({ where: { sessionId, questionId } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (trimmed.length > MAX_LEN) {
    return NextResponse.json(
      { error: `筆記內容不可超過 ${MAX_LEN} 字(目前 ${trimmed.length})` },
      { status: 400 }
    );
  }

  // 確認題目存在(防 FK 錯誤)
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const note = await prisma.note.upsert({
    where: { sessionId_questionId: { sessionId, questionId } },
    create: { sessionId, questionId, content: trimmed },
    update: { content: trimmed },
  });

  return NextResponse.json({
    note: {
      questionId: note.questionId,
      content: note.content,
      updatedAt: note.updatedAt,
    },
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
  await prisma.note.deleteMany({ where: { sessionId, questionId } });
  return NextResponse.json({ ok: true });
}
