import { NextRequest, NextResponse } from "next/server";
import { addFavorite, removeFavorite, listFavorites, getFavoriteMeta } from "@/lib/kv";
import { getQuestionById, getPapers } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const favIds = await listFavorites(sessionId);
  const papers = getPapers();

  const items = [];
  for (const qid of favIds) {
    const q = getQuestionById(qid);
    if (!q) continue;
    const meta = await getFavoriteMeta(sessionId, qid);
    const paper = papers.find((p) => p.id === qid.split("-")[0]);
    const noteData = qid ? null : null;
    items.push({
      questionId: qid,
      createdAt: meta?.createdAt ?? null,
      paperCode: paper?.code ?? "",
      paperName: paper?.name ?? "",
      note: null,
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

  items.sort((a, b) => {
    if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return 0;
  });

  return NextResponse.json({ count: items.length, items });
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;
  const body = await req.json();
  const { questionId } = body;
  if (!questionId) {
    return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
  }
  await addFavorite(sessionId, questionId);
  return NextResponse.json({ favorite: { sessionId, questionId } });
}

export async function DELETE(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;
  const url = new URL(req.url);
  const questionId = url.searchParams.get("questionId");
  if (!questionId) {
    return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
  }
  await removeFavorite(sessionId, questionId);
  return NextResponse.json({ ok: true });
}
