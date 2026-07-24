"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  Eye,
  EyeOff,
  Play,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authedFetch } from "@/lib/session-client";
import { Explanation } from "@/components/Explanation";
import { QuestionActions } from "@/components/QuestionActions";
import { QuestionStem } from "@/components/QuestionStem";
import { NoteSection } from "@/components/NoteSection";
import { PracticeOption, type OptionLetter } from "@/components/PracticeOption";
import { RedoPractice, type RedoItem, type RedoPracticeState } from "@/components/RedoPractice";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToastContainer, useToast } from "@/components/useToast";
import { getSessionId } from "@/lib/session";
import {
  createRedoSubmissionId,
  createWrongbookDraft,
  getWrongbookDraftKey,
  parseWrongbookDraft,
  reconcileWrongbookDraft,
  type RedoPracticeDraft,
} from "@/lib/redo-practice-draft";
import {
  DEFAULT_REPEATED_THRESHOLD,
  MAX_REPEATED_THRESHOLD,
  MIN_REPEATED_THRESHOLD,
  getWrongbookThresholdKey,
  normalizeRepeatedThreshold,
} from "@/lib/wrongbook-filter";

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

type WrongbookView = "all" | "repeated";

const PAPER_FILTER_ALL = "all";

function paperFilterLabel(code: string) {
  return code === "P1" ? "卷一 P1" : code === "P3" ? "卷三 P3" : code;
}

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
              重複答錯 · 已答錯 {item.wrongCount} 次
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
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
          </div>
        </div>
        <CardTitle className="text-base leading-relaxed mt-2">
          <QuestionStem text={q.question} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">選擇答案以複習作答</p>
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
              ? "✓ 複習時答對了"
              : `✗ 答錯。正確答案：${correctLetter.toUpperCase()}`}
          </div>
        )}

        {revealed && (
          <div className="p-3 rounded-lg border border-border bg-muted/50 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">之前的答案：</span>{" "}
              <span className="text-red-600 dark:text-red-400 font-medium">
                {userLetter
                  ? `${userLetter.toUpperCase()}${
                      q.options[userLetter] ? ` — ${q.options[userLetter]}` : ""
                    }`
                  : "(未作答)"}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">正確答案：</span>{" "}
              <span className="text-green-700 dark:text-green-400 font-medium">
                {correctLetter.toUpperCase()} — {q.options[correctLetter]}
              </span>
            </p>
            {q.explanation && (
              <Explanation text={q.explanation} prefix="💡" className="text-muted-foreground text-xs mt-2" />
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
  const [view, setView] = useState<WrongbookView>("all");
  const [paperFilter, setPaperFilter] = useState<string>(PAPER_FILTER_ALL);
  const [threshold, setThreshold] = useState(DEFAULT_REPEATED_THRESHOLD);
  const [thresholdInput, setThresholdInput] = useState(
    String(DEFAULT_REPEATED_THRESHOLD),
  );
  const thresholdKeyRef = useRef<string | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [practiceDraft, setPracticeDraft] = useState<RedoPracticeDraft | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(new Set());
  const favoriteRequestsRef = useRef<Set<string>>(new Set());
  const { toast, toasts } = useToast();

  useEffect(() => {
    Promise.all([
      authedFetch(`/api/wrongbook`).then(async (response) => {
        if (!response.ok) throw new Error("載入錯題本失敗");
        return response.json();
      }),
      authedFetch(`/api/favorites`)
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .catch(() => ({ items: [] })),
    ])
      .then(([wrongbookData, favoritesData]) => {
        const nextItems: WrongItem[] = wrongbookData.items;
        setItems(nextItems);
        const sessionId = getSessionId();
        const thresholdKey = getWrongbookThresholdKey(sessionId);
        thresholdKeyRef.current = thresholdKey;
        const storedThreshold = normalizeRepeatedThreshold(
          localStorage.getItem(thresholdKey),
        );
        setThreshold(storedThreshold);
        setThresholdInput(String(storedThreshold));
        const draftKey = getWrongbookDraftKey(sessionId);
        draftKeyRef.current = draftKey;
        const restored = reconcileWrongbookDraft(
          parseWrongbookDraft(localStorage.getItem(draftKey)),
          nextItems.map((item) => item.questionId),
        );
        if (restored) {
          localStorage.setItem(draftKey, JSON.stringify(restored));
          setPracticeDraft(restored);
          setShuffle(restored.shuffle);
          setPracticeMode(true);
        } else {
          localStorage.removeItem(draftKey);
          setPracticeDraft(null);
          setPracticeMode(false);
        }
        setFavoriteIds(
          new Set<string>(
            favoritesData.items.map((item: { questionId: string }) => item.questionId)
          )
        );
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const paperCodes = useMemo(
    () => [...new Set(items.map((item) => item.paperCode))].sort(),
    [items],
  );
  const paperFilteredItems = useMemo(
    () =>
      paperFilter === PAPER_FILTER_ALL
        ? items
        : items.filter((item) => item.paperCode === paperFilter),
    [items, paperFilter],
  );
  const repeatedItems = useMemo(
    () => paperFilteredItems.filter((item) => item.wrongCount >= threshold),
    [paperFilteredItems, threshold],
  );
  const visibleItems = view === "all" ? paperFilteredItems : repeatedItems;
  const isFiltered = paperFilter !== PAPER_FILTER_ALL || view === "repeated";

  const practiceItems = useMemo(() => {
    if (!practiceDraft) return [];
    const itemById = new Map(items.map((item) => [item.questionId, item]));
    return practiceDraft.questionIds
      .map((questionId) => itemById.get(questionId))
      .filter((item): item is WrongItem => item != null);
  }, [items, practiceDraft]);

  const applyThreshold = useCallback((raw: string) => {
    const next = normalizeRepeatedThreshold(raw);
    setThreshold(next);
    setThresholdInput(String(next));
    const key = thresholdKeyRef.current;
    if (key) localStorage.setItem(key, String(next));
  }, []);

  const toggleFavorite = useCallback(
    async (questionId: string) => {
      if (favoriteRequestsRef.current.has(questionId)) return;
      favoriteRequestsRef.current.add(questionId);
      const wasFavorite = favoriteIds.has(questionId);
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.delete(questionId);
        else next.add(questionId);
        return next;
      });

      try {
        const response = wasFavorite
          ? await authedFetch(
              `/api/favorites?questionId=${encodeURIComponent(questionId)}`,
              { method: "DELETE" }
            )
          : await authedFetch("/api/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionId }),
            });
        if (!response.ok) throw new Error("收藏操作失敗");
      } catch {
        setFavoriteIds((current) => {
          const next = new Set(current);
          if (wasFavorite) next.add(questionId);
          else next.delete(questionId);
          return next;
        });
        toast("收藏操作失敗");
      } finally {
        favoriteRequestsRef.current.delete(questionId);
      }
    },
    [favoriteIds, toast]
  );

  const saveDraft = useCallback((draft: RedoPracticeDraft) => {
    setPracticeDraft(draft);
    const key = draftKeyRef.current;
    if (key) localStorage.setItem(key, JSON.stringify(draft));
  }, []);

  const startPractice = useCallback(() => {
    const draft = createWrongbookDraft(
      visibleItems.map((item) => item.questionId),
      shuffle,
    );
    saveDraft(draft);
    setPracticeMode(true);
  }, [visibleItems, saveDraft, shuffle]);

  const updatePracticeState = useCallback(
    (state: RedoPracticeState) => {
      setPracticeDraft((current) => {
        if (!current) return current;
        const next = { ...current, ...state, updatedAt: Date.now() };
        const key = draftKeyRef.current;
        if (key) localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const restartPractice = useCallback(() => {
    setPracticeDraft((current) => {
      if (!current) return current;
      const next = {
        ...current,
        submissionId: createRedoSubmissionId(),
        updatedAt: Date.now(),
      };
      const key = draftKeyRef.current;
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, []);

  // 將重做練習的作答寫回後端(/api/wrongbook/record),讓「又錯了」累積進 wrongCount
  // 注意:失敗時要拋出(而非吞掉),persistAnswers 的 .catch 才會重置 recordedRef 以便重試
  const recordRedo = useCallback(
    async (answers: Record<string, string>) => {
      const payload = practiceItems
        .map((it) => ({ questionId: it.questionId, userAnswer: answers[it.questionId] }))
        .filter((a) => a.userAnswer != null && a.userAnswer !== "");
      if (payload.length === 0) return;
      const r = await authedFetch("/api/wrongbook/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: payload,
          submissionId: practiceDraft?.submissionId,
        }),
      });
      if (!r.ok) {
        throw new Error(`記錄重做結果失敗: ${r.status}`);
      }
    },
    [practiceItems, practiceDraft?.submissionId]
  );

  // 退出重做模式:重新整理錯題本,使更新後的 wrongCount / 反覆錯標籤立即反映
  const handleExit = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/wrongbook`);
      if (r.ok) {
        const data = await r.json();
        setItems(data.items);
      }
    } catch {
      /* 重新整理失敗不阻斷退出 */
    }
    setPracticeMode(false);
    setPracticeDraft(null);
    const key = draftKeyRef.current;
    if (key) localStorage.removeItem(key);
  }, []);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  // 做題模式
  if (practiceMode && practiceDraft) {
    const orderedItems = practiceItems;
    const isFocusedPractice = practiceDraft.questionIds.length < items.length;
    const redoItems: RedoItem[] = orderedItems.map((it) => ({
      questionId: it.questionId,
      paperCode: it.paperCode,
      paperName: it.paperName,
      question: it.question,
    }));
    const prevAnswerMap = new Map(orderedItems.map((it) => [it.questionId, it.userAnswer]));

    return (
      <>
        <RedoPractice
          items={redoItems}
          title={isFocusedPractice ? "錯題本 · 重點重做" : "錯題本 · 重做練習"}
          prevUserAnswer={(id) => prevAnswerMap.get(id)}
          recordAnswers={practiceDraft.recorded ? undefined : recordRedo}
          initialState={practiceDraft}
          onStateChange={updatePracticeState}
          onRestart={restartPractice}
          shuffled={practiceDraft.shuffle}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onExit={handleExit}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  const isRepeatedView = view === "repeated";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">錯題本</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-sm flex-wrap justify-end">
            <span className="text-muted-foreground">
              共 {items.length} 題
              {isFiltered ? ` · 篩選後 ${visibleItems.length} 題` : ""}
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={shuffle}
                onCheckedChange={(checked) => setShuffle(checked === true)}
              />
              <Shuffle className="w-4 h-4" />
              <span>亂序</span>
            </label>
            <Button onClick={startPractice} disabled={visibleItems.length === 0}>
              <Play className="w-4 h-4 mr-1" />
              {isRepeatedView
                ? `重點重做（${visibleItems.length} 題）`
                : paperFilter !== PAPER_FILTER_ALL
                  ? `練習所選（${visibleItems.length} 題）`
                  : `練習全部（${items.length} 題）`}
            </Button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              {paperCodes.length > 1 && (
                <div
                  className="inline-flex rounded-lg border border-border overflow-hidden"
                  role="group"
                  aria-label="按卷別篩選"
                >
                  {[PAPER_FILTER_ALL, ...paperCodes].map((code, index) => (
                    <Button
                      key={code}
                      type="button"
                      variant={paperFilter === code ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "rounded-none border-0",
                        index > 0 && "border-l border-border",
                      )}
                      onClick={() => setPaperFilter(code)}
                    >
                      {code === PAPER_FILTER_ALL ? "全部卷別" : paperFilterLabel(code)}
                    </Button>
                  ))}
                </div>
              )}
              <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="錯題篩選">
                <Button
                  type="button"
                  variant={isRepeatedView ? "ghost" : "secondary"}
                  size="sm"
                  className="rounded-none border-0"
                  onClick={() => setView("all")}
                >
                  全部錯題
                </Button>
                <Button
                  type="button"
                  variant={isRepeatedView ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-none border-0 border-l border-border"
                  onClick={() => setView("repeated")}
                >
                  反覆錯 ≥{threshold} 題
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                累計答錯 ≥
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_REPEATED_THRESHOLD}
                  max={MAX_REPEATED_THRESHOLD}
                  value={thresholdInput}
                  onChange={(event) => setThresholdInput(event.target.value)}
                  onBlur={(event) => applyThreshold(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyThreshold(event.currentTarget.value);
                    }
                  }}
                  className="w-20 h-8 text-center"
                  aria-label="反覆錯題門檻"
                />
                次才算反覆錯
              </label>
              {isRepeatedView && repeatedItems.length > 0 && (
                <Badge variant="destructive">符合 {repeatedItems.length} 題</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>沒有符合條件的錯題</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {view === "repeated"
                ? `目前沒有累計答錯 ≥${threshold} 次的題目。可調低門檻或查看全部錯題。`
                : paperFilter !== PAPER_FILTER_ALL
                  ? "此卷別目前沒有錯題。可切換其他卷別或查看全部卷別。"
                  : "目前沒有符合條件的錯題。"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((it) => (
            <WrongItemCard key={it.questionId} item={it} />
          ))}
        </div>
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
