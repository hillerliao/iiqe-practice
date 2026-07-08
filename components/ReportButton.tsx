"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Flag, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const MAX_DESC_LEN = 500;

type Category = "question_error" | "answer_error" | "explanation_unclear" | "typo";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "question_error", label: "題目有錯" },
  { value: "answer_error", label: "答案有錯" },
  { value: "explanation_unclear", label: "解析不清" },
  { value: "typo", label: "排版錯誤" },
];

type ReportButtonProps = {
  /** 題目 ID,如 P1-exam-1 (會從中拆出 paperCode + source 顯示) */
  questionId: string;
  /** 已作答答案(可選) */
  userAnswer?: string | null;
  size?: "xs" | "sm" | "default";
  className?: string;
  /** 提交成功回調(可選,父組件可用來 toast) */
  onSubmitted?: () => void;
};

export type ReportButtonHandle = {
  open: () => void;
};

/**
 * 題目反饋按鈕 + popover,供用戶回報錯題。
 * - 單擊觸發 → 開啟 popover
 * - 內含 4 選 1 的單選(題目錯 / 答案錯 / 解析不清 / 排版錯)+ 描述 textarea
 * - 提交後調用 /api/feedback
 * - Esc 關閉,Cmd/Ctrl+Enter 提交
 */
export const ReportButton = forwardRef<ReportButtonHandle, ReportButtonProps>(
  function ReportButton(
    { questionId, userAnswer, size = "xs", className, onSubmitted },
    ref
  ) {
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState<Category | "">("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const parts = questionId.split("-");
    const paperCode = parts[0] ?? "";
    const source = parts[1] ?? "";
    const sourceLabel = source === "exam" ? "真題" : source === "mock" ? "模擬題" : "";
    const number = parts.slice(2).join("-");

    useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

    useEffect(() => {
      if (!open) return;
      setCategory("");
      setDescription("");
      setError(null);
    }, [open, questionId]);

    useEffect(() => {
      if (!open) return;
      function onDocPointerDown(e: PointerEvent) {
        const target = e.target as Node | null;
        if (!target || !wrapperRef.current) return;
        if (wrapperRef.current.contains(target)) return;
        setOpen(false);
      }
      document.addEventListener("pointerdown", onDocPointerDown);
      return () => document.removeEventListener("pointerdown", onDocPointerDown);
    }, [open]);

    async function handleSubmit() {
      if (!category) {
        setError("請先選擇一種類型");
        return;
      }
      const trimmed = description.trim();
      if (trimmed.length > MAX_DESC_LEN) {
        setError(`說明不可超過 ${MAX_DESC_LEN} 字`);
        return;
      }

      setSaving(true);
      setError(null);
      try {
        const sessionId = localStorage.getItem("iiqe:sessionId") ?? "";
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            questionId,
            category,
            description: trimmed,
            userAnswer: userAnswer ?? null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        setOpen(false);
        onSubmitted?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "提交失敗");
      } finally {
        setSaving(false);
      }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    }

    const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

    return (
      <div
        ref={wrapperRef}
        className={cn("relative inline-flex flex-col items-end", className)}
      >
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => setOpen((v) => !v)}
          title="回報題目問題"
        >
          <Flag className={cn(iconSize, "md:mr-1")} />
          <span className="hidden md:inline">報錯</span>
        </Button>

        {open && (
          <div className="absolute bottom-full right-0 mb-2 w-96 max-w-[calc(100vw-2rem)] p-3 rounded-lg border border-border bg-popover shadow-lg text-left space-y-2 z-20">
            <div className="text-xs text-muted-foreground">
              {paperCode}
              {sourceLabel ? ` · ${sourceLabel}` : ""}
              {number ? ` · #${number}` : ""}
            </div>

            <RadioGroup
              value={category}
              onValueChange={(v) => setCategory(v as Category)}
              className="gap-1.5"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer text-sm",
                    "hover:bg-muted/50 transition-colors",
                    "has-[[data-checked]]:border-primary has-[[data-checked]]:bg-muted/40"
                  )}
                >
                  <RadioGroupItem value={opt.value} aria-label={opt.label} />
                  <span className="flex-1">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>

            <textarea
              value={description}
              onChange={(e) => {
                const v = e.target.value;
                if (v.length <= MAX_DESC_LEN) {
                  setDescription(v);
                } else {
                  setDescription(v.slice(0, MAX_DESC_LEN));
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="補充說明 (選填,Esc 取消,Cmd/Ctrl+Enter 提交)"
              className="w-full min-h-20 max-h-48 p-2 text-sm rounded border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y whitespace-pre-wrap break-words"
              rows={3}
            />

            <div className="flex items-center justify-between text-xs">
              <span
                className={cn(
                  "tabular-nums",
                  description.length > MAX_DESC_LEN * 0.9
                    ? "text-muted-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                {description.length}/{MAX_DESC_LEN}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  <X className={iconSize} />
                  取消
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  <Send className={iconSize} />
                  {saving ? "送出中..." : "送出"}
                </Button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
      </div>
    );
  }
);
