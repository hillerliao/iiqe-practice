// 前端 sessionId 管理
// 預設隨機生成 UUID;使用者可在設定頁自訂 Email 格式 ID,
// 自訂後跨瀏覽器輸入同樣 ID 即可撈到同一份資料。
// 為向後相容,保留少數舊的非 Email 格式 ID(例如管理員用的 iiqe2026)。
"use client";

const SESSION_KEY = "iiqe:sessionId";

// 自訂 ID 命名空間前綴,用於與隨機 UUID 區分(僅供顯示判斷用)
export const CUSTOM_PREFIX = "user:";

// 驗證白名單:這些舊的非 Email 格式 ID 仍可設定,
// 主要為保留管理員 sessionId 避免破壞既有流程。
export const ADMIN_BYPASS_IDS = ["iiqe2026"] as const;

// 簡單 Email 格式驗證;不求嚴格 RFC 5322,擋明顯錯誤即可
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

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

// 驗證自訂 ID 格式,回傳完整 ID (含前綴),不寫入 localStorage
export function validateCustomId(customId: string): string {
  let trimmed = (customId ?? "").trim();
  if (!trimmed) throw new Error("自訂 ID 不可為空");
  if (trimmed.startsWith(CUSTOM_PREFIX)) {
    trimmed = trimmed.slice(CUSTOM_PREFIX.length);
  }
  if (!trimmed) throw new Error("自訂 ID 不可為空");
  // 向後相容:驗證白名單內的舊 ID 放行
  if ((ADMIN_BYPASS_IDS as readonly string[]).includes(trimmed)) {
    return CUSTOM_PREFIX + trimmed;
  }
  if (!EMAIL_RE.test(trimmed)) {
    throw new Error("自訂 ID 須為有效的 Email 格式(例如 you@example.com)");
  }
  return CUSTOM_PREFIX + trimmed;
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
