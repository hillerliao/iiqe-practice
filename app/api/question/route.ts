import { NextRequest, NextResponse } from "next/server";
import { getQuestionById, getPapers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 必填" }, { status: 400 });
  }

  const q = getQuestionById(id);
  if (!q) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const paper = getPapers().find((p) => p.id === q.id.split("-")[0]);

  return NextResponse.json({
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
    paper: paper
      ? { code: paper.code, name: paper.name }
      : { code: q.id.split("-")[0], name: q.id.split("-")[0] },
  });
}