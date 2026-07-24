export const AUTO_ADVANCE_STORAGE_PREFIX = "iiqe:autoAdvance:";
export const DEFAULT_AUTO_ADVANCE_DELAY_MS = 20000;

export const AUTO_ADVANCE_OPTIONS = [
  { value: null, label: "不自動跳轉", description: "答對後停留在目前題目，手動前往下一題" },
  { value: 1000, label: "1 秒後跳轉", description: "適合快速刷題" },
  { value: 20000, label: "20 秒後跳轉", description: "預設值，保留較充足的解析閱讀時間" },
] as const;

export type AutoAdvanceDelay = 1000 | 20000 | null;

export function isAutoAdvanceDelay(value: unknown): value is AutoAdvanceDelay {
  return value === null || value === 1000 || value === 20000;
}

export function parseAutoAdvanceDelay(
  value: unknown,
  fallback: AutoAdvanceDelay = DEFAULT_AUTO_ADVANCE_DELAY_MS,
): AutoAdvanceDelay {
  if (value === 3000 || value === 5000 || value === 10000) return 20000;
  return isAutoAdvanceDelay(value) ? value : fallback;
}

export function autoAdvanceStorageKey(sessionId: string): string {
  return `${AUTO_ADVANCE_STORAGE_PREFIX}${sessionId}`;
}

export function autoAdvanceDelayToValue(delay: AutoAdvanceDelay): string {
  return delay == null ? "off" : String(delay);
}

export function autoAdvanceDelayFromValue(value: string): AutoAdvanceDelay | undefined {
  if (value === "off") return null;
  const parsed = Number(value);
  return isAutoAdvanceDelay(parsed) ? parsed : undefined;
}

export function formatAutoAdvanceDelay(delay: AutoAdvanceDelay): string {
  return delay == null ? "不自動跳轉" : `${delay / 1000} 秒後跳轉`;
}
