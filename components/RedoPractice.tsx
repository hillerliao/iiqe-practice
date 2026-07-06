"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ListChecks,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getChapterInfo } from "@/lib/chapters";
import { QuestionActions } from "@/components/QuestionActions";
import { PracticeOption, type OptionLetter } from "@/components/PracticeOption";
import { buildSearchQuery } from "@/components/QuestionSearchButtons";
import { formatQuestionText } from "@/components/CopyQuestionButton";
import { useToast, ToastContainer } from "@/components/useToast";

export type RedoQuestion = {
  id: string;
  number: number;
  ref: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  explanation: string | null;
  sourceLabel: string;
};

export type RedoItem = {
  questionId: string;
  paperCode: string;
  /** 預留:按 paper 分組時可顯示 */
  paperName: string;
  question: RedoQuestion;
};

type RedoPracticeProps = {
  items: RedoItem[];
  /** 上一題的作答結果,僅用於錯題本場景顯示對照 */
  prevUserAnswer?: (id: string) => string | undefined;
  /** 退出練習模式 */
  onExit: () => void;
  /** 列表頁標題(顯示在頂部) */
  title?: string;
};

type AnswerMap = Record<string, string>;

/** 答對後自動跳下一題的延遲(毫秒) */
const AUTO_NEXT_DELAY = 1200;

