"use client";
// 客戶端會話引導：確保首屏前已取得簽名 Cookie。
// - ensureSession(): 惰性、冪等——已存在合法 Cookie 時不會覆寫（保護 admin 會話,避免 R2 競態）
// - reestablishSession(): 使用者切換識別碼後「強制」重建（會覆寫舊 Cookie）
// 所有需要身份的數據請求都應先 await ensureSession()（或改用 authedFetch）。
import { getSessionId } from "@/lib/session";

let ensured: Promise<void> | null = null;

// 儲存最近一次 session 建立失敗的原因,供 UI 層讀取以顯示具體錯誤
let _lastSessionError: string | null = null;
export function getLastSessionError(): string | null {
  return _lastSessionError;
}

async function establish(force: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  const run = (async () => {
    // 用 localStorage 既有 id（或生成並持久化）,確保舊資料可延續。
    // force=true 時不帶 ensureOnly,服務端會以此 id 重建會話（切換識別碼用）。
    const id = getSessionId();
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ensureOnly: !force }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.clone().json();
          if (body && typeof body.error === "string") {
            detail = body.error;
          } else if (body && typeof body.code === "string") {
            detail = body.code;
          }
        } catch {
          // body 無法解析,使用 HTTP 狀態碼
        }
        _lastSessionError = detail;
        console.error(
          `[session-client] 會話建立失敗: ${detail}。` +
          "後續需要身份驗證的請求（如建立作答、收藏、筆記）將返回 401。"
        );
      } else {
        _lastSessionError = null;
      }
    } catch {
      // 網路錯誤,後續請求會自然重試
      _lastSessionError = "網路連線失敗";
    }
  })();
  ensured = run;
  return run;
}

export function ensureSession(): Promise<void> {
  if (!ensured) return establish(false);
  return ensured;
}

// 設定頁切換/重置 ID 後,強制重建會話 Cookie（會覆寫舊的）。
export async function reestablishSession(): Promise<void> {
  await establish(true);
}

// 帶 Cookie 的 fetch：先確保會話,再發請求。
export async function authedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  await ensureSession();
  return fetch(url, {
    ...init,
    credentials: "include",
  });
}
