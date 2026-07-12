// 普通用戶會話端點。
// POST { id?, ensureOnly? }：
//   - ensureOnly=true 且已存在合法會話 Cookie → 直接沿用（冪等,絕不降級 admin）
//   - 否則簽發 admin:false 的會話 Cookie（sid 用客戶端傳入的 id,確保舊資料可延續）
// DELETE：清除會話 Cookie（登出/重置）。
//
// 重要：此端點永遠只簽發 admin:false。管理員身份請走 /api/admin/login。
import { NextRequest, NextResponse } from "next/server";
import {
  getSessionFromRequest,
  makePayload,
  setSessionCookie,
  clearSessionCookie,
  isAuthConfigured,
} from "@/lib/auth";
import { normalizeSessionId } from "@/lib/session-id";

export async function POST(req: NextRequest) {
  // 啟動守衛：AUTH_SECRET 缺失時簽發的 Cookie 永遠驗證失敗,
  // 會導致下游守衛端點（/api/attempts 等）一律 401,客戶端只會看到
  // 泛化的「建立作答 session 失敗」。這裡提前回 503 + 明確錯誤,
  // 讓前端能區分「後端配置問題」與「業務錯誤」。
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error: "AUTH_SECRET 未設定,伺服器無法簽發會話 Cookie",
        code: "AUTH_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  // 冪等引導：已存在合法會話（含 admin）時直接沿用,
  // 避免 authedFetch 惰性 bootstrap 把 admin Cookie 覆寫成非 admin（R2 競態）。
  const existing = getSessionFromRequest(req);

  let body: { id?: unknown; ensureOnly?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // 無 body 也可（服務端會生成新 UUID）
  }

  if (body?.ensureOnly && existing) {
    return NextResponse.json({
      ok: true,
      sessionId: existing.sessionId,
      continued: true,
    });
  }

  const rawId = typeof body?.id === "string" ? body.id : null;
  const sid = normalizeSessionId(rawId) ?? crypto.randomUUID();
  const res = NextResponse.json({ ok: true, sessionId: sid });
  setSessionCookie(res, makePayload(sid, false));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
