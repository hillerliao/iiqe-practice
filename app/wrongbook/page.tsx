"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionId } from "@/lib/session";
import { QuestionActions } from "@/components/QuestionActions";

type WrongItem = {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  paperCode: string;
  paperName: string;
  lastWrongAt: string;
  wrongCount: number;
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
          <span className="text-xs text-zinc-500">{q.sourceLabel}</span>
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
        <p className="text-xs text-zinc-400">點選選項復習作答</p>
        <div className="space-y-2">
          {(["a", "b", "c", "d"] as const).map((letter) => {
            const optText = q.options[letter];
            if (!optText) return null;
            const isPicked = picked === letter;
            const isCorrect = correctLetter === letter;
            const showResult = picked != null;

            return (
              <button
                key={letter}
                disabled={picked != null}
                onClick={() => setPicked(letter)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border-2 transition-colors flex items-start gap-3",
                  !showResult &&
                    "border-zinc-200 hover:border-blue-400 hover:bg-blue-50/50",
                  showResult && isCorrect && "border-green-500 bg-green-50",
                  showResult && isPicked && !isCorrect && "border-red-500 bg-red-50",
                  showResult && !isPicked && !isCorrect && "border-zinc-200 opacity-60"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-medium text-sm",
                    !showResult && "bg-zinc-100 text-zinc-700",
                    showResult && isCorrect && "bg-green-600 text-white",
                    showResult && isPicked && !isCorrect && "bg-red-600 text-white",
                    showResult && !isPicked && !isCorrect && "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {letter.toUpperCase()}
                </span>
                <span className="flex-1 text-sm leading-relaxed pt-0.5">
                  {optText}
                </span>
                {showResult && isCorrect && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-1" />
                )}
                {showResult && isPicked && !isCorrect && (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-1" />
                )}
              </button>
            );
          })}
        </div>

        {picked != null && (
          <div
            className={cn(
              "p-3 rounded-lg border text-sm font-medium",
              pickedCorrect
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            )}
          >
            {pickedCorrect
              ? "✓ 復習答對了"
              : `✗ 答錯 · 正確答案:${correctLetter.toUpperCase()}`}
          </div>
        )}

        {revealed && (
          <div className="p-3 rounded-lg border border-zinc-200 bg-zinc-50 text-sm space-y-1">
            <p>
              <span className="text-zinc-500">之前的答案:</span>{" "}
              <span className="text-red-600 font-medium">
                {userLetter
                  ? `${userLetter.toUpperCase()}${
                      q.options[userLetter] ? ` — ${q.options[userLetter]}` : ""
                    }`
                  : "(未作答)"}
              </span>
            </p>
            <p>
              <span className="text-zinc-500">正確答案:</span>{" "}
              <span className="text-green-700 font-medium">
                {correctLetter.toUpperCase()} — {q.options[correctLetter]}
              </span>
            </p>
            {q.explanation && (
              <p className="text-zinc-700 text-xs mt-2 leading-relaxed">
                💡 {q.explanation}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WrongbookPage() {
  const [items, setItems] = useState<WrongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repeatedCount, setRepeatedCount] = useState(0);

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/wrongbook?sessionId=${sessionId}`)
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

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-zinc-500">載入中...</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">錯題本</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            {repeatedCount > 0 && (
              <Badge variant="destructive">反覆錯 {repeatedCount} 題</Badge>
            )}
            <span className="text-zinc-500">共 {items.length} 題</span>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>尚無錯題</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-500 text-sm">
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
