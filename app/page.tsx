import Link from "next/link";
import { getPapersAsync } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HomeArrowRight,
  HomeFileText,
  HomeFileQuestion,
  HomeNotebookPen,
} from "@/components/HomePageIcons";
import { RecentAttemptsCard } from "@/components/RecentAttemptsCard";

export default async function HomePage() {
  const papers = await getPapersAsync();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">選擇卷別開始刷題</h1>
        <p className="text-muted-foreground mt-2">
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
              <p className="text-sm text-muted-foreground">
                共 {p.total} 題,涵蓋真題與模擬題
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild variant="default" className="w-full justify-between">
                  <Link href={`/papers?code=${p.code}&source=exam`}>
                    <span className="flex items-center gap-2">
                      <HomeFileText className="w-4 h-4" />
                      真題 ({p.bySource.exam ?? 0} 題)
                    </span>
                    <HomeArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={`/papers?code=${p.code}&source=mock`}>
                    <span className="flex items-center gap-2">
                      <HomeFileQuestion className="w-4 h-4" />
                      模擬題 ({p.bySource.mock ?? 0} 題)
                    </span>
                    <HomeArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <RecentAttemptsCard />
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
              <HomeNotebookPen className="w-4 h-4 mr-1.5 text-amber-600" />
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
