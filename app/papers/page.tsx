"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Shuffle, History } from "lucide-react";
import { authedFetch, getLastSessionError } from "@/lib/session-client";

type PaperInfo = {
  id: string;
  code: string;
  name: string;
  total: number;
  bySource: { exam?: number; mock?: number };
};

type UnfinishedAttempt = {
  id: string;
  startedAt: string;
  totalQ: number;
  source: string | null;
  answers: { questionId: string; userAnswer: string }[];
};

export default function PaperSetupPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>}>
      <PaperSetupInner />
    </Suspense>
  );
}

function PaperSetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const source = (searchParams.get("source") ?? "exam") as "exam" | "mock";

  const [paper, setPaper] = useState<PaperInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [enableTimer, setEnableTimer] = useState(false);
  const [durationMin, setDurationMin] = useState(60);
  const [shuffle, setShuffle] = useState(false);
  const [limit, setLimit] = useState(10);
  const [startFrom, setStartFrom] = useState(1); // 從第幾題開始(1-indexed)
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<UnfinishedAttempt | null>(null);

  useEffect(() => {
    fetch("/api/papers")
      .then((r) => {
        if (!r.ok) throw new Error("載入卷別失敗");
        return r.json();
      })
      .then((data) => {
        const p = data.papers.find((p: PaperInfo) => p.code === code);
        setPaper(p ?? null);
        setLoading(false);
        if (p?.code === "P1") setDurationMin(60);
        if (p?.code === "P3") setDurationMin(75);

        // 檢查是否有未完成的 attempt,並取得此 session 曾答過的最大題目序號
        if (p) {
          authedFetch(
            `/api/attempts?unfinished=1&paperId=${p.id}&source=${source}`
          )
            .then((r) => r.json())
            .then((d) => {
              if (d.attempt) {
                setUnfinished({
                  id: d.attempt.id,
                  startedAt: d.attempt.startedAt,
                  totalQ: d.attempt.totalQ,
                  source: d.attempt.source,
                  answers: d.attempt.answers,
                });
              }
              // 若有歷史作答,把「從第幾題開始」預設為「最新答過的題目序號 +1」
              if (typeof d.latestAnsweredNumber === "number" && d.latestAnsweredNumber > 0) {
                const max = p.bySource[source] ?? Infinity;
                setStartFrom(Math.min(max, d.latestAnsweredNumber + 1));
              }
            });
        }
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [code, source]);

  function continueUnfinished() {
    if (!unfinished) return;
    router.push(`/practice?id=${unfinished.id}`);
  }

  async function handleStart() {
    if (!paper) return;
    setStarting(true);
    setError(null);

    // 若有舊的未完成 attempt,先標記為已完成(放棄),避免下次還提示
    if (unfinished) {
      await authedFetch("/api/attempt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", id: unfinished.id }),
      });
      localStorage.removeItem(`attempt:${unfinished.id}:questions`);
      setUnfinished(null);
    }

    try {
      const offset = shuffle ? 0 : Math.max(0, startFrom - 1);
      const qsRes = await authedFetch(
        `/api/questions?paperCode=${code}&source=${source}&shuffle=${shuffle ? 1 : 0}&limit=${limit}&offset=${offset}`
      );
      if (!qsRes.ok) throw new Error("載入題目失敗");
      const qsData = await qsRes.json();
      const questionIds: string[] = qsData.questions.map((q: { id: string }) => q.id);

      const aRes = await authedFetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperId: paper.id,
          mode: "exam",
          source,
          durationSec: enableTimer ? durationMin * 60 : null,
          questionIds,
        }),
      });
      if (!aRes.ok) {
        // 嘗試解析伺服器回傳的具體原因(503 AUTH_NOT_CONFIGURED、401、500 等),
        // 讓使用者與管理員能區分「後端配置問題」與「業務錯誤」。
        const statusCode = aRes.status;
        let detail = "";
        try {
          const errBody = await aRes.clone().json();
          if (errBody && typeof errBody.error === "string") {
            detail = errBody.error;
          }
        } catch {
          // 忽略解析失敗,維持通用訊息
        }
        // 若 detail 為空或僅是「未授權」,檢查 session 建立階段是否有已知錯誤
        // (例如 AUTH_SECRET 未設定 → /api/session 503),補上根因資訊
        if (!detail || detail === "未授權") {
          const sessionErr = getLastSessionError();
          if (sessionErr) {
            detail = detail
              ? `${detail} (根因: ${sessionErr})`
              : `會話建立失敗: ${sessionErr} → 後續請求 ${statusCode}`;
          } else if (!detail) {
            detail = `HTTP ${statusCode}`;
          }
        }
        throw new Error(
          detail ? `建立作答 session 失敗：${detail}` : "建立作答 session 失敗"
        );
      }
      const aData = await aRes.json();

      sessionStorage.setItem(
        `attempt:${aData.attempt.id}:questions`,
        JSON.stringify(qsData.questions)
      );
      // 同時存 localStorage 供跨 session 恢復進度
      localStorage.setItem(
        `attempt:${aData.attempt.id}:questions`,
        JSON.stringify(qsData.questions)
      );

      router.push(`/practice?id=${aData.attempt.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "啟動失敗");
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>
    );
  }
  if (!paper) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p>{error ?? "找不到此卷別"}</p>
        <Button asChild variant="link">
          <Link href="/">返回首頁</Link>
        </Button>
      </div>
    );
  }

  const sourceCount = paper.bySource[source] ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回首頁
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{paper.name}</span>
            <Badge variant="secondary">{source === "exam" ? "真題" : "模擬題"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            共 {sourceCount} 題 · {paper.code === "P1" ? "保險原理及實務" : "長期保險"}
          </p>

          {unfinished && (
            <div className="p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                <History className="w-4 h-4" />
                上次未完成 · 已答 {unfinished.answers.length} / {unfinished.totalQ} 題
              </div>
              <p className="text-xs text-muted-foreground">
                開始於 {new Date(unfinished.startedAt).toLocaleString("zh-HK")}
              </p>
              <Button
                onClick={continueUnfinished}
                variant="default"
                className="w-full"
                size="lg"
              >
                <History className="w-4 h-4 mr-2" />
                繼續上次進度
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="startFrom">從第幾題開始</Label>
              <Input
                id="startFrom"
                type="number"
                min={1}
                max={sourceCount}
                value={startFrom}
                disabled={shuffle}
                onChange={(e) =>
                  setStartFrom(
                    Math.min(
                      sourceCount,
                      Math.max(1, parseInt(e.target.value, 10) || 1)
                    )
                  )
                }
              />
              {shuffle ? (
                <p className="text-xs text-muted-foreground">
                  打亂順序時此項不生效
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  1 ~ {sourceCount} · 例如設為 51 即從第 51 題開始
                </p>
              )}
              {!shuffle && startFrom > 1 && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  預設為「最新答過的題目序號 +1」({startFrom}),可手動調整
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit">作答題數</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={sourceCount}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)}
              />
              {!shuffle && (
                <p className="text-xs text-muted-foreground">
                  將取第 {startFrom} ~{" "}
                  {Math.min(startFrom + limit - 1, sourceCount)} 題,共{" "}
                  {Math.min(limit, sourceCount - startFrom + 1)} 題
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="shuffle"
              checked={shuffle}
              onCheckedChange={(v) => setShuffle(v === true)}
            />
            <Label
              htmlFor="shuffle"
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              打亂題目順序
            </Label>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="timer"
                checked={enableTimer}
                onCheckedChange={(v) => setEnableTimer(v === true)}
              />
              <Label htmlFor="timer" className="cursor-pointer">
                開啟倒數計時
              </Label>
            </div>
            {enableTimer && (
              <div className="ml-6 space-y-1">
                <Label htmlFor="duration">時長(分鐘)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={300}
                  value={durationMin}
                  onChange={(e) =>
                    setDurationMin(parseInt(e.target.value, 10) || 1)
                  }
                  className="w-32"
                />
              </div>
            )}
          </div>

          <Button
            onClick={handleStart}
            disabled={starting || limit < 1}
            className="w-full"
            size="lg"
          >
            <Play className="w-4 h-4 mr-2" />
            {starting ? "準備中..." : `開始作答 ${limit} 題`}
          </Button>
          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
