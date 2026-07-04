"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyQuestionButtonProps = {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
  className?: string;
  variant?: "ghost" | "outline";
  size?: "xs" | "sm" | "default";
  label?: boolean;
};

/**
 * 將題幹與選項格式化為純文字,方便貼到其他地方使用。
 * 格式:
 *   #1 [REF]
 *   題幹
 *   A. 選項A
 *   B. 選項B
 *   ...
 */
export function formatQuestionText(opts: {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
}): string {
  const { number, question, options, ref } = opts;
  const lines: string[] = [];
  const header = [
    number != null ? `#${number}` : "",
    ref ? `[${ref}]` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (header) lines.push(header);
  lines.push(question.trim());
  for (const letter of ["a", "b", "c", "d"] as const) {
    const text = options[letter];
    if (text) {
      lines.push(`${letter.toUpperCase()}. ${text}`);
    }
  }
  return lines.join("\n");
}

export function CopyQuestionButton({
  number,
  question,
  options,
  ref,
  className,
  variant = "ghost",
  size = "xs",
  label = false,
}: CopyQuestionButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = formatQuestionText({ number, question, options, ref });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn(className)}
      title="複製題幹與選項"
    >
      {copied ? (
        <Check className={cn(size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5", "mr-1 text-green-600")} />
      ) : (
        <Copy className={cn(size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5", "mr-1")} />
      )}
      {copied ? "已複製" : label ? "複製題目" : "複製"}
    </Button>
  );
}
