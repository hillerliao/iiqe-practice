"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Star,
  Clock,
  ChevronLeft,
  ChevronRight,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionId } from "@/lib/session";
import { QuestionActions } from "@/components/QuestionActions";
import { buildSearchQuery } from "@/components/QuestionSearchButtons";
import { formatQuestionText } from "@/components/CopyQuestionButton";
import { useToast, ToastContainer } from "@/components/useToast";

type Question = {
  id: string;
  number: number;
  ref: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  explanation: string | null;
  page: number | null;
};

type AttemptMeta = {
  id: string;
  durationSec: number | null;
  startedAt: string;
  totalQ: number;
};

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8 text-zinc-500">載入中...</div>}>
      <PracticeInner />
    </Suspense>
  );
}

function PracticeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get("id") ?? "";
  const { toast, toasts } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<AttemptMeta | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showJumpPanel, setShowJumpPanel] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const questionStartRef = useRef<number>(0);
  const finishRef = useRef<() => void>(() => {});
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);

  const AUTO_NEXT_DELAY = 1200; // 答對後自動跳下一題的延遲(ms)

  useEffect(() => {
    if (!attemptId) return;
    const stored =
      sessionStorage.getItem(`attempt:${attemptId}:questions`) ||
      localStorage.getItem(`attempt:${attemptId}:questions`);
    if (stored) {
      setQuestions(JSON.parse(stored));
      // 若只有 localStorage 有,回寫 sessionStorage 供本頁使用
      if (!sessionStorage.getItem(`attempt:${attemptId}:questions`)) {
        sessionStorage.setItem(`attempt:${attemptId}:questions`, stored);
      }
    }
    fetch(`/api/attempt?id=${attemptId}`)
      .then((r) => {
        if (!r.ok) throw new Error("載入作答資料失敗");
        return r.json();
      })
      .then((data) => {
        // 以 API(資料庫最新)更新每題內容,但保留 stored 的 shuffle 順序;
        // 不存在 stored 時用後端 allQuestions 兜底(預設順序)。
        const latestById = new Map<string, any>();
        for (const a of data.attempt.answers) latestById.set(a.question.id, a.question);
        for (const q of data.attempt.allQuestions) latestById.set(q.id, q);
        const qs: Question[] = stored
          ? (JSON.parse(stored) as Question[]).map(
              (q) => latestById.get(q.id) ?? q
            )
          : (data.attempt.allQuestions as Question[]);
        setQuestions(qs);
        sessionStorage.setItem(`attempt:${attemptId}:questions`, JSON.stringify(qs));
        setAttempt({
          id: data.attempt.id,
          durationSec: data.attempt.durationSec,
          startedAt: data.attempt.startedAt,
          totalQ: data.attempt.totalQ,
        });
        const ans: Record<string, string> = {};
        data.attempt.answers.forEach((a: any) => {
          if (a.userAnswer) ans[a.questionId] = a.userAnswer;
        });
        setAnswers(ans);
        // 繼續上次進度:跳到第一個尚未作答的題目
        // findIndex 找不到時回傳 -1,此時若已有作答記錄則跳到最後一題
        let firstUnanswered = qs.findIndex((q) => !ans[q.id]);
        if (firstUnanswered === -1 && Object.keys(ans).length > 0) {
          firstUnanswered = qs.length - 1;
        }
        if (firstUnanswered > 0) {
          setCurrentIdx(firstUnanswered);
          setShowFeedback(false);
        }
        // 同步收藏狀態
        const sessionId = getSessionId();
        fetch(`/api/favorites?sessionId=${sessionId}`)
          .then((r) => r.json())
          .then((d) => {
            const favSet = new Set<string>();
            d.items.forEach((it: { questionId: string }) => favSet.add(it.questionId));
            setFavorites(favSet);
          });
      })
      .catch((e) => {
        setLoadError(e.message);
      });
    questionStartRef.current = Date.now();
  }, [attemptId]);

  // 計時器 — 透過 finishRef 引用最新 handleFinish,避免 stale closure
  useEffect(() => {
    if (!attempt?.durationSec) return;
    const startMs = new Date(attempt.startedAt).getTime();
    const endMs = startMs + attempt.durationSec * 1000;
    const update = () => {
      const remaining = Math.max(0, endMs - Date.now());
      setTimeLeft(Math.floor(remaining / 1000));
      if (remaining <= 0) {
        finishRef.current();
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [attempt?.durationSec, attempt?.startedAt]);

  const currentQ = questions[currentIdx];
  const userAnswer = currentQ ? answers[currentQ.id] : undefined;
  const isAnswered = !!userAnswer;
  const isCorrect = currentQ && userAnswer === currentQ.answer;

  function clearAutoNext() {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setAutoNextCountdown(null);
  }

  async function submitAnswer(qId: string, ans: string) {
    const timeSpentMs = Date.now() - questionStartRef.current;
    setAnswers((prev) => ({ ...prev, [qId]: ans }));
    setShowFeedback(true);
    const res = await fetch("/api/attempt", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "answer",
        id: attemptId,
        questionId: qId,
        userAnswer: ans,
        timeSpentMs,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "未知錯誤" }));
      console.error("[submitAnswer] 儲存失敗:", err);
      setLoadError(`答案儲存失敗: ${err.error ?? res.status}`);
    }
    // 答對且非最後一題 → 延遲自動跳下一題
    const correct = ans === currentQ.answer;
    if (correct && currentIdx < questions.length - 1) {
      setAutoNextCountdown(Math.ceil(AUTO_NEXT_DELAY / 1000));
      autoNextTimerRef.current = setTimeout(() => {
        autoNextTimerRef.current = null;
        setAutoNextCountdown(null);
        goNext();
      }, AUTO_NEXT_DELAY);
    }
  }

  async function toggleFavorite(qId: string) {
    const next = !favorites.has(qId);
    const newFav = new Set(favorites);
    if (next) newFav.add(qId);
    else newFav.delete(qId);
    setFavorites(newFav);
    const sessionId = getSessionId();
    await fetch("/api/favorites", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, questionId: qId }),
    });
  }

  async function handleFinish() {
    await fetch("/api/attempt", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", id: attemptId }),
    });
    sessionStorage.removeItem(`attempt:${attemptId}:questions`);
    localStorage.removeItem(`attempt:${attemptId}:questions`);
    router.push(`/result?id=${attemptId}`);
  }

  function goPrev() {
    clearAutoNext();
    if (currentIdx === 0) return;
    const prevIdx = currentIdx - 1;
    setCurrentIdx(prevIdx);
    setShowFeedback(!!answers[questions[prevIdx].id]);
    questionStartRef.current = Date.now();
  }

  function goNext() {
    clearAutoNext();
    if (currentIdx >= questions.length - 1) return;
    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);
    setShowFeedback(!!answers[questions[nextIdx].id]);
    questionStartRef.current = Date.now();
  }

  // 保持 finishRef 指向最新 handleFinish,供 timer 到期呼叫
  finishRef.current = handleFinish;

  // 倒計時顯示 + 卸載清理
  useEffect(() => {
    if (autoNextCountdown == null) return;
    if (autoNextCountdown <= 0) return;
    const id = setTimeout(() => {
      setAutoNextCountdown((c) => (c != null ? c - 1 : null));
    }, 1000);
    return () => clearTimeout(id);
  }, [autoNextCountdown]);

  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    };
  }, []);

  // 鍵盤快捷鍵
  useEffect(() => {
    if (!currentQ) return;
    function onKey(e: KeyboardEvent) {
      // 在輸入框中不觸發
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const key = e.key;
      if (key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (key === "ArrowRight") {
        e.preventDefault();
        // 最後一題時右箭頭 = 交卷
        if (currentIdx >= questions.length - 1) {
          handleFinish();
        } else {
          goNext();
        }
      } else if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        ["1", "2", "3", "4", "a", "b", "c", "d"].includes(key) &&
        !isAnswered
      ) {
        const letter =
          ["1", "2", "3", "4"].includes(key)
            ? ["a", "b", "c", "d"][parseInt(key, 10) - 1]
            : key.toLowerCase();
        if (currentQ.options[letter]) {
          e.preventDefault();
          submitAnswer(currentQ.id, letter);
        }
      } else if (key === "f" || key === "F") {
        e.preventDefault();
        toggleFavorite(currentQ.id);
      } else if (key === "g" || key === "G") {
        e.preventDefault();
        setShowJumpPanel((v) => !v);
      } else if (
        (key === "x" || key === "X") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const text = formatQuestionText({
          number: currentQ.number,
          question: currentQ.question,
          options: currentQ.options,
          ref: currentQ.ref || undefined,
        });
        navigator.clipboard
          ?.writeText(text)
          .then(() => toast("已複製題目"))
          .catch(() => {});
      } else if (
        (key === "s" || key === "S") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const q = buildSearchQuery({
          question: currentQ.question,
          options: currentQ.options,
          ref: currentQ.ref || undefined,
        });
        window.open(
          `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          "_blank",
          "noopener,noreferrer"
        );
      } else if (key === "Enter" && currentIdx >= questions.length - 1) {
        e.preventDefault();
        handleFinish();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, questions, answers, isAnswered, currentQ, favorites]);

  if (!currentQ || !attempt) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-zinc-500">
        {loadError ?? "載入中..."}
      </div>
    );
  }

  const progress = ((currentIdx + 1) / questions.length) * 100;
  const mm = timeLeft != null ? Math.floor(timeLeft / 60) : 0;
  const ss = timeLeft != null ? timeLeft % 60 : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              第 {currentIdx + 1} / {questions.length} 題
            </span>
            {currentQ.ref && (
              <Badge variant="outline" className="text-xs">
                {currentQ.ref}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {timeLeft != null && (
              <Badge
                variant={timeLeft < 60 ? "destructive" : "secondary"}
                className="flex items-center gap-1"
              >
                <Clock className="w-3 h-3" />
                {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowJumpPanel((v) => !v)}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleFinish}>
              交卷
            </Button>
          </div>
        </div>
        <Progress value={progress} />
      </div>

      {showJumpPanel && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">跳到第 N 題</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-10 sm:grid-cols-15 gap-1.5">
              {questions.map((q, i) => {
                const isAns = !!answers[q.id];
                const isCur = i === currentIdx;
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      clearAutoNext();
                      setCurrentIdx(i);
                      setShowFeedback(!!answers[q.id]);
                      setShowJumpPanel(false);
                      questionStartRef.current = Date.now();
                    }}
                    className={cn(
                      "aspect-square text-xs rounded border",
                      isCur
                        ? "bg-blue-600 text-white border-blue-600"
                        : isAns
                          ? "bg-green-50 border-green-300 text-green-700"
                          : "bg-white border-zinc-200 hover:border-zinc-400"
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-relaxed">
              <span className="text-zinc-400 mr-2">#{currentQ.number}</span>
              {currentQ.question}
            </CardTitle>
            <QuestionActions
              number={currentQ.number}
              question={currentQ.question}
              options={currentQ.options}
              ref={currentQ.ref || undefined}
              size="xs"
              className="shrink-0 mt-0.5"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["a", "b", "c", "d"] as const).map((letter) => {
            const optText = currentQ.options[letter];
            if (!optText) return null;
            const isSelected = userAnswer === letter;
            const isThisCorrect = currentQ.answer === letter;
            const showResult = showFeedback && isAnswered;

            return (
              <button
                key={letter}
                disabled={isAnswered}
                onClick={() => submitAnswer(currentQ.id, letter)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border-2 transition-colors flex items-start gap-3",
                  !showResult && "hover:border-blue-400 hover:bg-blue-50/50",
                  !showResult && isSelected && "border-blue-500 bg-blue-50",
                  showResult && isThisCorrect && "border-green-500 bg-green-50",
                  showResult && isSelected && !isThisCorrect && "border-red-500 bg-red-50",
                  showResult && !isSelected && !isThisCorrect && "border-zinc-200 opacity-60"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-medium text-sm",
                    !showResult && isSelected && "bg-blue-600 text-white",
                    !showResult && !isSelected && "bg-zinc-100 text-zinc-700",
                    showResult && isThisCorrect && "bg-green-600 text-white",
                    showResult && isSelected && !isThisCorrect && "bg-red-600 text-white",
                    showResult && !isSelected && !isThisCorrect && "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {letter.toUpperCase()}
                </span>
                <span className="flex-1 text-sm leading-relaxed pt-0.5">
                  {optText}
                </span>
                {showResult && isThisCorrect && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-1" />
                )}
                {showResult && isSelected && !isThisCorrect && (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-1" />
                )}
              </button>
            );
          })}

          {showFeedback && isAnswered && (
            <div
              className={cn(
                "mt-4 p-4 rounded-lg border",
                isCorrect
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              )}
            >
              <p className="text-sm font-medium mb-1">
                {isCorrect ? (
                  <span className="text-green-700">
                    ✓ 答對了
                    {autoNextCountdown != null && (
                      <span className="text-green-600 ml-2">
                        （{autoNextCountdown}s 後跳下一題…）
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-red-700">✗ 答錯 · 正確答案:{currentQ.answer}</span>
                )}
              </p>
              {currentQ.explanation && (
                <p className="text-sm text-zinc-700 leading-relaxed">
                  {currentQ.explanation}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentIdx === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一題
        </Button>
        <Button variant="ghost" onClick={() => toggleFavorite(currentQ.id)}>
          <Star
            className={cn(
              "w-4 h-4 mr-1",
              favorites.has(currentQ.id) && "fill-yellow-400 text-yellow-400"
            )}
          />
          {favorites.has(currentQ.id) ? "已收藏" : "收藏"}
        </Button>
        {currentIdx < questions.length - 1 ? (
          <Button onClick={goNext}>
            下一題
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleFinish} variant="default">
            交卷
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400 justify-center">
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">←</kbd> 上一題</span>
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">→</kbd> 下一題</span>
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">1-4 / A-D</kbd> 選答</span>
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">F</kbd> 收藏</span>
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">G</kbd> 跳題</span>
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">X</kbd> 複製</span>
        <span><kbd className="px-1 py-0.5 rounded border border-zinc-300 bg-zinc-50 font-mono">S</kbd> Google 搜尋</span>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
