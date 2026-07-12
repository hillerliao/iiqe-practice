"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Play } from "lucide-react";
import { QuestionActions } from "@/components/QuestionActions";
import { QuestionStem } from "@/components/QuestionStem";
import { NoteSection } from "@/components/NoteSection";
import { authedFetch } from "@/lib/session-client";

type AnswerData = {
  id: string;
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  note: string | null;
  question: {
    id: string;
    number: number;
    ref: string;
    question: string;
    options: Record<string, string>;
    answer: string;
    explanation: string | null;
  };
};

type AttemptData = {
  id: string;
  totalQ: number;
  correct: number;
  source: string | null;
  paper: { name: string; code: string };
};

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>}>
      <ResultInner />
    </Suspense>
  );
}

function ResultInner() {
  const searchParams = useSearchParams();
  const attemptId = searchParams.get("id") ?? "";
  const [attempt, setAttempt] = useState<AttemptData | null>(null);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    authedFetch(`/api/attempt?id=${attemptId}`)
      .then((r) => {
        if (!r.ok) throw new Error("載入結果失敗");
        return r.json();
      })
      .then((data) => {
        setAttempt({
          id: data.attempt.id,
          totalQ: data.attempt.totalQ,
          correct: data.attempt.correct,
          source: data.attempt.source,
          paper: data.attempt.paper,
        });
        setAnswers(data.attempt.answers);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [attemptId]);

  if (loading || !attempt) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">
        {error ?? "載入中..."}
      </div>
    );
  }

  const accuracy = attempt.totalQ > 0 ? attempt.correct / attempt.totalQ : 0;
  const wrongAnswers = answers.filter((a) => !a.isCorrect);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{attempt.paper.name} · 結果</span>
            <Badge variant="secondary">{attempt.paper.code}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-foreground">{attempt.totalQ}</p>
              <p className="text-xs text-muted-foreground mt-1">總題數</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{attempt.correct}</p>
              <p className="text-xs text-muted-foreground mt-1">答對</p>
            </div>
            <div>
              <p
                className={`text-3xl font-bold ${
                  accuracy >= 0.8
                    ? "text-green-600 dark:text-green-400"
                    : accuracy >= 0.6
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-red-600 dark:text-red-400"
                }`}
              >
                {(accuracy * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">正確率</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/">返回首頁</Link>
            </Button>
            <Button asChild variant="default">
              <Link
                href={`/papers?code=${attempt.paper.code}&source=${attempt.source ?? "exam"}`}
              >
                <Play className="w-4 h-4 mr-1.5" />
                繼續做題
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/wrongbook">查看錯題本</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/stats">查看統計</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {wrongAnswers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              答錯的題 ({wrongAnswers.length} 題)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {wrongAnswers.map((a) => (
              <div
                key={a.id}
                className="border-l-4 border-red-300 dark:border-red-700 pl-3 py-2 bg-red-50/50 dark:bg-red-950/20 rounded-r"
              >
                <div className="flex items-center gap-2 text-sm mb-2">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span className="font-medium">#{a.question.number}</span>
                  {a.question.ref && (
                    <Badge variant="outline" className="text-xs">
                      {a.question.ref}
                    </Badge>
                  )}
                  <div className="ml-auto">
                    <QuestionActions
                      number={a.question.number}
                      question={a.question.question}
                      options={a.question.options}
                      ref={a.question.ref || undefined}
                      paper={attempt?.paper?.code || undefined}
                      size="xs"
                    />
                  </div>
                </div>
                <p className="text-sm text-foreground mb-2 leading-relaxed">
                  <QuestionStem text={a.question.question} />
                </p>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">你的答案:</span>{" "}
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      {a.userAnswer || "(未作答)"}{" "}
                      {a.userAnswer &&
                        a.question.options[a.userAnswer] &&
                        `— ${a.question.options[a.userAnswer]}`}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">正確答案:</span>{" "}
                    <span className="text-green-700 dark:text-green-400 font-medium">
                      {a.question.answer} — {a.question.options[a.question.answer]}
                    </span>
                  </p>
                  {a.question.explanation && (
                    <p className="text-muted-foreground text-xs mt-2 leading-relaxed">
                      💡 {a.question.explanation}
                    </p>
                  )}
                </div>
                <NoteSection content={a.note} className="mt-2" compact />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {answers.length > wrongAnswers.length && (
        <Card>
          <CardHeader>
          <CardTitle className="text-base text-green-700 dark:text-green-400">
            ✓ 答對的題 ({answers.length - wrongAnswers.length} 題)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {answers
            .filter((a) => a.isCorrect)
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 text-foreground"
              >
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                <span className="text-muted-foreground">#{a.question.number}</span>
                <span className="truncate">{a.question.question}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
