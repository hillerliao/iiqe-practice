"use client";

// 考試倒數徽章:常駐於頂欄 logo 右上角(像通知徽章),
// 點擊展開小面板設定/修改考試日期;日期存 localStorage,全頁共用。

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, CalendarPlus, Trash2 } from "lucide-react";

const STORAGE_KEY = "iiqe-exam-date";

function getDaysRemaining(target: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(target + "T00:00:00");
  return Math.ceil((exam.getTime() - now.getTime()) / 86400000);
}

function formatExamDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function ExamCountdownBadge({ children }: { children: React.ReactNode }) {
  const [examDate, setExamDate] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [inputDate, setInputDate] = useState("");
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setExamDate(stored);
  }, []);

  // 點外面 / 按 Esc 關閉面板
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSave = useCallback(() => {
    if (!inputDate) return;
    localStorage.setItem(STORAGE_KEY, inputDate);
    setExamDate(inputDate);
    setOpen(false);
  }, [inputDate]);

  const handleClear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setExamDate(null);
    setInputDate("");
    setOpen(false);
  }, []);

  if (!mounted) return null;

  const days = examDate ? getDaysRemaining(examDate) : null;

  // 徽章外觀:依剩餘天數分級配色
  let badgeColor = "";
  let pulse = false;
  if (days === null) {
    badgeColor =
      "border-dashed border-muted-foreground/50 bg-background text-muted-foreground hover:text-foreground hover:border-foreground/60";
  } else if (days < 0) {
    badgeColor = "bg-muted text-muted-foreground";
  } else if (days === 0) {
    badgeColor = "bg-red-600 text-white";
    pulse = true;
  } else if (days <= 7) {
    badgeColor = "bg-red-600 text-white";
    pulse = true;
  } else if (days <= 30) {
    badgeColor = "bg-amber-500 text-white";
  } else {
    badgeColor = "bg-emerald-600 text-white";
  }

  const badgeLabel =
    days === null ? null : days < 0 ? "已過" : days === 0 ? "今天" : days > 99 ? "99+" : `${days}天`;

  return (
    <div ref={wrapRef} className="relative h-full flex items-center shrink-0">
      {children}

      {/* ── 蓋在 logo 右上角的徽章 ── */}
      <button
        type="button"
        onClick={() => {
          if (examDate) setInputDate(examDate);
          setOpen((v) => !v);
        }}
        title={examDate ? `考試倒數:${formatExamDate(examDate)}` : "設定考試日期"}
        aria-label={examDate ? `考試倒數 ${badgeLabel}` : "設定考試日期"}
        className={[
          "absolute top-2 -right-2.5 z-20 flex items-center justify-center",
          "min-w-[18px] h-[18px] px-1 rounded-full border text-[10px] font-bold leading-none",
          "ring-2 ring-background transition-transform duration-150 hover:scale-110 active:scale-95",
          "cursor-pointer select-none",
          badgeColor,
          pulse ? "animate-countdown-pulse" : "",
        ].join(" ")}
      >
        {days === null ? (
          <CalendarPlus className="w-2.5 h-2.5" />
        ) : (
          <span className="tabular-nums tracking-tight">{badgeLabel}</span>
        )}
      </button>

      {/* ── 點擊展開的設定面板 ── */}
      {open && (
        <div className="absolute left-0 top-full z-50 pt-2.5 animate-countdown-pop-in">
          <div className="w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" />
                考試倒數
              </p>
              {examDate && days !== null && days >= 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  還有 <b className="text-foreground">{days}</b> 天
                </span>
              )}
            </div>

            {examDate && (
              <p className="text-xs text-muted-foreground">
                考試日期:{formatExamDate(examDate)}
              </p>
            )}

            <div className="space-y-2">
              <Input
                type="date"
                value={inputDate}
                onChange={(e) => setInputDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
                className="h-8 text-sm"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!inputDate}>
                  儲存
                </Button>
                {examDate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={handleClear}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    清除
                  </Button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              設定後會在左上角 logo 顯示倒數天數,僅儲存在此瀏覽器。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
