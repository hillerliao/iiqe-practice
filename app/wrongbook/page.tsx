"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionId } from "@/lib/session";

type WrongItem = {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
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

export default function WrongbookPage() {
  const [items, setItems] = useState<WrongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = getSessionId();
    fetch(`/api/wrongbook?sessionId=${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error("載入錯題本失敗");
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
  }, []);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-zinc-500">載入中...</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">錯題本</h1>
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
            <Card key={it.questionId}>
              <CardHeader>
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
                <CardTitle className="text-base leading-relaxed mt-2">
                  {it.question.question}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-zinc-500">你的答案:</span>{" "}
                    <span className="text-red-600 font-medium">
                      {it.userAnswer || "(未作答)"}{" "}
                      {it.userAnswer && it.question.options[it.userAnswer] &&
                        `— ${it.question.options[it.userAnswer]}`}
                    </span>
                  </p>
                  <p>
                    <span className="text-zinc-500">正確答案:</span>{" "}
                    <span className="text-green-700 font-medium">
                      {it.question.answer} — {it.question.options[it.question.answer]}
                    </span>
                  </p>
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
