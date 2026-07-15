"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublicHandbookUrlForQuestion } from "@/lib/handbook-refs";
import { splitQuestionStatements } from "@/lib/questionText";

type CopyQuestionButtonProps = {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
  paper?: string;
  className?: string;
  variant?: "ghost" | "outline";
  size?: "xs" | "sm" | "default";
  label?: boolean;
};

export type QuestionTextOptions = {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
  paper?: string;
};

/**
 * 將 paperCode (例如 "P1" / "P3") 映射成中文卷別頭 ("卷一" / "卷三")。
 * 若傳入已經是 "卷X" 開頭則原樣回傳;空字串 / undefined 回傳空字串。
 */
export function formatPaperLabel(paper: string | undefined | null): string {
  if (!paper) return "";
  const trimmed = paper.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("卷")) return trimmed;
  const map: Record<string, string> = {
    P1: "卷一",
    P3: "卷三",
  };
  return map[trimmed.toUpperCase()] ?? trimmed;
}

/**
 * 將題幹與選項格式化為純文字,方便貼到其他地方使用。
 * 格式:
 *   （香港保險中介人資格考試相關題目,請答題並作通俗、視覺化解釋，並介紹相關規則的底層邏輯。答題時禁止胡編亂造，要依據研習手冊 https://iiqe.liaozh.top/studynotes/exam3-2022#ch-1-2-2 對應章節的內容。）
 *   #1 [卷三 1.2.2(e)]
 *   題幹
 *   A. 選項A
 *   B. 選項B
 *   ...
 *
 * paper: 傳入 paperCode (如 "P1" / "P3") 或已映射的中文卷別 (如 "卷三")。
 *        與 ref 同時存在時會拼成 [卷三 1.2.2(e)];若只傳 ref 則維持舊格式 [REF]。
 */
export function buildQuestionTextLines(opts: QuestionTextOptions): string[] {
  const { number, question, options, ref, paper } = opts;
  const handbookUrl = getPublicHandbookUrlForQuestion(paper, ref);
  const tail = handbookUrl
    ? `答題時禁止胡編亂造，要依據研習手冊 ${handbookUrl} 對應章節的內容。`
    : "";
  const lines: string[] = [
    `（香港保險中介人資格考試相關題目,請答題並作通俗、視覺化解釋，並介紹相關規則的底層邏輯。${tail}）`,
  ];
  const paperLabel = formatPaperLabel(paper);
  const refTag = ref ? `[${ref}]` : "";
  const headerParts: string[] = [];
  if (number != null) headerParts.push(`#${number}`);
  if (paperLabel && refTag) {
    headerParts.push(`[${paperLabel} ${ref}]`);
  } else if (paperLabel) {
    headerParts.push(`[${paperLabel}]`);
  } else if (refTag) {
    headerParts.push(refTag);
  }
  if (headerParts.length) lines.push(headerParts.join(" "));
  const { lead, items } = splitQuestionStatements(question.trim());
  if (items.length > 0) {
    if (lead) lines.push(lead);
    lines.push(...items);
  } else {
    lines.push(question.trim());
  }
  for (const letter of ["a", "b", "c", "d"] as const) {
    const text = options[letter];
    if (text) {
      lines.push(`${letter.toUpperCase()}. ${text}`);
    }
  }
  return lines;
}

export function formatQuestionText(opts: QuestionTextOptions): string {
  return buildQuestionTextLines(opts).join("\n");
}

export function CopyQuestionButton({
  number,
  question,
  options,
  ref,
  paper,
  className,
  variant = "ghost",
  size = "xs",
  label = false,
}: CopyQuestionButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = formatQuestionText({ number, question, options, ref, paper });
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
