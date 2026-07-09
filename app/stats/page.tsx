"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, FileText, RotateCcw } from "lucide-react";
import { getSessionId } from "@/lib/session";
import { getChapterInfo } from "@/lib/chapters";

// 把題目序號陣列壓縮成區段字串,例如 [110,111,118,119,120,126] → "110~111, 118~120, 126"
function formatQuestionRanges(nums: number[]): string {
  if (!nums || nums.length === 0) return "—";
  const sorted = [...nums].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}~${prev}`);
      start = prev = n;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}~${prev}`);
  return ranges.join(", ");
}

type Stats = {
  total: number;
  correct: number;
  accuracy: number;
  refStats: { ref: string; paperCode: string; total: number; correct: number; accuracy: number }[];
  paperStats: { paperId: string; name: string; total: number; correct: number; accuracy: number }[];
  recentAttempts: {
    id: string;
    paperName: string;
    paperCode: string;
    totalQ: number;
    answeredCount: number;
    correct: number;
    questionNumbers: number[];
    startedAt: string;
    finishedAt: string | null;
  }[];
  unfinishedCount: number;
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState<string | null>(null);
  const [redoingId, setRedoingId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/stats?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => {
        if (!r.ok) throw new Error("載入統計失敗");
        return r.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-red-600">{error}</div>
    );
  }

  async function handleRedo(attemptId: string) {
    if (redoingId) return;
    setRedoingId(attemptId);
    setError(null);
    try {
      const sessionId = getSessionId();
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fromAttemptId: attemptId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "未知錯誤" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const newAttemptId = data.attempt.id as string;
      // 把題目預先存到 sessionStorage / localStorage,讓 practice 頁能直接用
      // (避免 fallback 抓到整卷題目而非本次子集)
      if (Array.isArray(data.questions)) {
        sessionStorage.setItem(
          `attempt:${newAttemptId}:questions`,
          JSON.stringify(data.questions)
        );
        localStorage.setItem(
          `attempt:${newAttemptId}:questions`,
          JSON.stringify(data.questions)
        );
      }
      router.push(`/practice?id=${newAttemptId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重做失敗");
      setRedoingId(null);
    }
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>尚未有作答紀錄</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">完成一次練習後,這裡會顯示你的表現統計</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">統計</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">總作答</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">答對</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.correct}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">總正確率</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                stats.accuracy >= 0.8
                  ? "text-green-600 dark:text-green-400"
                  : stats.accuracy >= 0.6
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-red-600 dark:text-red-400"
              }`}
            >
              {(stats.accuracy * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {stats.paperStats.length > 1 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.paperStats.map((p) => (
            <Card key={p.paperId} className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">{p.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl font-bold">{p.total}</p>
                  <p className="text-sm text-muted-foreground">題</p>
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400 ml-auto">{p.correct}</p>
                  <p className="text-sm text-muted-foreground">對</p>
                  <p
                    className={`text-xl font-bold ${
                      p.accuracy >= 0.8
                        ? "text-green-600 dark:text-green-400"
                        : p.accuracy >= 0.6
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {(p.accuracy * 100).toFixed(1)}%
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>各章節表現</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const paperCodes = [...new Set(stats.refStats.map((r) => r.paperCode))].sort();
              const active = chapterFilter ?? paperCodes[0] ?? null;
              const filtered = active
                ? stats.refStats.filter((r) => r.paperCode === active)
                : stats.refStats;
              return (
                <>
                  {paperCodes.length > 1 && (
                    <div className="flex gap-2 mb-4">
                      {paperCodes.map((code) => (
                        <button
                          key={code}
                          onClick={() => setChapterFilter(code)}
                          className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                            active === code
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {code === "P1" ? "卷一" : code === "P3" ? "卷三" : code}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {filtered.map((r) => {
                      const info = getChapterInfo(r.paperCode, r.ref);
                      return (
                        <div key={`${r.paperCode}-${r.ref}`}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">
                              {r.ref}
                              {info && (
                                <span className="text-muted-foreground font-normal ml-1.5">
                                  {info.path}
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground shrink-0 ml-2">
                              {r.correct}/{r.total} ({(r.accuracy * 100).toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                r.accuracy >= 0.8
                                  ? "bg-green-500 dark:bg-green-600"
                                  : r.accuracy >= 0.6
                                    ? "bg-yellow-500 dark:bg-yellow-600"
                                    : "bg-red-500 dark:bg-red-600"
                              }`}
                              style={{ width: `${r.accuracy * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            {stats.refStats.length === 0 && (
              <p className="text-muted-foreground text-sm">尚無資料</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>各卷別表現</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.paperStats.map((p) => (
              <div
                key={p.paperId}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.correct} / {p.total} 題
                  </p>
                </div>
                <Badge
                  variant={
                    p.accuracy >= 0.8
                      ? "default"
                      : p.accuracy >= 0.6
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {(p.accuracy * 100).toFixed(0)}%
                </Badge>
              </div>
            ))}
            {stats.paperStats.length === 0 && (
              <p className="text-muted-foreground text-sm">尚無資料</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>最近的作答 session</span>
            {stats.unfinishedCount > 0 && (
              <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
                {stats.unfinishedCount} 個未交卷
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentAttempts.length === 0 ? (
            <p className="text-muted-foreground text-sm">尚無紀錄</p>
          ) : (
            <div className="space-y-2">
              {stats.recentAttempts.map((a) => {
                const isUnfinished = a.finishedAt == null;
                // 已交卷:用 correct/totalQ;未交卷:用 correct/answeredCount(已答中的正確率)
                const denom = isUnfinished
                  ? Math.max(a.answeredCount, 1)
                  : a.totalQ;
                const pct = a.answeredCount > 0 ? (a.correct / denom) * 100 : 0;
                const nums = a.questionNumbers ?? [];
                const rangeLabel = formatQuestionRanges(nums);
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 border rounded-lg gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{a.paperName}</p>
                        {isUnfinished && (
                          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-[10px]">
                            未交卷
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(a.startedAt).toLocaleString("zh-HK")}
                      </p>
                      <p
                        className="text-xs text-muted-foreground mt-1 font-mono truncate"
                        title={`題目序號: ${nums.join(", ") || "(無)"}`}
                      >
                        題目: {rangeLabel}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div>
                        <p className="font-medium">
                          {a.correct} / {isUnfinished ? a.answeredCount : a.totalQ}
                          {isUnfinished && a.answeredCount < a.totalQ && (
                            <span className="text-xs text-muted-foreground ml-1">
                              (共 {a.totalQ})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.answeredCount > 0
                            ? `${pct.toFixed(0)}%${isUnfinished ? " · 已答中" : ""}`
                            : "-"}
                        </p>
                      </div>
                      {isUnfinished ? (
                        <Button asChild size="sm" variant="default">
                          <Link href={`/practice?id=${a.id}`}>
                            <Play className="w-3.5 h-3.5 mr-1" />
                            繼續作答
                          </Link>
                        </Button>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/result?id=${a.id}`}>
                              <FileText className="w-3.5 h-3.5 mr-1" />
                              查看結果
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={redoingId === a.id}
                            onClick={() => handleRedo(a.id)}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            {redoingId === a.id ? "準備中..." : "重做"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
