import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileText, FileQuestion, NotebookPen } from "lucide-react";

async function getPapers() {
  const papers = await prisma.paper.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { code: "asc" },
  });
  const stats = await prisma.question.groupBy({
    by: ["paperId", "source"],
    _count: { _all: true },
  });
  return papers.map((p) => {
    const bySource = stats
      .filter((s) => s.paperId === p.id)
      .reduce(
        (acc, s) => ({ ...acc, [s.source]: s._count._all }),
        {} as Record<string, number>
      );
    return { ...p, bySource };
  });
}

export default async function HomePage() {
  const papers = await getPapers();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">選擇卷別開始刷題</h1>
        <p className="text-zinc-500 mt-2">
          香港保險業監管局 IIQE 考試考古題與模擬題練習
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {papers.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{p.name}</span>
                <Badge variant="secondary">{p.code}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-zinc-500">
                共 {p._count.questions} 題,涵蓋真題與模擬題
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild variant="default" className="w-full justify-between">
                  <Link href={`/papers?code=${p.code}&source=exam`}>
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      真題 ({p.bySource.exam ?? 0} 題)
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={`/papers?code=${p.code}&source=mock`}>
                    <span className="flex items-center gap-2">
                      <FileQuestion className="w-4 h-4" />
                      模擬題 ({p.bySource.mock ?? 0} 題)
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>其他功能</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/wrongbook">📕 錯題本(依你曾答錯的題)</Link>
          </Button>
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/favorites">⭐ 收藏題</Link>
          </Button>
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/notes">
              <NotebookPen className="w-4 h-4 mr-1.5 text-amber-600" />
              筆記本
            </Link>
          </Button>
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/stats">📊 統計與表現</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
