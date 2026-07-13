"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Copy,
  Check,
  Search,
  MessageCircle,
  MoreHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuestionText } from "@/components/CopyQuestionButton";
import { buildSearchQuery } from "@/components/QuestionSearchButtons";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  QUESTION_SEARCH_PROVIDER_BY_ID,
  QUESTION_SEARCH_PROVIDERS,
  type QuestionSearchIconKind,
} from "@/lib/question-search";

const SEARCH_PROVIDER_ICONS: Record<QuestionSearchIconKind, LucideIcon> = {
  search: Search,
  chat: MessageCircle,
  sparkles: Sparkles,
  "book-open": BookOpen,
};

type QuestionActionsProps = {
  number?: number;
  question: string;
  options: Record<string, string>;
  ref?: string;
  paper?: string;
  className?: string;
  size?: "xs" | "sm" | "default";
};

export function QuestionActions({
  number,
  question,
  options,
  ref,
  paper,
  className,
  size = "xs",
}: QuestionActionsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = buildSearchQuery({ number, question, options, ref, paper });
  const googleProvider = QUESTION_SEARCH_PROVIDER_BY_ID.google;
  const otherProviders = QUESTION_SEARCH_PROVIDERS.filter(
    (provider) => provider.id !== "google"
  );

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
    setCopyFailed(false);
    const text = formatQuestionText({ number, question, options, ref, paper });
    const succeeded = await writeTextToClipboard(text);
    if (!succeeded) {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 1600);
      return;
    }

    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 1200);
  }

  return (
    <div ref={wrapRef} className={cn("relative inline-flex items-center gap-0.5", className)}>
      <Button
        asChild
        variant="ghost"
        size={size}
        title={`用 ${googleProvider.label} 搜尋這題`}
        className={googleProvider.className}
      >
        <a
          href={googleProvider.buildUrl(query)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Search className={cn(iconSize, "mr-1")} />
          {googleProvider.label}
        </a>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={() => setOpen((v) => !v)}
        title="更多操作"
        aria-expanded={open}
        className="px-1.5"
      >
        <MoreHorizontal className={iconSize} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-border bg-popover shadow-lg py-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-muted text-foreground"
          >
            {copied ? (
              <Check className={cn(itemIconSize, "text-green-600 dark:text-green-400")} />
            ) : (
              <Copy className={cn(itemIconSize, copyFailed && "text-red-600 dark:text-red-400")} />
            )}
            {copied ? "已複製" : copyFailed ? "複製失敗" : "複製題目"}
          </button>
          {otherProviders.map((provider) => {
            const ProviderIcon = SEARCH_PROVIDER_ICONS[provider.iconKind];

            return (
              <a
                key={provider.id}
                href={provider.buildUrl(query)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm",
                  provider.className
                )}
              >
                <ProviderIcon className={itemIconSize} />
                {provider.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
