// 管理員登錄端點（獨立凭据，與 ADMIN_ID 分離）。
// 只有當 body.token === process.env.ADMIN_TOKEN 時，才簽發 admin:true 的會話 Cookie。
// 這確保「知道 ADMIN_ID 字串」不再等於管理員；管理員身份必須憑 ADMIN_TOKEN 登錄獲得。
import { NextRequest, NextResponse } from "next/server";
import { makePayload, setSessionCookie } from "@/lib/auth";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

export async function POST(req: NextRequest) {
  if (!ADMIN_TOKEN) {
    return NextResponse.json(
      { error: "管理員登錄未配置" },
      { status: 503 },
    );
  }
  let body: { token?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效請求" }, { status: 400 });
  }
  const token = typeof body?.token === "string" ? body.token : "";
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "令牌無效" }, { status: 401 });
  }
  const adminId = process.env.ADMIN_ID || "admin";
  const res = NextResponse.json({ ok: true, isAdmin: true });
  setSessionCookie(res, makePayload(adminId, true));
  return res;
}
