// 管理員識別:本地工具無登入體系,僅靠 sessionId 比對。
// 任何把 sessionId 設為 "user:iiqe2026" 的人會被視為管理員。
// 注意:iiqe2026 不是合法 Email 格式,但 lib/session.ts 的 ADMIN_BYPASS_IDS
// 白名單會放行這個舊 ID,以保留管理員身份不被打斷。
export const ADMIN_ID = "user:iiqe2026";

export function isAdmin(sessionId: string | null | undefined): boolean {
  return !!sessionId && sessionId === ADMIN_ID;
}
