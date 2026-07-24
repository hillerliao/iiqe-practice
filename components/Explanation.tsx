"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type ExplanationProps = {
  /** explanation 正文(Markdown 格式) */
  text: string;
  /** 前綴圖示,如 "💡";不傳則無前綴 */
  prefix?: string;
  className?: string;
};

/**
 * 題目解析渲染組件 — 將 Markdown 格式的 explanation 渲染為帶樣式的 HTML。
 * h3 渲染為小號加粗標題(而非默認大標題),整體字號與周圍文字一致。
 */
export function Explanation({ text, prefix, className }: ExplanationProps) {
  if (!text || text.trim().length === 0) return null;

  return (
    <div className={cn("leading-relaxed", className)}>
      {prefix && <span className="mr-1">{prefix}</span>}
      <ReactMarkdown
        components={{
          h3: ({ children }) => (
            <p className="font-semibold text-foreground mt-2 mb-0.5 first:mt-0">
              {children}
            </p>
          ),
          p: ({ children }) => (
            <p className="text-foreground my-1">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>
          ),
          hr: () => <hr className="my-2 border-border" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
