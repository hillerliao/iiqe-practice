export const QUESTION_SEARCH_PROVIDER_IDS = [
  "google",
  "baidu",
  "chatgpt",
  "kimi",
  "xiaohongshu",
  "felo",
  "sogou",
  "bing",
  "zhihu",
] as const;

export type QuestionSearchProviderId =
  (typeof QUESTION_SEARCH_PROVIDER_IDS)[number];

export type QuestionSearchIconKind =
  | "search"
  | "chat"
  | "sparkles"
  | "book-open";

export type QuestionSearchProvider = Readonly<{
  id: QuestionSearchProviderId;
  label: string;
  /** KeyboardEvent.code used together with Shift. */
  shortcutKey: `Key${Uppercase<string>}`;
  shortcutLabel: string;
  className: string;
  iconKind: QuestionSearchIconKind;
  buildUrl: (query: string) => string;
}>;

function encoded(query: string): string {
  return encodeURIComponent(query);
}

export const QUESTION_SEARCH_PROVIDERS = [
  {
    id: "google",
    label: "Google",
    shortcutKey: "KeyG",
    shortcutLabel: "⇧G",
    className:
      "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30",
    iconKind: "search",
    buildUrl: (query: string) =>
      `https://www.google.com/search?q=${encoded(query)}`,
  },
  {
    id: "baidu",
    label: "百度",
    shortcutKey: "KeyB",
    shortcutLabel: "⇧B",
    className:
      "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30",
    iconKind: "search",
    buildUrl: (query: string) =>
      `https://chat.baidu.com/search?word=${encoded(query)}`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    shortcutKey: "KeyC",
    shortcutLabel: "⇧C",
    className:
      "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
    iconKind: "chat",
    buildUrl: (query: string) =>
      `https://chatgpt.com/?q=${encoded(query)}&hints=search&ref=ext`,
  },
  {
    id: "kimi",
    label: "Kimi",
    shortcutKey: "KeyK",
    shortcutLabel: "⇧K",
    className:
      "text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30",
    iconKind: "sparkles",
    buildUrl: (query: string) =>
      `https://www.kimi.com/?prefill_prompt=${encoded(query)}&send_immediately=true`,
  },
  {
    id: "xiaohongshu",
    label: "小紅書 AI",
    shortcutKey: "KeyX",
    shortcutLabel: "⇧X",
    className:
      "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30",
    iconKind: "book-open",
    buildUrl: (query: string) =>
      `https://www.xiaohongshu.com/ai_chat?keyword=${encoded(query)}`,
  },
  {
    id: "felo",
    label: "Felo",
    shortcutKey: "KeyF",
    shortcutLabel: "⇧F",
    className:
      "text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
    iconKind: "sparkles",
    buildUrl: (query: string) =>
      `https://felo.ai/search?q=${encoded(query)}`,
  },
  {
    id: "sogou",
    label: "搜狗",
    shortcutKey: "KeyS",
    shortcutLabel: "⇧S",
    className:
      "text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30",
    iconKind: "search",
    buildUrl: (query: string) =>
      `https://www.sogou.com/aimode/search?sourceid=5_00_19&query=${encoded(query)}`,
  },
  {
    id: "bing",
    label: "Bing",
    shortcutKey: "KeyI",
    shortcutLabel: "⇧I",
    className:
      "text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30",
    iconKind: "chat",
    buildUrl: (query: string) =>
      `https://www.bing.com/search?q=${encoded(query)}&iscopilotedu=1&form=MA13G7`,
  },
  {
    id: "zhihu",
    label: "知乎直答",
    shortcutKey: "KeyZ",
    shortcutLabel: "⇧Z",
    className:
      "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30",
    iconKind: "sparkles",
    buildUrl: (query: string) =>
      `https://zhida.zhihu.com/search?q=${encoded(query)}`,
  },
] as const satisfies readonly QuestionSearchProvider[];

export const QUESTION_SEARCH_PROVIDER_BY_ID = Object.fromEntries(
  QUESTION_SEARCH_PROVIDERS.map((provider) => [provider.id, provider])
) as Record<QuestionSearchProviderId, (typeof QUESTION_SEARCH_PROVIDERS)[number]>;

export type ShiftKeyboardLike = Readonly<{
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}>;

/** Returns a provider only for an exact Shift-only provider shortcut. */
export function matchQuestionSearchProvider(
  input: ShiftKeyboardLike
): (typeof QUESTION_SEARCH_PROVIDERS)[number] | undefined {
  if (
    !input.shiftKey ||
    input.ctrlKey ||
    input.metaKey ||
    input.altKey
  ) {
    return undefined;
  }

  return QUESTION_SEARCH_PROVIDERS.find(
    (provider) => provider.shortcutKey === input.code
  );
}

export function buildQuestionSearchUrl(
  providerId: QuestionSearchProviderId,
  query: string
): string {
  return QUESTION_SEARCH_PROVIDER_BY_ID[providerId].buildUrl(query);
}
