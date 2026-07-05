"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type OptionLetter = "a" | "b" | "c" | "d";

type PracticeOptionProps = {
  letter: OptionLetter;
  text: string;
  isPicked: boolean;
  /** 已小寫的正確選項字母,用於判定此選項是否為正確答案 */
  correctLetter: string;
  /** 是否顯示對錯反饋(已答題後為 true) */
  showResult: boolean;
  onPick: (letter: OptionLetter) => void;
  /** 額外禁用,例如外部流程鎖定時 */
  disabled?: boolean;
};

/**
 * 答題選項按鈕 — 列表模式 / 練習模式 共用。
 * 未作答:藍色 hover;已作答:正確綠、選錯紅、其他灰色。
 */
export function PracticeOption({
  letter,
  text,
  isPicked,
  correctLetter,
  showResult,
  onPick,
  disabled,
}: PracticeOptionProps) {
  const isThisCorrect = correctLetter === letter;
  const isDisabled = disabled || showResult;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onPick(letter)}
      className={cn(
        "w-full text-left p-3 rounded-lg border-2 transition-colors flex items-start gap-3",
        !showResult &&
          "border-zinc-200 hover:border-blue-400 hover:bg-blue-50/50",
        showResult && isThisCorrect && "border-green-500 bg-green-50",
        showResult && isPicked && !isThisCorrect && "border-red-500 bg-red-50",
        showResult && !isPicked && !isThisCorrect && "border-zinc-200 opacity-60"
      )}
    >
      <span
        className={cn(
          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-medium text-sm",
          !showResult && "bg-zinc-100 text-zinc-700",
          showResult && isThisCorrect && "bg-green-600 text-white",
          showResult && isPicked && !isThisCorrect && "bg-red-600 text-white",
          showResult && !isPicked && !isThisCorrect && "bg-zinc-100 text-zinc-500"
        )}
      >
        {letter.toUpperCase()}
      </span>
      <span className="flex-1 text-sm leading-relaxed pt-0.5">{text}</span>
      {showResult && isThisCorrect && (
        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-1" />
      )}
      {showResult && isPicked && !isThisCorrect && (
        <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-1" />
      )}
    </button>
  );
}
