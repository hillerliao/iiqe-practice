import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const AGENT_SCOPES = ["practice:read", "practice:write", "learning:read"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

type Payload = {
  sid: string;
  scopes: AgentScope[];
  iat: number;
  exp: number;
  aud: "iiqe-agent";
  jti: string;
};

function secret(): string {
  const value = process.env.AUTH_SECRET ?? "";
  if (!value) throw new Error("AUTH_SECRET 未設定");
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(`agent-v1.${body}`).digest("base64url");
}

export function issueDelegationToken(sessionId: string, scopes: AgentScope[], ttlSeconds = 900): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Payload = {
    sid: sessionId,
    scopes: [...new Set(scopes)],
    iat: now,
    exp: now + Math.min(Math.max(ttlSeconds, 60), 3600),
    aud: "iiqe-agent",
    jti: crypto.randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyDelegationToken(token: string | null): Payload | null {
  if (!token) return null;
  const split = token.lastIndexOf(".");
  if (split < 1) return null;
  const body = token.slice(0, split);
  const supplied = Buffer.from(token.slice(split + 1));
  let expected: Buffer;
  try { expected = Buffer.from(sign(body)); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    const now = Date.now() / 1000;
    if (!payload.sid || !Array.isArray(payload.scopes) || payload.aud !== "iiqe-agent" || !payload.jti) return null;
    if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.iat > now + 60 || payload.exp <= now) return null;
    if (payload.scopes.some((scope) => !AGENT_SCOPES.includes(scope))) return null;
    return payload;
  } catch { return null; }
}
