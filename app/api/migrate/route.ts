import { NextRequest, NextResponse } from "next/server";
import { migrateSession } from "@/lib/kv";
import { requireSession } from "@/lib/auth";

// 帳號合併：僅允許把數據遷移「進入當前已認證會話」(to === 當前 session)，
// 或從當前會話遷出(from === 當前 session)。禁止跨用戶遷移，杜絕 C1 帳號劫持。
export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const currentSid = session.sessionId;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const fromSessionId = typeof body.fromSessionId === "string" ? body.fromSessionId : "";
  const toSessionId = typeof body.toSessionId === "string" ? body.toSessionId : "";

  if (!fromSessionId || !toSessionId) {
    return NextResponse.json(
      { error: "fromSessionId, toSessionId 必填" },
      { status: 400 }
    );
  }
  if (fromSessionId === toSessionId) {
    return NextResponse.json({
      ok: true,
      migrated: { attempts: 0, favorites: 0, notes: 0 },
      message: "來源與目標相同,無需遷移",
    });
  }
  if (toSessionId !== currentSid && fromSessionId !== currentSid) {
    return NextResponse.json(
      { error: "僅允許合併與當前帳號相關的數據" },
      { status: 403 }
    );
  }

  const result = await migrateSession(fromSessionId, toSessionId);
  return NextResponse.json({ ok: true, migrated: result });
}
