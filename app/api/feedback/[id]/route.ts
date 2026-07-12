import { NextRequest, NextResponse } from "next/server";
import { deleteFeedback, getFeedback } from "@/lib/kv";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/feedback/[id]">
) {
  const { id } = await ctx.params;

  // 僅管理員可刪除反饋（身份來自簽名 Cookie，不可偽造）
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const existing = await getFeedback(id);
  if (!existing) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  await deleteFeedback(id);

  return NextResponse.json({ ok: true, deletedId: id });
}
