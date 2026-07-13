import type { ReactNode } from "react";
import {
  QUESTION_SEARCH_PROVIDERS,
  type QuestionSearchProvider,
} from "@/lib/question-search";
import { cn } from "@/lib/utils";

export type ShortcutHint = Readonly<{
  key: ReactNode;
  label: ReactNode;
  id?: string;
}>;

export type ShortcutHintsProps = Readonly<{
  hints?: readonly ShortcutHint[];
  includeSearchProviders?: boolean;
  searchProviders?: readonly QuestionSearchProvider[];
  className?: string;
  kbdClassName?: string;
}>;

export const SHORTCUT_KBD_CLASS_NAME =
  "inline-flex min-h-5 items-center justify-center rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px] leading-none text-foreground";

export function searchProviderShortcutHints(
  providers: readonly QuestionSearchProvider[] = QUESTION_SEARCH_PROVIDERS
): ShortcutHint[] {
  return providers.map((provider) => ({
    id: `search-${provider.id}`,
    key: provider.shortcutLabel,
    label: provider.label,
  }));
}

export function ShortcutHints({
  hints = [],
  includeSearchProviders = false,
  searchProviders = QUESTION_SEARCH_PROVIDERS,
  className,
  kbdClassName,
}: ShortcutHintsProps) {
  const renderedHints = includeSearchProviders
    ? [...hints, ...searchProviderShortcutHints(searchProviders)]
    : hints;

  if (renderedHints.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      {renderedHints.map((hint, index) => (
        <span key={hint.id ?? index} className="inline-flex items-center gap-1">
          <kbd className={cn(SHORTCUT_KBD_CLASS_NAME, kbdClassName)}>
            {hint.key}
          </kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </div>
  );
}
