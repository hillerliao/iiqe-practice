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

const SECRET = process.env.AUTH_SECRET ?? "";

type SessionPayload = {
  sid: string;
  admin: boolean;
  iat: number;
  exp: number;
};

export type Session = { sessionId: string; isAdmin: boolean };

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
