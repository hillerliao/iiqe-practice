"use client";

import {
  BookOpen,
  MessageCircle,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  buildQuestionTextLines,
  type QuestionTextOptions,
} from "@/components/CopyQuestionButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  QUESTION_SEARCH_PROVIDERS,
  type QuestionSearchIconKind,
} from "@/lib/question-search";

const SEARCH_PROVIDER_ICONS: Record<QuestionSearchIconKind, LucideIcon> = {
  search: Search,
  chat: MessageCircle,
  sparkles: Sparkles,
  "book-open": BookOpen,
};

type QuestionSearchMenuProps = QuestionTextOptions & {
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  size?: "xs" | "sm" | "default";
  labelMode?: "always" | "desktop" | "hidden";
  showShortcutHints?: boolean;
  className?: string;
};

/**
 * 搜尋內容與複製題目相同,僅將換行改成空白以適應搜尋框。
 */
export function buildSearchQuery(opts: QuestionTextOptions): string {
  return buildQuestionTextLines(opts).join(" ");
}

export function QuestionSearchMenu({
  side = "bottom",
  align = "end",
  size = "xs",
  labelMode = "always",
  showShortcutHints = false,
  className,
  ...question
}: QuestionSearchMenuProps) {
  const query = buildSearchQuery(question);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        title="搜尋這題"
        className={cn(buttonVariants({ variant: "ghost", size }), className)}
      >
        <Search />
        <span
          className={cn(
            labelMode === "desktop" && "hidden md:inline",
            labelMode === "hidden" && "sr-only"
          )}
        >
          搜尋
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        className="w-auto min-w-[150px]"
      >
        {QUESTION_SEARCH_PROVIDERS.map((provider) => {
          const ProviderIcon = SEARCH_PROVIDER_ICONS[provider.iconKind];

          return (
            <DropdownMenuItem
              key={provider.id}
              onClick={() => {
                window.open(
                  provider.buildUrl(query),
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              title={
                showShortcutHints
                  ? `用 ${provider.label} 搜尋這題 (${provider.shortcutLabel})`
                  : `用 ${provider.label} 搜尋這題`
              }
              className={cn("gap-2", provider.className)}
            >
              <ProviderIcon />
              <span>{provider.label}</span>
              {showShortcutHints && (
                <DropdownMenuShortcut>
                  {provider.shortcutLabel}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
