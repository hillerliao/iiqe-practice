"use client";

import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

type NoteSectionProps = {
  /** 筆記內容;為 null/空字串時不渲染 */
  content: string | null | undefined;
  className?: string;
  /** 是否顯示緊湊樣式(預設為完整樣式) */
  compact?: boolean;
};

/**
 * 只讀筆記展示塊 — 用於收藏/錯題/結果頁。
 * 沒有筆記時返回 null(由父組件決定是否顯示「無筆記」占位)。
 */
export function NoteSection({ content, className, compact = false }: NoteSectionProps) {
  if (!content || content.trim().length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50/60",
        compact ? "p-2" : "p-3",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1.5">
        <NotebookPen className="w-3 h-3 fill-amber-100" />
        <span>我的筆記</span>
      </div>
      <p
        className={cn(
          "text-zinc-800 whitespace-pre-wrap break-words leading-relaxed",
          compact ? "text-xs" : "text-sm"
        )}
      >
        {content}
      </p>
    </div>
  );
}
