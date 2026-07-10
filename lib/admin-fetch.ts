// 管理員 API 客戶端 helper:
// - 統一走 authedFetch（會先 ensureSession 並帶上簽名 Cookie,絕不再上送可偽造的 sessionId）
// - 統一錯誤處理(解析後端返回的 { error } 結構)
// - 返回解析後的 JSON
import { authedFetch } from "@/lib/session-client";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AdminApiError";
  }
}

export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await authedFetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 響應
  }

  if (!res.ok) {
    const msg =
      (data && typeof data.error === "string" ? data.error : null) ??
      `HTTP ${res.status}`;
    throw new AdminApiError(msg, res.status);
  }
  return (data ?? {}) as T;
}
