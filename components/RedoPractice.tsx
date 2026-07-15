"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ListChecks,
  Check,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getChapterInfo } from "@/lib/chapters";
import { QuestionActions } from "@/components/QuestionActions";
import { NoteButton, type NoteButtonHandle } from "@/components/NoteButton";
import { QuestionStem } from "@/components/QuestionStem";
import { PracticeOption, type OptionLetter } from "@/components/PracticeOption";
import { buildSearchQuery } from "@/components/QuestionSearchButtons";
import { formatQuestionText } from "@/components/CopyQuestionButton";
import { ShortcutHints } from "@/components/ShortcutHints";
import { useToast, ToastContainer } from "@/components/useToast";
import { authedFetch } from "@/lib/session-client";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  getAnswerShortcutLabel,
  isEnterActivatableEventTarget,
  noModifiers,
  normalizeKey,
  parseAnswerKey,
} from "@/lib/practice-shortcuts";
import { matchQuestionSearchProvider } from "@/lib/question-search";
import { getHandbookHrefForQuestion } from "@/lib/handbook-refs";
import { useWindowKeydown } from "@/hooks/use-window-keydown";

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
  onExit: () => void | Promise<void>;
  /** 重做結束/退出時回傳作答結果,供上層做持久化(可選);只在有提供時才記錄 */
  recordAnswers?: (answers: AnswerMap) => void | Promise<void>;
  /** 列表頁標題(顯示在頂部) */
  title?: string;
  /** 受控收藏狀態 */
  favoriteIds?: ReadonlySet<string>;
  /** 切換收藏,由列表頁負責持久化 */
  onToggleFavorite?: (questionId: string) => void | Promise<void>;
};

type AnswerMap = Record<string, string>;

/** 答對後自動跳下一題的延遲(毫秒) */
const AUTO_NEXT_DELAY = 1200;
const EMPTY_FAVORITE_IDS: ReadonlySet<string> = new Set();

