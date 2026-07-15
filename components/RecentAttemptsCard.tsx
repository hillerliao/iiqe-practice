"use client";

// 共用元件:「最近的作答 session」卡片
// 從原 app/stats/page.tsx 抽出,同時供首頁與統計頁使用;
// 內部 fetch /api/stats,維持原本的 handleRedo / formatQuestionRanges 邏輯。
//
// 空狀態:recentAttempts 為空(尚未作答或仍在載入)→ 回傳 null。
//      由首頁場景「沒有作答不渲染」;統計頁場景因另有其他統計區塊,
//      即使本卡為 null 仍會顯示那些區塊(與原行為一致)。
//
// props:
//   showHeaderBadge?: 是否於標題右側顯示「N 個未交卷」Badge。
//                    統計頁保留,首頁省略(避免首頁過於搶眼)。

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, FileText, RotateCcw } from "lucide-react";
import { authedFetch } from "@/lib/session-client";
import { getQuestionSourceDisplayName } from "@/lib/question-source-display";

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

type RecentAttempt = {
  id: string;
  paperName: string;
  paperCode: string;
  source: string | null;
  totalQ: number;
  answeredCount: number;
  correct: number;
  questionNumbers: number[];
  startedAt: string;
  finishedAt: string | null;
};

type RecentAttemptsCardProps = {
  /** 是否在標題右側顯示「N 個未交卷」Badge;預設 false。 */
  showHeaderBadge?: boolean;
};

export function RecentAttemptsCard({
  showHeaderBadge = false,
}: RecentAttemptsCardProps) {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentAttempt[] | null>(null);
  const [unfinishedCount, setUnfinishedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redoingId, setRedoingId] = useState<string | null>(null);

  useEffect(() => {
    authedFetch(`/api/stats`)
      .then((r) => {
        if (!r.ok) throw new Error("載入統計失敗");
        return r.json();
      })
      .then((data: {
        recentAttempts: RecentAttempt[];
        unfinishedCount: number;
      }) => {
        setRecent(data.recentAttempts ?? []);
        setUnfinishedCount(data.unfinishedCount ?? 0);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  async function handleRedo(attemptId: string) {
    if (redoingId) return;
    setRedoingId(attemptId);
    setError(null);
    try {
      const res = await authedFetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAttemptId: attemptId }),
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

  // 載入中 / 錯誤 / 沒有作答紀錄 → 不渲染,符合首頁期望行為
  if (loading) return null;
  if (error) return null;
  if (!recent || recent.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>最近作答紀錄</span>
          {showHeaderBadge && unfinishedCount > 0 && (
            <Badge
              variant="outline"
              className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
            >
              {unfinishedCount} 個未交卷
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {recent.map((a) => {
            const isUnfinished = a.finishedAt == null;
            const sourceLabel = getQuestionSourceDisplayName(a.source);
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
                    <Badge variant="secondary" className="text-[10px]">
                      {sourceLabel}
                    </Badge>
                    {isUnfinished && (
                      <Badge
                        variant="outline"
                        className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-[10px]"
                      >
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
      </CardContent>
    </Card>
  );
}
