"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionId } from "@/lib/session";

type Stats = {
  total: number;
  correct: number;
  accuracy: number;
  refStats: { ref: string; total: number; correct: number; accuracy: number }[];
  paperStats: { paperId: string; name: string; total: number; correct: number; accuracy: number }[];
  recentAttempts: {
    id: string;
    paperName: string;
    paperCode: string;
    totalQ: number;
    correct: number;
    startedAt: string;
    finishedAt: string | null;
  }[];
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/stats?sessionId=${sessionId}`)
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
      <div className="max-w-5xl mx-auto px-4 py-8 text-zinc-500">載入中...</div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-red-600">{error}</div>
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
            <p className="text-zinc-500">完成一次練習後,這裡會顯示你的表現統計</p>
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
            <CardTitle className="text-sm text-zinc-500">總作答</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-zinc-500">答對</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats.correct}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-zinc-500">總正確率</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                stats.accuracy >= 0.8
                  ? "text-green-600"
                  : stats.accuracy >= 0.6
                    ? "text-yellow-600"
                    : "text-red-600"
              }`}
            >
              {(stats.accuracy * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>各章節表現</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.refStats.slice(0, 12).map((r) => (
                <div key={r.ref}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{r.ref}</span>
                    <span className="text-zinc-500">
                      {r.correct}/{r.total} ({(r.accuracy * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        r.accuracy >= 0.8
                          ? "bg-green-500"
                          : r.accuracy >= 0.6
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${r.accuracy * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {stats.refStats.length === 0 && (
                <p className="text-zinc-500 text-sm">尚無資料</p>
              )}
            </div>
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
                className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
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
              <p className="text-zinc-500 text-sm">尚無資料</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近的作答 session</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentAttempts.length === 0 ? (
            <p className="text-zinc-500 text-sm">尚無紀錄</p>
          ) : (
            <div className="space-y-2">
              {stats.recentAttempts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{a.paperName}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {new Date(a.startedAt).toLocaleString("zh-HK")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {a.correct} / {a.totalQ}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {a.totalQ > 0
                        ? `${((a.correct / a.totalQ) * 100).toFixed(0)}%`
                        : "-"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
