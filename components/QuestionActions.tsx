"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuestionText } from "@/components/CopyQuestionButton";
import { QuestionSearchMenu } from "@/components/QuestionSearchButtons";
import { writeTextToClipboard } from "@/lib/clipboard";

type QuestionActionsProps = {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
  paper?: string;
  className?: string;
  size?: "xs" | "sm" | "default";
  showShortcutHints?: boolean;
};

export function QuestionActions({
  number,
  question,
  options,
  ref,
  paper,
  className,
  size = "xs",
  showShortcutHints = false,
}: QuestionActionsProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  async function handleCopy() {
    setCopyFailed(false);
    const text = formatQuestionText({ number, question, options, ref, paper });
    const succeeded = await writeTextToClipboard(text);
    if (!succeeded) {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 1600);
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      <QuestionSearchMenu
        number={number}
        question={question}
        options={options}
        ref={ref}
        paper={paper}
        size={size}
        showShortcutHints={showShortcutHints}
      />
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={() => void handleCopy()}
        title={showShortcutHints ? "複製題目 (X)" : "複製題目"}
      >
        {copied ? (
          <Check className={cn(iconSize, "text-green-600 dark:text-green-400")} />
        ) : (
          <Copy
            className={cn(
              iconSize,
              copyFailed && "text-red-600 dark:text-red-400"
            )}
          />
        )}
        <span className="sr-only">
          {copied ? "已複製" : copyFailed ? "複製失敗" : "複製題目"}
        </span>
      </Button>
    </div>
  );
}
