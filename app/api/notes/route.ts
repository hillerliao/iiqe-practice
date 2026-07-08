import { NextRequest, NextResponse } from "next/server";
import { saveNote, deleteNote, getNote, listNotes } from "@/lib/kv";
import { getQuestionById, getPapers } from "@/lib/data";

const MAX_LEN = 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  const questionIdsParam = url.searchParams.get("questionIds");

  if (questionIdsParam) {
    const ids = questionIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ count: 0, items: [] });
    }
    const notes = await listNotes(sessionId, ids);
    const items = Object.entries(notes).map(([questionId, n]) => ({
      questionId,
      content: n.content,
      updatedAt: n.updatedAt,
    }));
    return NextResponse.json({ count: items.length, items });
  }

  const allNotes = await listNotes(sessionId);
  const papers = getPapers();

  const items = [];
  for (const [questionId, n] of Object.entries(allNotes)) {
    const q = getQuestionById(questionId);
    if (!q) continue;
    const paper = papers.find((p) => p.id === questionId.split("-")[0]);
    items.push({
      questionId,
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      paperCode: paper?.code ?? "",
      paperName: paper?.name ?? "",
      question: {
        id: q.id,
        number: q.number,
        ref: q.ref,
        question: q.question,
        options: q.options,
        answer: q.answer?.toLowerCase() ?? "",
        explanation: q.explanation,
        page: q.page,
        source: q.source,
        sourceLabel: q.sourceLabel,
      },
    });
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ count: items.length, items });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    const text = await req.text().catch(() => "");
    return NextResponse.json({ error: "Invalid JSON body", raw: text }, { status: 400 });
  }
  const { sessionId, questionId, content } = body;

  if (!sessionId || !questionId) {
    return NextResponse.json({ error: "sessionId, questionId 必填" }, { status: 400 });
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content 必為字串" }, { status: 400 });
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    await deleteNote(sessionId, questionId);
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (trimmed.length > MAX_LEN) {
    return NextResponse.json(
      { error: `筆記內容不可超過 ${MAX_LEN} 字(目前 ${trimmed.length})` },
      { status: 400 }
    );
  }

  const question = getQuestionById(questionId);
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  await saveNote(sessionId, questionId, trimmed);

  return NextResponse.json({
    note: { questionId, content: trimmed, updatedAt: new Date().toISOString() },
  });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const questionId = url.searchParams.get("questionId");
  if (!sessionId || !questionId) {
    return NextResponse.json({ error: "sessionId, questionId 必填" }, { status: 400 });
  }
  await deleteNote(sessionId, questionId);
  return NextResponse.json({ ok: true });
}
