// GET /api/papers
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const papers = await prisma.paper.findMany({
    include: {
      _count: { select: { questions: true } },
    },
    orderBy: { code: "asc" },
  });

  // 統計每個 paper 的真題/模擬題數
  const stats = await prisma.question.groupBy({
    by: ["paperId", "source"],
    _count: { _all: true },
  });

  const result = papers.map((p) => {
    const sources = stats.filter((s) => s.paperId === p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      total: p._count.questions,
      bySource: sources.reduce(
        (acc, s) => ({ ...acc, [s.source]: s._count._all }),
        {} as Record<string, number>
      ),
    };
  });

  return NextResponse.json({ papers: result });
}
