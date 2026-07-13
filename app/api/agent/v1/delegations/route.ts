import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { AGENT_SCOPES, issueDelegationToken, type AgentScope } from "@/lib/delegation-token";

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const requested = Array.isArray(body.scopes) ? body.scopes : ["practice:read", "practice:write", "learning:read"];
  if (requested.some((scope: unknown) => typeof scope !== "string" || !AGENT_SCOPES.includes(scope as AgentScope))) {
    return NextResponse.json({ error: "scope 無效" }, { status: 400 });
  }
  const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 900;
  return NextResponse.json({ token: issueDelegationToken(session.sessionId, requested as AgentScope[], expiresIn), expiresIn: Math.min(Math.max(expiresIn, 60), 3600), scopes: requested });
}
