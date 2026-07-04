"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { getSessionId } from "@/lib/session";
import { QuestionActions } from "@/components/QuestionActions";

type FavItem = {
  questionId: string;
  paperCode: string;
  paperName: string;
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

export default function FavoritesPage() {
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const sessionId = getSessionId();
    fetch(`/api/favorites?sessionId=${sessionId}`)
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
    const sessionId = getSessionId();
    await fetch(
      `/api/favorites?sessionId=${sessionId}&questionId=${qId}`,
      { method: "DELETE" }
    );
    load();
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-zinc-500">載入中...</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">收藏題</h1>
      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>尚無收藏</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-500 text-sm">
              在答題時點 ⭐ 即可收藏題目
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.questionId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">{it.paperCode}</Badge>
                    <span className="font-medium">#{it.question.number}</span>
                    {it.question.ref && (
                      <Badge variant="outline" className="text-xs">
                        {it.question.ref}
                      </Badge>
                    )}
                    <span className="text-xs text-zinc-500">
                      {it.question.sourceLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <QuestionActions
                      number={it.question.number}
                      question={it.question.question}
                      options={it.question.options}
                      ref={it.question.ref || undefined}
                      size="sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(it.questionId)}
                    >
                      <Star className="w-4 h-4 mr-1 fill-yellow-400 text-yellow-400" />
                      移除
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-base leading-relaxed mt-2">
                  {it.question.question}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  {(["a", "b", "c", "d"] as const).map((l) => {
                    const text = it.question.options[l];
                    if (!text) return null;
                    const isAnswer = it.question.answer === l;
                    return (
                      <p
                        key={l}
                        className={isAnswer ? "text-green-700 font-medium" : ""}
                      >
                        {l.toUpperCase()}) {text}
                        {isAnswer && " ✓"}
                      </p>
                    );
                  })}
                  {it.question.explanation && (
                    <p className="text-zinc-700 text-xs mt-2 leading-relaxed">
                      💡 {it.question.explanation}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
