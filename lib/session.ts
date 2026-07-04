// 前端 sessionId 管理
// 預設隨機生成 UUID;使用者可在設定頁自訂 ID,
// 自訂後跨瀏覽器輸入同樣 ID 即可撈到同一份資料。
"use client";

const SESSION_KEY = "iiqe:sessionId";

// 自訂 ID 命名空間前綴,用於與隨機 UUID 區分(僅供顯示判斷用)
export const CUSTOM_PREFIX = "user:";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// 是否為使用者自訂的 ID(非隨機 UUID)
export function isCustomSessionId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

// 取得自訂 ID 的可讀部分(去掉前綴)
export function getCustomIdDisplay(id: string): string {
  return id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : "";
}

// 設定自訂 ID:輸入純暱稱,內部自動加前綴避免與隨機 UUID 衝突
// 若使用者貼入已含前綴的完整 ID(例如從「當前識別碼」複製),自動剝離前綴
export function setCustomSessionId(customId: string): string {
  if (typeof window === "undefined") return "";
  let trimmed = customId.trim();
  if (!trimmed) throw new Error("自訂 ID 不可為空");
  // 自動剝離前綴,允許使用者直接貼入完整 ID
  if (trimmed.startsWith(CUSTOM_PREFIX)) {
    trimmed = trimmed.slice(CUSTOM_PREFIX.length);
  }
  if (!trimmed) throw new Error("自訂 ID 不可為空");
  // 僅允許英數字、底線、連字號,長度 3~32
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(trimmed)) {
    throw new Error("自訂 ID 僅限 3~32 字元的英文、數字、底線或連字號");
  }
  const newId = CUSTOM_PREFIX + trimmed;
  localStorage.setItem(SESSION_KEY, newId);
  return newId;
}

// 重置為隨機 UUID(放棄自訂 ID)
export function resetSessionId(): string {
  if (typeof window === "undefined") return "";
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}
