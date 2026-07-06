import { NextRequest, NextResponse } from "next/server";
import { deleteFeedback, getFeedback } from "@/lib/kv";
import { isAdmin } from "@/lib/admin";

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/feedback/[id]">
) {
  const { id } = await ctx.params;

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

  // 雙重校驗:僅管理員可刪除他人的反饋
  if (!isAdmin(sessionId)) {
    return NextResponse.json({ error: "僅管理員可刪除反饋" }, { status: 403 });
  }

  const existing = await getFeedback(id);
  if (!existing) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  await deleteFeedback(id);

  return NextResponse.json({ ok: true, deletedId: id });
}
