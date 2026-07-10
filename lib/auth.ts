// 服务端会话：HMAC 签名 HttpOnly Cookie。
// 关键不变量：admin:true 只能由「管理員登錄端點」(app/api/admin/login) 设置，
// 普通 app/api/session 永遠簽發 admin:false。否則攻擊者傳 sid=ADMIN_ID 即可拿到
// 合法簽名的 admin Cookie，C2 等於沒修。
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSessionId } from "@/lib/session-id";

export const SESSION_COOKIE = "iiqe_session";
// 30 天
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const RAW_SECRET = process.env.AUTH_SECRET ?? "";
// 部署期必修守衛:AUTH_SECRET 缺失時所有簽名 Cookie 都會被驗證失敗,
// 導致 /api/attempts 等守衛端點一律回 401,客戶端只會看到泛化的
// 「建立作答 session 失敗」。在這裡於啟動期一次性報錯,讓問題在日誌
// 與 health check 中立刻可見,而不是在每個請求中靜默拒絕。
// 本地開發若想暫時繞過,可顯式設 AUTH_SECRET_ALLOW_EMPTY=1。
function resolveSecret(): string {
  if (RAW_SECRET.length > 0) return RAW_SECRET;
  const allowEmpty = process.env.AUTH_SECRET_ALLOW_EMPTY === "1";
  const msg =
    "[auth] AUTH_SECRET 未設定:所有簽名 Cookie 將驗證失敗," +
    " /api/attempts 等守衛端點會一律 401。" +
    " 請於 .env / .env.production 設定高熵隨機值" +
    " (node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\")。";
  if (allowEmpty) {
    // 只警告,不拋錯(本地除錯用;生產路徑不應走這條)
    if (typeof console !== "undefined") console.warn(msg);
    return "";
  }
  // 啟動期一次性 console.error,讓 docker logs / pm2 logs 立刻看到根因。
  // 不主動 throw:避免把整個 Next 啟動擋掉,允許 /api/health 之類的
  // 未守衛端點仍可服務(供監控抓取)。
  if (typeof console !== "undefined") console.error(msg);
  return "";
}
const SECRET = resolveSecret();

type SessionPayload = {
  sid: string;
  admin: boolean;
  iat: number;
  exp: number;
};

export type Session = { sessionId: string; isAdmin: boolean };

// 供 health check / smoke test 判斷當前進程的會話簽章是否可信。
// true 表示 SECRET 已設定、Cookie 簽章可被驗證。
export function isAuthConfigured(): boolean {
  return SECRET.length > 0;
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

function encodePayload(p: SessionPayload): string {
  return Buffer.from(JSON.stringify(p)).toString("base64url");
}

function decodePayload<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function signSession(p: SessionPayload): string {
  const body = encodePayload(p);
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token || !SECRET) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const p = decodePayload<SessionPayload>(body);
  if (!p || typeof p.sid !== "string") return null;
  if (typeof p.exp === "number" && Date.now() / 1000 > p.exp) return null;
  return p;
}

// Route Handler 内使用：从 req.cookies 讀取並校驗
export function getSessionFromRequest(req: NextRequest): Session | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const p = verifySession(token);
  return p ? { sessionId: p.sid, isAdmin: p.admin } : null;
}

// Server Component / 頁面内使用（cookies() 為 async）
export async function getServerSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const p = verifySession(token);
  return p ? { sessionId: p.sid, isAdmin: p.admin } : null;
}

export function makePayload(sid: string, admin: boolean): SessionPayload {
  const now = Math.floor(Date.now() / 1000);
  return { sid, admin, iat: now, exp: now + SESSION_MAX_AGE };
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

// 將会话寫入響應（設置 Cookie）
export function setSessionCookie(res: NextResponse, p: SessionPayload): void {
  res.cookies.set(SESSION_COOKIE, signSession(p), cookieOpts());
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOpts(), maxAge: 0 });
}

// 普通會話：admin 永遠 false
export function establishUserSession(
  res: NextResponse,
  rawId: string | null | undefined,
): string {
  const sid = normalizeSessionId(rawId) ?? crypto.randomUUID();
  setSessionCookie(res, makePayload(sid, false));
  return sid;
}

// 管理員登錄：僅當 token 正確時簽發 admin:true
export function establishAdminSession(res: NextResponse): string {
  const adminId = process.env.ADMIN_ID || "admin";
  setSessionCookie(res, makePayload(adminId, true));
  return adminId;
}

// 鑒權助手：返回 Session 或 401/403 的 NextResponse
export function requireSession(req: NextRequest): Session | NextResponse {
  const s = getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "未授權" }, { status: 401 });
  return s;
}

export function requireAdmin(req: NextRequest): Session | NextResponse {
  const s = getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "未授權" }, { status: 401 });
  if (!s.isAdmin)
    return NextResponse.json({ error: "僅管理員可訪問" }, { status: 403 });
  return s;
}
