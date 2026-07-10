// 管理員身份查詢:純服務端,告訴當前會話是否為管理員。
// 身份來自簽名 Cookie(由 /api/session 或 /api/admin/login 簽發),
// 客戶端無法偽造 admin 聲明。
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  return NextResponse.json({
    isAdmin: !!session?.isAdmin,
    sessionId: session?.sessionId ?? null,
  });
}
