"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  Eye,
  EyeOff,
  RotateCcw,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authedFetch } from "@/lib/session-client";
import { QuestionActions } from "@/components/QuestionActions";
import { QuestionStem } from "@/components/QuestionStem";
import { NoteSection } from "@/components/NoteSection";
import { PracticeOption, type OptionLetter } from "@/components/PracticeOption";
import { RedoPractice, type RedoItem } from "@/components/RedoPractice";

type FavItem = {
  questionId: string;
  paperCode: string;
  paperName: string;
  note: string | null;
  question: {
    id: string;
    number: number;
    ref: string;
    question: string;
    options: Record<string, string>;
    answer: string;
    explanation: string | null;
    sourceLabel: string;
  };
};

function FavItemCard({
  item,
  onRemove,
}: {
  item: FavItem;
  onRemove: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const q = item.question;
  const correctLetter = (q.answer || "").toLowerCase();
  const pickedCorrect = picked != null && picked === correctLetter;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Badge variant="secondary">{item.paperCode}</Badge>
            <span className="font-medium">#{q.number}</span>
            {q.ref && (
              <Badge variant="outline" className="text-xs">
                {q.ref}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{q.sourceLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <QuestionActions
              number={q.number}
              question={q.question}
              options={q.options}
              ref={q.ref || undefined}
              paper={item.paperCode || undefined}
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
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onRemove(item.questionId)}
              title="移除收藏"
            >
              <Star className="w-3 h-3 mr-1 fill-yellow-400 text-yellow-400" />
              移除
            </Button>
          </div>
        </div>
        <CardTitle className="text-base leading-relaxed mt-2">
          <QuestionStem text={q.question} />
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

export default function FavoritesPage() {
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);

  const load = () => {
    authedFetch(`/api/favorites`)
      .then((r) => {
        if (!r.ok) throw new Error("載入收藏失敗");
        return r.json();
      })
      .then((data) => {
        setItems(data.items);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  async function remove(qId: string) {
    await authedFetch(`/api/favorites?questionId=${qId}`, { method: "DELETE" });
    load();
  }

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
    return (
      <RedoPractice
        items={redoItems}
        title="收藏題 · 重做練習"
        onExit={() => setPracticeMode(false)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">收藏題</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">共 {items.length} 題</span>
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
            <CardTitle>尚無收藏</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              在答題時點 ⭐ 即可收藏題目
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <FavItemCard
              key={it.questionId}
              item={it}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
