"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/lib/session-client";
import { getChapterInfo } from "@/lib/chapters";

type Stats = {
  total: number;
  correct: number;
  accuracy: number;
  refStats: { ref: string; paperCode: string; total: number; correct: number; accuracy: number }[];
  paperStats: { paperId: string; name: string; total: number; correct: number; accuracy: number }[];
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState<string | null>(null);

  useEffect(() => {
    authedFetch(`/api/stats`)
      .then((r) => {
        if (!r.ok) throw new Error("載入統計失敗");
        return r.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((e) => {
        setLoadError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>
    );
  }
  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-red-600">{loadError}</div>
    );
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
                              <span className="text-muted-foreground font-normal ml-1.5">
                                {info?.path ?? "未能識別章節"}
                              </span>
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
    </div>
  );
}
