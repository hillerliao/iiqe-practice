// 管理員 API 客戶端 helper:
// - 自動從 localStorage 讀 sessionId 並追加為 query param
// - 統一錯誤處理(解析後端返回的 { error } 結構)
// - 返回解析後的 JSON

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AdminApiError";
  }
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("iiqe:sessionId") ?? "";
}

export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const sid = getSessionId();
  const sep = path.includes("?") ? "&" : "?";
  const url = sid
    ? `${path}${sep}sessionId=${encodeURIComponent(sid)}`
    : path;

  const res = await fetch(url, {
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