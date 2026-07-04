"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Search,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuestionText } from "@/components/CopyQuestionButton";
import { buildSearchQuery } from "@/components/QuestionSearchButtons";

type QuestionActionsProps = {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
  className?: string;
  size?: "xs" | "sm" | "default";
};

export function QuestionActions({
  number,
  question,
  options,
  ref,
  className,
  size = "xs",
}: QuestionActionsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = buildSearchQuery({ question, options });
  const encoded = encodeURIComponent(query);
  const googleUrl = `https://www.google.com/search?q=${encoded}`;
  const baiduUrl = `https://www.baidu.com/s?wd=${encoded}`;
  const chatgptUrl = `https://chatgpt.com/?q=${encoded}&hints=search&ref=ext`;

  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  const itemIconSize = size === "xs" ? "w-3.5 h-3.5" : "w-4 h-4";

  // 點擊外部關閉
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleCopy() {
    const text = formatQuestionText({ number, question, options, ref });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
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
    setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 1200);
  }

  return (
    <div ref={wrapRef} className={cn("relative inline-block", className)}>
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={() => setOpen((v) => !v)}
        title="更多操作"
        aria-expanded={open}
      >
        <MoreHorizontal className={cn(iconSize, "mr-0.5")} />
        {copied ? "已複製" : ""}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-zinc-200 bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 text-zinc-700"
          >
            {copied ? (
              <Check className={cn(itemIconSize, "text-green-600")} />
            ) : (
              <Copy className={itemIconSize} />
            )}
            複製題目
          </button>
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
          >
            <Search className={itemIconSize} />
            Google 搜尋
          </a>
          <a
            href={baiduUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            <Search className={itemIconSize} />
            百度搜尋
          </a>
          <a
            href={chatgptUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50"
          >
            <MessageCircle className={itemIconSize} />
            ChatGPT
          </a>
        </div>
      )}
    </div>
  );
}
