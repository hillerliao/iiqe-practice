// 錯題本「反覆錯」篩選門檻工具。
// 門檻只影響前端檢視與重點重做的題集,不寫入後端資料。
export const DEFAULT_REPEATED_THRESHOLD = 2;
export const MIN_REPEATED_THRESHOLD = 1;
export const MAX_REPEATED_THRESHOLD = 99;

export function getWrongbookThresholdKey(sessionId: string): string {
  return `iiqe:wrongbook:threshold:v1:${encodeURIComponent(sessionId)}`;
}

export function normalizeRepeatedThreshold(raw: string | null): number {
  if (!raw) return DEFAULT_REPEATED_THRESHOLD;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_REPEATED_THRESHOLD;
  return Math.min(MAX_REPEATED_THRESHOLD, Math.max(MIN_REPEATED_THRESHOLD, parsed));
}
