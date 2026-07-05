"use client";

import { Button } from "@/components/ui/button";
import { Search, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type QuestionSearchButtonsProps = {
  question: string;
  options: Record<string, string>;
  className?: string;
  size?: "xs" | "sm" | "default";
};

/**
 * 將題幹與選項組合成搜尋關鍵字。
 * 開頭加上固定前綴「（香港保險中介人資格考試相關題目,請答題並作通俗解釋)」,
 * 若有章節號(ref)則緊接前綴以 [x.x.x] 形式帶上,
 * 題幹為主,選項帶序號(如 "A. xxx")以空白串接,
 * 讓搜尋引擎能比對到完整題目與選項結構。
 */
export function buildSearchQuery(opts: {
  question: string;
  options: Record<string, string>;
  ref?: string;
}): string {
  const { question, options, ref } = opts;
  const parts: string[] = ["（香港保險中介人資格考試相關題目,請答題並作通俗解釋）"];
  if (ref) parts.push(`[${ref}]`);
  parts.push(question.trim());
  for (const letter of ["a", "b", "c", "d"] as const) {
    const text = options[letter];
    if (text) parts.push(`${letter.toUpperCase()}. ${text.trim()}`);
  }
  return parts.filter(Boolean).join(" ");
}

export function QuestionSearchButtons({
  question,
  options,
  className,
  size = "xs",
}: QuestionSearchButtonsProps) {
  const query = buildSearchQuery({ question, options });
  const encoded = encodeURIComponent(query);
  const googleUrl = `https://www.google.com/search?q=${encoded}`;
  const baiduUrl = `https://www.baidu.com/s?wd=${encoded}`;
  const chatgptUrl = `https://chatgpt.com/?q=${encoded}&hints=search&ref=ext`;
  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        asChild
        variant="ghost"
        size={size}
        title="用 Google 搜尋這題"
        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
      >
        <a href={googleUrl} target="_blank" rel="noopener noreferrer">
          <Search className={cn(iconSize, "mr-1")} />
          Google
        </a>
      </Button>
      <Button
        asChild
        variant="ghost"
        size={size}
        title="用百度搜尋這題"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <a href={baiduUrl} target="_blank" rel="noopener noreferrer">
          <Search className={cn(iconSize, "mr-1")} />
          百度
        </a>
      </Button>
      <Button
        asChild
        variant="ghost"
        size={size}
        title="用 ChatGPT 查這題"
        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
      >
        <a href={chatgptUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle className={cn(iconSize, "mr-1")} />
          ChatGPT
        </a>
      </Button>
    </div>
  );
}
