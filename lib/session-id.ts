// 共用 sessionId 規格（前後端共用）。
// 純函數、不依賴 window，可在 server / client 兩端 import。
//
// 規則（與舊 lib/session.ts 的 validateCustomId 相容）：
// - 隨機 UUID（無前綴）→ 原樣接受（匿名帳號）
// - Email 或 3-32 位英數帳號（可含 _ -）→ 加 `user:` 前綴
// - 其餘 → 視為不合法，回傳 null

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CUSTOM_PREFIX = "user:";

export function normalizeSessionId(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (s.length === 0 || s.length > 128) return null;
  if (s.startsWith(CUSTOM_PREFIX)) s = s.slice(CUSTOM_PREFIX.length).trim();
  if (s.length === 0) return null;
  if (UUID_RE.test(s)) return s; // 匿名 UUID，不加前綴
  if (EMAIL_RE.test(s) || USERNAME_RE.test(s)) return `${CUSTOM_PREFIX}${s}`;
  return null;
}