export function RedoPractice({
  items,
  prevUserAnswer,
  onExit,
  title = "重做練習",
}: RedoPracticeProps) {
  const { toast, toasts } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [finished, setFinished] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = items.length;
  const current = items[currentIdx];
  const userAnswer = current ? answers[current.questionId] : undefined;
  const isAnswered = userAnswer != null;
  const correctLetter = current ? current.question.answer.toLowerCase() : "";
  const isCorrect = current && isAnswered && userAnswer === correctLetter;

  function clearAutoNext() {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    setAutoNextCountdown(null);
  }

  // 切題時若該題已有作答,保留紀錄(可隨時回頭重看)
  function pickAnswer(letter: string) {
    if (!current || isAnswered) return;
    setAnswers((prev) => ({ ...prev, [current.questionId]: letter }));
    // 答對且非最後一題 → 延遲自動跳下一題
    if (letter === correctLetter && currentIdx < total - 1) {
      clearAutoNext();
      setAutoNextCountdown(Math.ceil(AUTO_NEXT_DELAY / 1000));
      autoNextTimerRef.current = setTimeout(() => {
        autoNextTimerRef.current = null;
        setAutoNextCountdown(null);
        setCurrentIdx((i) => Math.min(i + 1, total - 1));
      }, AUTO_NEXT_DELAY);
    }
  }

  function goPrev() {
    clearAutoNext();
    if (currentIdx === 0) return;
    setCurrentIdx((i) => i - 1);
  }

  function goNext() {
    clearAutoNext();
    if (currentIdx >= total - 1) {
      setFinished(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setCurrentIdx((i) => i + 1);
  }

  function restart() {
    clearAutoNext();
    setAnswers({});
    setCurrentIdx(0);
    setFinished(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpToQuestion(id: string) {
    clearAutoNext();
    const idx = items.findIndex((x) => x.questionId === id);
    if (idx >= 0) {
      setCurrentIdx(idx);
      setFinished(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // 倒計時顯示 — 每秒減 1
  useEffect(() => {
    if (autoNextCountdown == null || autoNextCountdown <= 0) return;
    const id = setTimeout(() => {
      setAutoNextCountdown((c) => (c != null ? c - 1 : null));
    }, 1000);
    return () => clearTimeout(id);
  }, [autoNextCountdown]);

  // 卸載時清理 timer
  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    };
  }, []);

  // 用 ref 持有最新狀態,讓 keydown listener 只註冊一次
  const stateRef = useRef({
    currentIdx,
    total,
    current,
    isAnswered,
    finished,
  });
  stateRef.current = { currentIdx, total, current, isAnswered, finished };

  // pickAnswer 透過 ref 暴露,鍵盤 handler 復用同一份邏輯(包含自動跳題)
  const pickAnswerRef = useRef<(letter: string) => void>(() => {});
  pickAnswerRef.current = pickAnswer;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const s = stateRef.current;
      if (s.finished) return;

      const key = e.key;
      if (key === "ArrowLeft") {
        e.preventDefault();
        if (s.currentIdx === 0) return;
        clearAutoNext();
        setCurrentIdx((i) => i - 1);
      } else if (key === "ArrowRight" || key === "Enter") {
        e.preventDefault();
        if (s.currentIdx >= s.total - 1) {
          clearAutoNext();
          setFinished(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          clearAutoNext();
          setCurrentIdx((i) => i + 1);
        }
      } else if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        ["1", "2", "3", "4", "a", "b", "c", "d"].includes(key) &&
        !s.isAnswered &&
        s.current
      ) {
        const letter = ["1", "2", "3", "4"].includes(key)
          ? (["a", "b", "c", "d"] as const)[parseInt(key, 10) - 1]
          : (key.toLowerCase() as "a" | "b" | "c" | "d");
        if (s.current.question.options[letter]) {
          e.preventDefault();
          pickAnswerRef.current(letter);
        }
      } else if (
        (key === "s" || key === "S") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        s.current
      ) {
        e.preventDefault();
        const q = buildSearchQuery({
          question: s.current.question.question,
          options: s.current.question.options,
          ref: s.current.question.ref || undefined,
        });
        window.open(
          `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          "_blank",
          "noopener,noreferrer"
        );
      } else if (
        (key === "x" || key === "X") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        s.current
      ) {
        e.preventDefault();
        const text = formatQuestionText({
          number: s.current.question.number,
          question: s.current.question.question,
          options: s.current.question.options,
          ref: s.current.question.ref || undefined,
        });
        navigator.clipboard
          ?.writeText(text)
          .then(() => toast("已複製題目"))
          .catch(() => {});
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 統計 — 題量小於 memo 比對成本,直接算
  let correctCount = 0;
  let wrongCount = 0;
  for (const it of items) {
    const a = answers[it.questionId];
    if (a == null) continue;
    if (a === it.question.answer.toLowerCase()) correctCount++;
    else wrongCount++;
  }
  const answeredCount = correctCount + wrongCount;

  // 完成總結頁
  if (finished) {
    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const wrongList = items.filter((it) => {
      const a = answers[it.questionId];
      return a != null && a !== it.question.answer.toLowerCase();
    });

    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="w-5 h-5" />
                {title} · 完成
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onExit}>
                <X className="w-4 h-4 mr-1" />
                退出
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center" aria-live="polite">
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {correctCount}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">答對</div>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {wrongCount}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400">答錯</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="text-2xl font-bold text-foreground">{rate}%</div>
                <div className="text-xs text-muted-foreground">正確率</div>
              </div>
            </div>

            {answeredCount < total && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                ⚠ 有 {total - answeredCount} 題未作答
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={restart} className="flex-1">
                <RotateCcw className="w-4 h-4 mr-1" />
                再做一次
              </Button>
              <Button variant="outline" onClick={onExit} className="flex-1">
                返回列表
              </Button>
            </div>
          </CardContent>
        </Card>

        {wrongList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-red-700 dark:text-red-300">
                答錯的題目 ({wrongList.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {wrongList.map((it) => (
                <button
                  key={it.questionId}
                  onClick={() => jumpToQuestion(it.questionId)}
                  className="w-full text-left p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs mb-1 flex-wrap">
                    <Badge variant="secondary">{it.paperCode}</Badge>
                    <span className="font-medium">#{it.question.number}</span>
                    {it.question.ref && (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        title={
                          it.paperCode
                            ? getChapterInfo(it.paperCode, it.question.ref)?.path
                            : undefined
                        }
                      >
                        {it.question.ref}
                      </Badge>
                    )}
                    <span className="ml-auto text-red-600 dark:text-red-400">
                      你的答案 {answers[it.questionId]?.toUpperCase()} → 正確{" "}
                      {it.question.answer.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">
                    {it.question.question}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (!current) return null;

  const progress = ((currentIdx + 1) / total) * 100;
  // prevUserAnswer 可能返回 "" 表示「未作答」,需區分 null/undefined 與空字串
  const prevRaw = prevUserAnswer?.(current.questionId);
  const hasPrevAnswer = prevRaw != null && prevRaw !== "";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="font-medium">
            第 {currentIdx + 1} / {total} 題
          </span>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <X className="w-4 h-4 mr-1" />
            退出練習
          </Button>
        </div>
        <Progress value={progress} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Badge variant="secondary">{current.paperCode}</Badge>
            <span className="font-medium">#{current.question.number}</span>
            {current.question.ref && (
              <Badge
                variant="outline"
                className="text-xs"
                title={
                  current.paperCode
                    ? getChapterInfo(current.paperCode, current.question.ref)?.path
                    : undefined
                }
              >
                {current.question.ref}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {current.question.sourceLabel}
            </span>
            <div className="ml-auto">
              <QuestionActions
                number={current.question.number}
                question={current.question.question}
                options={current.question.options}
                ref={current.question.ref || undefined}
                size="xs"
              />
            </div>
          </div>
          <CardTitle className="text-base leading-relaxed mt-2">
            {current.question.question}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["a", "b", "c", "d"] as const).map((letter) => {
            const optText = current.question.options[letter];
            if (!optText) return null;
            return (
              <PracticeOption
                key={letter}
                letter={letter}
                text={optText}
                isPicked={userAnswer === letter}
                correctLetter={correctLetter}
                showResult={isAnswered}
                onPick={pickAnswer as (l: OptionLetter) => void}
              />
            );
          })}

          {isAnswered && (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mt-2 p-3 rounded-lg border text-sm",
                isCorrect
                  ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
              )}
            >
              <p
                className={cn(
                  "font-medium",
                  isCorrect
                    ? "text-green-700 dark:text-green-300"
                    : "text-red-700 dark:text-red-300"
                )}
              >
                {isCorrect ? (
                  <>
                    <Check className="inline w-4 h-4 mr-1" />
                    答對了
                    {autoNextCountdown != null && (
                      <span className="text-green-600 dark:text-green-400 ml-2 font-normal">
                        （{autoNextCountdown}s 後跳下一題…）
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <XCircle className="inline w-4 h-4 mr-1" />
                    答錯 · 正確答案:{correctLetter.toUpperCase()}
                  </>
                )}
              </p>
              {hasPrevAnswer ? (
                <p className="text-xs text-muted-foreground mt-1">
                  之前的答案:{prevRaw!.toUpperCase()}
                </p>
              ) : prevRaw === "" ? (
                <p className="text-xs text-muted-foreground mt-1">
                  之前的答案:(未作答)
                </p>
              ) : null}
              {current.question.explanation && (
                <p className="text-xs text-foreground mt-2 leading-relaxed">
                  💡 {current.question.explanation}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={currentIdx === 0}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一題
        </Button>
        <Button variant="ghost" size="sm" onClick={restart} title="重置所有作答">
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          重置
        </Button>
        {currentIdx < total - 1 ? (
          <Button onClick={goNext}>
            下一題
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={goNext} variant="default">
            完成
            <Check className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground justify-center">
        <span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted/50 font-mono">
            ←
          </kbd>{" "}
          上一題
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted/50 font-mono">
            →
          </kbd>{" "}
          下一題
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted/50 font-mono">
            1-4 / A-D
          </kbd>{" "}
          選答
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted/50 font-mono">
            Enter
          </kbd>{" "}
          下一題
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted/50 font-mono">
            S
          </kbd>{" "}
          Google 搜尋
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded border border-border bg-muted/50 font-mono">
            X
          </kbd>{" "}
          複製題目
        </span>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
