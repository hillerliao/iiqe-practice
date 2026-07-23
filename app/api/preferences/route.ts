import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPreferences, savePreferences } from "@/lib/kv";
import {
  DEFAULT_AUTO_ADVANCE_DELAY_MS,
  isAutoAdvanceDelay,
  parseAutoAdvanceDelay,
} from "@/lib/auto-advance";

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;

  const preferences = await getPreferences(session.sessionId);
  return NextResponse.json({
    sessionId: session.sessionId,
    exists: preferences !== null,
    autoAdvanceDelayMs: preferences
      ? preferences.autoAdvanceDelayMs
      : DEFAULT_AUTO_ADVANCE_DELAY_MS,
  });
}

export async function PATCH(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!("autoAdvanceDelayMs" in body) || !isAutoAdvanceDelay(body.autoAdvanceDelayMs)) {
    return NextResponse.json(
      { error: "autoAdvanceDelayMs 只允許 1000、10000 或 null" },
      { status: 400 },
    );
  }

  await savePreferences(session.sessionId, {
    autoAdvanceDelayMs: body.autoAdvanceDelayMs,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    sessionId: session.sessionId,
    autoAdvanceDelayMs: body.autoAdvanceDelayMs,
  });
}
