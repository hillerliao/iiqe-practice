"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotebookPen, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { NoteSection } from "@/components/NoteSection";
import { QuestionStem } from "@/components/QuestionStem";
import { authedFetch } from "@/lib/session-client";

type NoteItem = {
  questionId: string;
  content: string;
  updatedAt: string;
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
  };
};

type NoteItemCardProps = {
  item: NoteItem;
  onDeleted: () => void;
};

/**
 * 筆記本頁卡片 — 獨立組件,顯示題目摘要 + 筆記。
 * 不耦合收藏頁的 revealed/picked 狀態。
 */
export function NoteItemCard({ item, onDeleted }: NoteItemCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = item.question;
  const correctLetter = (q.answer || "").toLowerCase();

  async function handleDelete() {
    if (!window.confirm(`刪除第 ${q.number} 題的筆記?`)) return;
    setDeleting(true);
    setError(null);
    try {
      // 會話 ID 由簽名 Cookie 在服務端推導,客戶端不再上送 sessionId
      const res = await authedFetch(
        `/api/notes?questionId=${encodeURIComponent(item.questionId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
      setDeleting(false);
    }
  }

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
            <span className="text-xs text-muted-foreground">
              {new Date(item.updatedAt).toLocaleDateString("zh-HK")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setShowAnswer((v) => !v)}
            >
              {showAnswer ? (
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
              type="button"
              variant="ghost"
              size="xs"
              asChild
            >
              <Link href={`/practice?questionId=${item.questionId}`}>
                <ExternalLink className="w-3 h-3 mr-1" />
                去答題
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              刪除
            </Button>
          </div>
        </div>
        <CardTitle className="text-base leading-relaxed mt-2">
          <QuestionStem text={q.question} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 筆記主塊 */}
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 mb-1.5">
            <NotebookPen className="w-3 h-3 fill-amber-100 dark:fill-amber-900/50" />
            <span>我的筆記</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {item.content}
          </p>
        </div>

        {/* 答案(可選展開) */}
        {showAnswer && (
          <div className="p-3 rounded-lg border border-border bg-muted/50 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">正確答案：</span>{" "}
              <span className="text-green-700 dark:text-green-300 font-medium">
                {correctLetter.toUpperCase()} — {q.options[correctLetter]}
              </span>
            </p>
            {q.explanation && (
              <p className="text-foreground text-xs mt-2 leading-relaxed">
                💡 {q.explanation}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
