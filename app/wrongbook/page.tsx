"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  Eye,
  EyeOff,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authedFetch } from "@/lib/session-client";
import { QuestionActions } from "@/components/QuestionActions";
import { NoteSection } from "@/components/NoteSection";
import { PracticeOption, type OptionLetter } from "@/components/PracticeOption";
import { RedoPractice, type RedoItem } from "@/components/RedoPractice";

type WrongItem = {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  paperCode: string;
  paperName: string;
  lastWrongAt: string;
  wrongCount: number;
  note: string | null;
  question: {
    id: string;
    number: number;
    ref: string;
    question: string;
    options: Record<string, string>;
    answer: string;
    explanation: string | null;
    page: number | null;
    source: string | null;
    sourceLabel: string;
  };
};

function WrongItemCard({ item }: { item: WrongItem }) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const q = item.question;
  const correctLetter = (q.answer || "").toLowerCase();
  const userLetter = (item.userAnswer || "").toLowerCase();
  const pickedCorrect = picked != null && picked === correctLetter;
  const isRepeated = item.wrongCount >= 2;

  return (
    <Card className={isRepeated ? "border-red-300" : undefined}>
      <CardHeader>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Badge variant="secondary">{item.paperCode}</Badge>
          <span className="font-medium">#{q.number}</span>
          {q.ref && (
            <Badge variant="outline" className="text-xs">
              {q.ref}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{q.sourceLabel}</span>
          {isRepeated && (
            <Badge variant="destructive" className="text-xs">
              反覆錯 · 已錯 {item.wrongCount} 次
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <QuestionActions
              number={q.number}
              question={q.question}
              options={q.options}
              ref={q.ref || undefined}
              size="xs"
            />
            {picked != null && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setPicked(null)}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                重做
              </Button>
            )}
            <Button
              variant={revealed ? "outline" : "ghost"}
              size="xs"
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? (
                <>
                  <EyeOff className="w-3 h-3 mr-1" />
                  隱藏答案
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3 mr-1" />
                  顯示答案
                </>
              )}
            </Button>
          </div>
        </div>
        <CardTitle className="text-base leading-relaxed mt-2">
          {q.question}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">點選選項復習作答</p>
        <div className="space-y-2">
          {(["a", "b", "c", "d"] as const).map((letter) => {
            const optText = q.options[letter];
            if (!optText) return null;
            return (
              <PracticeOption
                key={letter}
                letter={letter}
                text={optText}
                isPicked={picked === letter}
                correctLetter={correctLetter}
                showResult={picked != null}
                onPick={setPicked as (l: OptionLetter) => void}
              />
            );
          })}
        </div>

        {picked != null && (
          <div
            className={cn(
              "p-3 rounded-lg border text-sm font-medium",
              pickedCorrect
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
            )}
          >
            {pickedCorrect
              ? "✓ 復習答對了"
              : `✗ 答錯 · 正確答案:${correctLetter.toUpperCase()}`}
          </div>
        )}

        {revealed && (
          <div className="p-3 rounded-lg border border-border bg-muted/50 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">之前的答案:</span>{" "}
              <span className="text-red-600 dark:text-red-400 font-medium">
                {userLetter
                  ? `${userLetter.toUpperCase()}${
                      q.options[userLetter] ? ` — ${q.options[userLetter]}` : ""
                    }`
                  : "(未作答)"}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">正確答案:</span>{" "}
              <span className="text-green-700 dark:text-green-400 font-medium">
                {correctLetter.toUpperCase()} — {q.options[correctLetter]}
              </span>
            </p>
            {q.explanation && (
              <p className="text-muted-foreground text-xs mt-2 leading-relaxed">
                💡 {q.explanation}
              </p>
            )}
          </div>
        )}

        <NoteSection content={item.note} compact />
      </CardContent>
    </Card>
  );
}

export default function WrongbookPage() {
  const [items, setItems] = useState<WrongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repeatedCount, setRepeatedCount] = useState(0);
  const [practiceMode, setPracticeMode] = useState(false);

  useEffect(() => {
    authedFetch(`/api/wrongbook`)
      .then((r) => {
        if (!r.ok) throw new Error("載入錯題本失敗");
        return r.json();
      })
      .then((data) => {
        setItems(data.items);
        setRepeatedCount(data.repeatedCount ?? 0);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // 將重做練習的作答寫回後端(/api/wrongbook/record),讓「又錯了」累積進 wrongCount
  // 注意:失敗時要拋出(而非吞掉),persistAnswers 的 .catch 才會重置 recordedRef 以便重試
  const recordRedo = useCallback(
    async (answers: Record<string, string>) => {
      const payload = items
        .map((it) => ({ questionId: it.questionId, userAnswer: answers[it.questionId] }))
        .filter((a) => a.userAnswer != null && a.userAnswer !== "");
      if (payload.length === 0) return;
      const r = await authedFetch("/api/wrongbook/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      if (!r.ok) {
        throw new Error(`記錄重做結果失敗: ${r.status}`);
      }
    },
    [items]
  );

  // 退出重做模式:重新整理錯題本,使更新後的 wrongCount / 反覆錯標籤立即反映
  const handleExit = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/wrongbook`);
      if (r.ok) {
        const data = await r.json();
        setItems(data.items);
        setRepeatedCount(data.repeatedCount ?? 0);
      }
    } catch {
      /* 重新整理失敗不阻斷退出 */
    }
    setPracticeMode(false);
  }, []);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  // 做題模式
  if (practiceMode) {
    const redoItems: RedoItem[] = items.map((it) => ({
      questionId: it.questionId,
      paperCode: it.paperCode,
      paperName: it.paperName,
      question: it.question,
    }));
    const prevAnswerMap = new Map(items.map((it) => [it.questionId, it.userAnswer]));

    async function recordRedo(answers: Record<string, string>) {
      try {
        await authedFetch("/api/wrongbook/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
      } catch (e) {
        console.error("記錄重做結果失敗:", e);
      }
    }

    async function handleExit() {
      setPracticeMode(false);
      // 重新載入錯題本列表以反映記錄結果
      try {
        const r = await authedFetch(`/api/wrongbook`);
        if (r.ok) {
          const data = await r.json();
          setItems(data.items);
          setRepeatedCount(data.repeatedCount ?? 0);
        }
      } catch {}
    }

    return (
      <RedoPractice
        items={redoItems}
        title="錯題本 · 重做練習"
        prevUserAnswer={(id) => prevAnswerMap.get(id)}
        recordAnswers={recordRedo}
        onExit={handleExit}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">錯題本</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            {repeatedCount > 0 && (
              <Badge variant="destructive">反覆錯 {repeatedCount} 題</Badge>
            )}
            <span className="text-muted-foreground">共 {items.length} 題</span>
            <Button onClick={() => setPracticeMode(true)}>
              <Play className="w-4 h-4 mr-1" />
              做題模式
            </Button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>尚無錯題</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              你在練習中答錯的題會自動收錄在這裡
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <WrongItemCard key={it.questionId} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}
