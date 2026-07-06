"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { NotebookPen, Save, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_LEN = 1000;

type NoteButtonProps = {
  questionId: string;
  /** 受控:當前筆記內容(空字串表示無筆記) */
  content: string;
  /** 變更回調:新內容或 null(刪除) */
  onChange: (newContent: string | null) => void;
  size?: "xs" | "sm" | "default";
  className?: string;
};

export type NoteButtonHandle = {
  /** 切換編輯器:關閉 → 開啟,開啟+查看 → 關閉,開啟+編輯中 → 外部 keydown 已被 textarea 攔截不會走到這 */
  toggleEditor: () => void;
};

/**
 * 筆記按鈕 + 內聯編輯器(改為 popover,錨點在按鈕右上方)。
 * - 兩態:無筆記(灰) / 有筆記(琥珀高亮)
 * - 點擊 / 外部 toggleEditor() 切換「查看 ↔ 編輯」面板
 * - 編輯時自動 focus,Esc 取消,Cmd/Ctrl+Enter 儲存
 * - 獨立刪除按鈕(僅在有筆記時顯示)
 */
export const NoteButton = forwardRef<NoteButtonHandle, NoteButtonProps>(function NoteButton(
  { questionId, content, onChange, size = "xs", className },
  ref
) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hasNote = content.trim().length > 0;

  // 當外部 content 變化(切題或父組件更新)時,同步 draft
  useEffect(() => {
    setDraft(content);
    // 切題後關閉面板
    setOpen(false);
    setEditing(false);
    setError(null);
  }, [questionId, content]);

  // 編輯模式開啟時自動 focus
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // 游標移到末尾
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  // 暴露 toggleEditor 給外部快捷鍵(N)使用
  useImperativeHandle(
    ref,
    () => ({
      toggleEditor: () => {
        setOpen((prev) => {
          // 開啟 + 查看中 → 關閉
          if (prev && !editing) return false;
          // 開啟 + 編輯中 → 外部 keydown 已被 textarea 攔截,理論上不會到這
          if (prev && editing) return prev;
          // 關閉 → 開啟;若無筆記直接進入編輯
          if (!hasNote) {
            setEditing(true);
            setDraft("");
          }
          return true;
        });
      },
    }),
    [editing, hasNote]
  );

  // 點擊外部關閉面板
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target || !wrapperRef.current) return;
      if (wrapperRef.current.contains(target)) return;
      // 點到 Radix Popper 等 portal 元素不關閉(此元件未使用,留作日後擴展)
      setOpen(false);
      setEditing(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  async function handleSave() {
    const trimmed = draft.trim();
    setSaving(true);
    setError(null);
    try {
      const sessionId = localStorage.getItem("iiqe:sessionId") ?? "";
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId,
          content: trimmed,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      // 通知父組件;空內容後端已自動刪除
      onChange(trimmed.length > 0 ? trimmed : null);
      setDraft(trimmed);
      setEditing(false);
      setOpen(trimmed.length > 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!hasNote) return;
    if (!window.confirm("確定刪除此筆記?此操作無法復原。")) return;
    setSaving(true);
    setError(null);
    try {
      const sessionId = localStorage.getItem("iiqe:sessionId") ?? "";
      const res = await fetch(
        `/api/notes?sessionId=${encodeURIComponent(sessionId)}&questionId=${encodeURIComponent(questionId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChange(null);
      setDraft("");
      setOpen(false);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(content);
    setEditing(false);
    setOpen(false);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Esc 取消
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
    // Cmd/Ctrl + Enter 儲存
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  function handleTriggerClick() {
    setOpen((prev) => {
      if (prev && !editing) return false;
      if (prev && editing) return prev;
      if (!hasNote) {
        setEditing(true);
        setDraft("");
      }
      return true;
    });
  }

  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <div
      ref={wrapperRef}
      className={cn("relative inline-flex flex-col items-end", className)}
    >
      {/* 觸發按鈕 */}
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={handleTriggerClick}
        title={hasNote ? "查看/編輯筆記 (N)" : "新增筆記 (N)"}
        className={cn(
          hasNote &&
            "text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
        )}
      >
        <NotebookPen
          className={cn(iconSize, "md:mr-1", hasNote && "fill-amber-100 dark:fill-amber-900/50")}
        />
        <span className="hidden md:inline">{hasNote ? "筆記" : "加筆記"}</span>
      </Button>

      {/* Popover 面板(在按鈕右上方浮出) */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-96 max-w-[calc(100vw-2rem)] p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-popover shadow-lg text-left space-y-2 z-20">
          {editing ? (
            <>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length <= MAX_LEN) {
                    setDraft(v);
                  } else {
                    setDraft(v.slice(0, MAX_LEN));
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="輸入筆記... (Esc 取消, Cmd/Ctrl+Enter 儲存)"
                className="w-full min-h-24 max-h-64 p-2 text-sm rounded border border-amber-300 dark:border-amber-700 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-y whitespace-pre-wrap break-words"
                rows={4}
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    "tabular-nums",
                    draft.length > MAX_LEN * 0.9
                      ? "text-amber-700 dark:text-amber-300 font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {draft.length}/{MAX_LEN}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    <X className={iconSize} />
                    取消
                  </Button>
                  {hasNote && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleDelete}
                      disabled={saving}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className={iconSize} />
                      刪除
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="default"
                    size="xs"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save className={iconSize} />
                    {saving ? "儲存中..." : "儲存"}
                  </Button>
                </div>
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </>
          ) : (
            <>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {content}
              </p>
              <div className="flex items-center justify-end gap-1">
                {hasNote && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleDelete}
                    disabled={saving}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className={iconSize} />
                    刪除
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setEditing(true)}
                >
                  編輯
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
