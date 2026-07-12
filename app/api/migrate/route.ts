import { NextRequest, NextResponse } from "next/server";
import { migrateSession } from "@/lib/kv";
import { requireSession } from "@/lib/auth";
import { normalizeSessionId } from "@/lib/session-id";

// 帳號合併：僅允許把「當前已認證會話（Cookie 中的 sid）」的資料
// 遷移至目標 ID。from 一律取自已 HMAC 驗證的 Cookie，絕不信任客戶端
// 傳入的 fromSessionId —— 這同時達成兩件事：
//   1) 從根上杜絕 C1「任意帳號資料劫持」（攻擊者無法偽造他人 from）；
//   2) 避免因 localStorage 的 sid 與 Cookie 的 sid 不一致（換瀏覽器、
//      admin 登入殘留等）而誤報「僅允許合併與當前帳號相關的數據」(403)，
//      讓「設定相同自訂 ID 即可跨瀏覽器同步資料」這條文件化 UX 真正可用。
export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const currentSid = session.sessionId;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const toSessionIdRaw = typeof body.toSessionId === "string" ? body.toSessionId : "";
  const toSessionId = normalizeSessionId(toSessionIdRaw);

  if (!toSessionId) {
    return NextResponse.json(
      { error: "toSessionId 必填，且須為合法 ID（Email 或 3-32 位英數帳號）" },
      { status: 400 }
    );
  }
  // 目標即當前會話：無需遷移（避免自我覆寫的無意義操作）
  if (toSessionId === currentSid) {
    return NextResponse.json({
      ok: true,
      migrated: { attempts: 0, favorites: 0, notes: 0 },
      message: "來源與目標相同，無需遷移",
    });
  }

  // from 強制取自已驗證 Cookie 的 sid（不信任客戶端 fromSessionId）
  const result = await migrateSession(currentSid, toSessionId);
  return NextResponse.json({ ok: true, migrated: result });
}
