import { NextRequest, NextResponse } from "next/server";
import { listNotes } from "@/lib/kv";
import { requireSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  let body: { questionIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { questionIds } = body;
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json({ count: 0, items: [] });
  }
  if (questionIds.length > 2000) {
    return NextResponse.json(
      { error: "questionIds 不可超過 2000 筆" },
      { status: 400 }
    );
  }

  const ids = (questionIds as unknown[]).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );

  const notes = await listNotes(sessionId, ids);
  const items = Object.entries(notes).map(([questionId, n]) => ({
    questionId,
    content: n.content,
    updatedAt: n.updatedAt,
  }));

  return NextResponse.json({ count: items.length, items });
}
