// 前端 sessionId 管理
// 預設隨機生成 UUID;使用者可在設定頁自訂 Email 或簡短帳號 ID,
// 自訂後跨瀏覽器輸入同樣 ID 即可撈到同一份資料。
"use client";

import { CUSTOM_PREFIX, normalizeSessionId } from "@/lib/session-id";

const SESSION_KEY = "iiqe:sessionId";

// 自訂 ID 命名空間前綴,用於與隨機 UUID 區分(僅供顯示判斷用)
export { CUSTOM_PREFIX };

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

// 驗證自訂 ID 格式,回傳標準化後的完整 ID,不寫入 localStorage。
// 複用 lib/session-id 的統一規格,避免前後端兩套驗證邏輯漂移。
export function validateCustomId(customId: string): string {
  const norm = normalizeSessionId(customId);
  if (!norm) {
    throw new Error("自訂 ID 須為有效 Email 或 3-32 位英數帳號(可含 _ 或 -)");
  }
  return norm;
}

// 設定自訂 ID:輸入純暱稱,內部自動加前綴避免與隨機 UUID 衝突
// 若使用者貼入已含前綴的完整 ID(例如從「當前識別碼」複製),自動剝離前綴
export function setCustomSessionId(customId: string): string {
  if (typeof window === "undefined") return "";
  const newId = validateCustomId(customId);
  localStorage.setItem(SESSION_KEY, newId);
  emitSessionChange(newId);
  return newId;
}

// 重置為隨機 UUID(放棄自訂 ID)
export function resetSessionId(): string {
  if (typeof window === "undefined") return "";
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, id);
  emitSessionChange(id);
  return id;
}

// sessionId 變更事件,讓 SetupReminder 等持久掛載的元件即時反應
export const SESSION_CHANGE_EVENT = "iiqe:sessionchange";

function emitSessionChange(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SESSION_CHANGE_EVENT, { detail: { id } })
  );
}