export function RedoPractice({
  items,
  prevUserAnswer,
  onExit,
  recordAnswers,
  title = "重做練習",
  favoriteIds = EMPTY_FAVORITE_IDS,
  onToggleFavorite,
}: RedoPracticeProps) {
  const { toast, toasts } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [finished, setFinished] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteButtonRef = useRef<NoteButtonHandle>(null);

  // —— 重做結果持久化 ——
  // answersRef 避免鍵盤 handler / 非同步閉包拿到過期的 answers
  const answersRef = useRef<AnswerMap>(answers);
  answersRef.current = answers;
  const recordedRef = useRef(false);
  const recordPromiseRef = useRef<Promise<void> | null>(null);
  const persistenceActionRef = useRef(false);
  const recordAnswersRef = useRef(recordAnswers);
  recordAnswersRef.current = recordAnswers;

  // 把本次重做的作答寫回(由上層 recordAnswers 實作)。只會成功寫入一次;
  // 失敗時解除鎖定允許重試。回傳 Promise 以便呼叫方能 await 後再重新整理列表。
  function persistAnswers(): Promise<void> {
    if (recordedRef.current) return recordPromiseRef.current ?? Promise.resolve();
    const fn = recordAnswersRef.current;
    if (!fn) return Promise.resolve();
    const answered = Object.entries(answersRef.current).filter(([, v]) => v != null);
    if (answered.length === 0) {
      recordedRef.current = true; // 沒有作答也算處理過,避免重試
      return Promise.resolve();
    }
    recordedRef.current = true;
    const p = Promise.resolve(fn({ ...answersRef.current })).catch((error) => {
      console.error("[RedoPractice] 記錄重做結果失敗:", error);
      recordedRef.current = false;
      recordPromiseRef.current = null;
      throw error;
    });
    recordPromiseRef.current = p;
    return p;
  }

  // 結束重做:先記錄結果,成功後才進入總結頁。
  const finishPractice = useCallback(async () => {
    if (persistenceActionRef.current) return;
    persistenceActionRef.current = true;
    setIsPersisting(true);
    try {
      await persistAnswers();
      setFinished(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast("重做結果儲存失敗，請重試");
    } finally {
      persistenceActionRef.current = false;
      setIsPersisting(false);
    }
  }, [toast]);

  // 退出重做:儲存失敗時留在目前畫面,避免靜默遺失作答結果。
  const handleExit = useCallback(async () => {
    if (persistenceActionRef.current) return;
    persistenceActionRef.current = true;
    setIsPersisting(true);
    try {
      await persistAnswers();
      onExit();
    } catch {
      toast("重做結果儲存失敗，請重試");
    } finally {
      persistenceActionRef.current = false;
      setIsPersisting(false);
    }
  }, [onExit, toast]);

  const total = items.length;
  const current = items[currentIdx];
  const userAnswer = current ? answers[current.questionId] : undefined;
  const isAnswered = userAnswer != null;
  const correctLetter = current ? current.question.answer.toLowerCase() : "";
  const isCorrect = current && isAnswered && userAnswer === correctLetter;
  const isFavorite = current ? favoriteIds.has(current.questionId) : false;
  const currentNote = current ? notes[current.questionId] ?? "" : "";
  const handbookHref = current
    ? getHandbookHrefForQuestion(current.paperCode, current.question.ref)
    : null;

  useEffect(() => {
    const questionIds = items.map((item) => item.questionId).join(",");
    if (!questionIds) {
      setNotes({});
      return;
    }

    let cancelled = false;
    authedFetch(`/api/notes?questionIds=${encodeURIComponent(questionIds)}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items: { questionId: string; content: string }[] }) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const item of data.items) next[item.questionId] = item.content;
        setNotes(next);
      })
      .catch(() => {
        // 筆記載入失敗不阻斷重做流程。
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

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
      finishPractice();
      return;
    }
    setCurrentIdx((i) => i + 1);
  }

  function restart() {
    clearAutoNext();
    setAnswers({});
    setCurrentIdx(0);
    setFinished(false);
    // 允許新一輪重做再次記錄結果
    recordedRef.current = false;
    recordPromiseRef.current = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestRestart() {
    if (Object.keys(answers).length === 0) {
      restart();
      return;
    }
    setIsRestartConfirmOpen(true);
  }

  function confirmRestart() {
    setIsRestartConfirmOpen(false);
    restart();
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
    isPersisting,
    handbookHref,
  });
  stateRef.current = {
    currentIdx,
    total,
    current,
    isAnswered,
    finished,
    isPersisting,
    handbookHref,
  };

  // pickAnswer 透過 ref 暴露,鍵盤 handler 復用同一份邏輯(包含自動跳題)
  const pickAnswerRef = useRef<(letter: string) => void>(() => {});
  pickAnswerRef.current = pickAnswer;

  useWindowKeydown(
    (event) => {
      const state = stateRef.current;
      if (state.finished || state.isPersisting) return;

      const key = normalizeKey(event.key);
      if (noModifiers(event) && key === "ArrowLeft") {
        event.preventDefault();
        if (state.currentIdx === 0) return;
        clearAutoNext();
        setCurrentIdx((index) => index - 1);
        return;
      }

      if (
        noModifiers(event) &&
        (key === "ArrowRight" ||
          (key === "Enter" && !isEnterActivatableEventTarget(event.target)))
      ) {
        event.preventDefault();
        if (state.currentIdx >= state.total - 1) {
          clearAutoNext();
          finishPractice();
        } else {
          clearAutoNext();
          setCurrentIdx((index) => index + 1);
        }
        return;
      }

      const answer = noModifiers(event) ? parseAnswerKey(key) : undefined;
      if (answer && !state.isAnswered && state.current) {
        if (state.current.question.options[answer]) {
          event.preventDefault();
          pickAnswerRef.current(answer);
        }
        return;
      }

      const provider = matchQuestionSearchProvider(event);
      if (provider && state.current) {
        event.preventDefault();
        const query = buildSearchQuery({
          number: state.current.question.number,
          question: state.current.question.question,
          options: state.current.question.options,
          ref: state.current.question.ref || undefined,
          paper: state.current.paperCode || undefined,
        });
        window.open(provider.buildUrl(query), "_blank", "noopener,noreferrer");
        return;
      }

      if (!noModifiers(event) || !state.current) return;

      if (key === "h" && state.handbookHref) {
        event.preventDefault();
        window.open(state.handbookHref, "_blank", "noopener,noreferrer");
        return;
      }

      if (key === "f") {
        if (!onToggleFavorite) return;
        event.preventDefault();
        void onToggleFavorite(state.current.questionId);
        return;
      }

      if (key === "n") {
        event.preventDefault();
        noteButtonRef.current?.toggleEditor();
        return;
      }

      if (key === "x") {
        event.preventDefault();
        const text = formatQuestionText({
          number: state.current.question.number,
          question: state.current.question.question,
          options: state.current.question.options,
          ref: state.current.question.ref || undefined,
          paper: state.current.paperCode || undefined,
        });
        void writeTextToClipboard(text).then((copied) => {
          toast(copied ? "已複製題目" : "複製失敗");
        });
      }
    },
    { enabled: !finished }
  );

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
              <Button variant="ghost" size="sm" onClick={handleExit} disabled={isPersisting}>
                <X className="w-4 h-4 mr-1" />
                {isPersisting ? "儲存中..." : "退出"}
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
              <Button variant="outline" onClick={handleExit} className="flex-1" disabled={isPersisting}>
                {isPersisting ? "儲存中..." : "返回列表"}
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
          <Button variant="ghost" size="sm" onClick={handleExit} disabled={isPersisting}>
            <X className="w-4 h-4 mr-1" />
            {isPersisting ? "儲存中..." : "退出練習"}
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
              handbookHref ? (
                <a
                  href={handbookHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="在新分頁開啟研習手冊對應章節 (H)"
                >
                  <Badge
                    variant="outline"
                    className="text-xs hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    {current.question.ref}
                  </Badge>
                </a>
              ) : (
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
              )
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
                paper={current.paperCode || undefined}
                size="xs"
                showShortcutHints
              />
            </div>
          </div>
          <CardTitle className="text-base leading-relaxed mt-2">
            <QuestionStem text={current.question.question} />
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
                title={`選擇 ${letter.toUpperCase()} (${getAnswerShortcutLabel(letter)})`}
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
                    答錯。正確答案：{correctLetter.toUpperCase()}
                  </>
                )}
              </p>
              {hasPrevAnswer ? (
                <p className="text-xs text-muted-foreground mt-1">
                  之前的答案：{prevRaw!.toUpperCase()}
                </p>
              ) : prevRaw === "" ? (
                <p className="text-xs text-muted-foreground mt-1">
                  之前的答案：（未作答）
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

      <div className="mt-4 flex items-center justify-center gap-1 md:gap-2 flex-wrap">
        <Button
          variant="ghost"
          onClick={() => void onToggleFavorite?.(current.questionId)}
          disabled={!onToggleFavorite || isPersisting}
          title={isFavorite ? "取消收藏 (F)" : "收藏 (F)"}
        >
          <Star
            className={cn(
              "w-4 h-4 md:mr-1",
              isFavorite && "fill-yellow-400 text-yellow-400"
            )}
          />
          <span className="hidden md:inline">{isFavorite ? "已收藏" : "收藏"}</span>
        </Button>
        <NoteButton
          ref={noteButtonRef}
          questionId={current.questionId}
          content={currentNote}
          onChange={(newContent) => {
            setNotes((previous) => {
              const next = { ...previous };
              if (newContent === null) delete next[current.questionId];
              else next[current.questionId] = newContent;
              return next;
            });
            toast(newContent === null ? "筆記已刪除" : "筆記已儲存");
          }}
          size="sm"
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentIdx === 0 || isPersisting}
          title="上一題 (←)"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一題
        </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={requestRestart}
            disabled={isPersisting}
            title="清除本輪答案並回到第 1 題，不影響歷史記錄"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            重新開始本輪
          </Button>
        {currentIdx < total - 1 ? (
          <Button onClick={goNext} disabled={isPersisting} title="下一題 (→ / Enter)">
            下一題
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={goNext}
            variant="default"
            disabled={isPersisting}
            title="完成 (→ / Enter)"
          >
            {isPersisting ? "儲存中..." : "完成"}
            <Check className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>

      <ShortcutHints
        className="mt-3"
        hints={[
          { id: "previous", key: "←", label: "上一題" },
          { id: "next", key: "→", label: currentIdx < total - 1 ? "下一題" : "完成" },
          { id: "answer", key: "1-4 / A-D", label: "選答" },
          { id: "enter", key: "Enter", label: currentIdx < total - 1 ? "下一題" : "完成" },
          { id: "favorite", key: "F", label: "收藏" },
          { id: "note", key: "N", label: "筆記" },
          { id: "copy", key: "X", label: "複製題目" },
          ...(handbookHref
            ? [{ id: "handbook", key: "H", label: "研習手冊" }]
            : []),
        ]}
        includeSearchProviders
      />

      <ToastContainer toasts={toasts} />
      <RestartConfirmationDialog
        open={isRestartConfirmOpen}
        onOpenChange={setIsRestartConfirmOpen}
        onConfirm={confirmRestart}
        disabled={isPersisting}
      />
    </div>
  );
}

function RestartConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>重新開始本輪練習？</DialogTitle>
          <DialogDescription>
            本輪已選擇的答案將被清除，並回到第 1 題。歷史答題記錄、錯題本、收藏和筆記均不會刪除。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>
            繼續目前練習
          </Button>
          <Button onClick={onConfirm} disabled={disabled}>
            重新開始本輪
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
