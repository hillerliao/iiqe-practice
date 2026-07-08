import { NextRequest, NextResponse } from "next/server";
import { getPapers, getQuestions, getQuestionById } from "@/lib/data";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("paperCode");
  const source = url.searchParams.get("source") ?? "exam";
  const shuffle = url.searchParams.get("shuffle") === "1";
  const limit = parseInt(url.searchParams.get("limit") ?? "9999", 10);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10));

  if (!code) {
    return NextResponse.json({ error: "paperCode 必填" }, { status: 400 });
  }

  const papers = getPapers();
  const paper = papers.find((p) => p.code === code);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const effectiveOffset = shuffle ? 0 : offset;
  const questions = getQuestions(code, source, { shuffle, limit, offset: effectiveOffset });

  const total = getQuestions(code, source).length;

  return NextResponse.json({
    paper: { id: paper.id, code: paper.code, name: paper.name },
    source,
    total,
    offset: effectiveOffset,
    questions: questions.map((q) => ({
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
    })),
  });
}
