import { NextRequest, NextResponse } from "next/server";
import { migrateSession } from "@/lib/kv";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fromSessionId, toSessionId } = body;

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

  const result = await migrateSession(fromSessionId, toSessionId);
  return NextResponse.json({ ok: true, migrated: result });
}
