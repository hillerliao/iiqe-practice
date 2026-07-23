"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  Eye,
  EyeOff,
  RotateCcw,
  Play,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Explanation } from "@/components/Explanation";
import { authedFetch } from "@/lib/session-client";
import { QuestionActions } from "@/components/QuestionActions";
import { QuestionStem } from "@/components/QuestionStem";
import { NoteSection } from "@/components/NoteSection";
import { PracticeOption, type OptionLetter } from "@/components/PracticeOption";
import { RedoPractice, type RedoItem, type RedoPracticeState } from "@/components/RedoPractice";
import { Checkbox } from "@/components/ui/checkbox";
import { ToastContainer, useToast } from "@/components/useToast";
import { getSessionId } from "@/lib/session";
import {
  createRedoPracticeDraft,
  getRedoPracticeDraftKey,
  parseRedoPracticeDraft,
  reconcileRedoPracticeDraft,
  type RedoPracticeDraft,
} from "@/lib/redo-practice-draft";

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

const PAPER_FILTER_ALL = "all";

function paperFilterLabel(code: string) {
  return code === "P1" ? "卷一 P1" : code === "P3" ? "卷三 P3" : code;
}

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

export default function FavoritesPage() {
  const [items, setItems] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [paperFilter, setPaperFilter] = useState<string>(PAPER_FILTER_ALL);
  const [practiceDraft, setPracticeDraft] = useState<RedoPracticeDraft | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(new Set());
  const favoriteRequestsRef = useRef<Set<string>>(new Set());
  const { toast, toasts } = useToast();

  const load = () => {
    authedFetch(`/api/favorites`)
      .then((r) => {
        if (!r.ok) throw new Error("載入收藏失敗");
        return r.json();
      })
      .then((data) => {
        const nextItems: FavItem[] = data.items;
        setItems(nextItems);
        setFavoriteIds(new Set<string>(nextItems.map((item) => item.questionId)));
        const draftKey = getRedoPracticeDraftKey(getSessionId(), "favorites");
        draftKeyRef.current = draftKey;
        const restored = reconcileRedoPracticeDraft(
          parseRedoPracticeDraft(localStorage.getItem(draftKey), "favorites"),
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
        }
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
    const response = await authedFetch(
      `/api/favorites?questionId=${encodeURIComponent(qId)}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      toast("移除收藏失敗");
      return;
    }
    load();
  }

  async function toggleFavorite(questionId: string) {
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
        ? await authedFetch(`/api/favorites?questionId=${encodeURIComponent(questionId)}`, {
            method: "DELETE",
          })
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
  }

  const saveDraft = useCallback((draft: RedoPracticeDraft) => {
    setPracticeDraft(draft);
    const key = draftKeyRef.current;
    if (key) localStorage.setItem(key, JSON.stringify(draft));
  }, []);

  const paperCodes = useMemo(
    () => [...new Set(items.map((item) => item.paperCode))].sort(),
    [items],
  );
  const visibleItems = useMemo(
    () =>
      paperFilter === PAPER_FILTER_ALL
        ? items
        : items.filter((item) => item.paperCode === paperFilter),
    [items, paperFilter],
  );

  const startPractice = useCallback(() => {
    const draft = createRedoPracticeDraft(
      "favorites",
      visibleItems.map((item) => item.questionId),
      shuffle,
    );
    saveDraft(draft);
    setPracticeMode(true);
  }, [visibleItems, saveDraft, shuffle]);

  const updatePracticeState = useCallback((state: RedoPracticeState) => {
    setPracticeDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...state, updatedAt: Date.now() };
      const key = draftKeyRef.current;
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, []);

  async function exitPractice() {
    const key = draftKeyRef.current;
    if (key) localStorage.removeItem(key);
    setPracticeDraft(null);
    setPracticeMode(false);
    load();
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">載入中...</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  // 做題模式
  if (practiceMode && practiceDraft) {
    const itemById = new Map(items.map((item) => [item.questionId, item]));
    const orderedItems = practiceDraft.questionIds
      .map((questionId) => itemById.get(questionId))
      .filter((item): item is FavItem => item != null);
    const redoItems: RedoItem[] = orderedItems.map((it) => ({
      questionId: it.questionId,
      paperCode: it.paperCode,
      paperName: it.paperName,
      question: it.question,
    }));
    return (
      <>
        <RedoPractice
          items={redoItems}
          title="收藏題 · 重做練習"
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          onExit={exitPractice}
          initialState={practiceDraft}
          onStateChange={updatePracticeState}
          shuffled={practiceDraft.shuffle}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">收藏題</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              共 {items.length} 題
              {paperFilter !== PAPER_FILTER_ALL ? ` · 篩選後 ${visibleItems.length} 題` : ""}
            </span>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={shuffle}
                onCheckedChange={(checked) => setShuffle(checked === true)}
              />
              <Shuffle className="w-4 h-4" />
              亂序
            </label>
            <Button onClick={startPractice} disabled={visibleItems.length === 0}>
              <Play className="w-4 h-4 mr-1" />
              {paperFilter !== PAPER_FILTER_ALL
                ? `練習所選（${visibleItems.length} 題）`
                : "練習模式"}
            </Button>
          </div>
        )}
      </div>
      {items.length > 0 && paperCodes.length > 1 && (
        <Card className="mb-4">
          <CardContent>
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
          </CardContent>
        </Card>
      )}
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
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>沒有符合條件的收藏</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              此卷別目前沒有收藏題目。可切換其他卷別或查看全部卷別。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((it) => (
            <FavItemCard
              key={it.questionId}
              item={it}
              onRemove={remove}
            />
          ))}
        </div>
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
