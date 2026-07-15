export function getQuestionSourceDisplayName(
  source: string | null | undefined
): string {
  return source === "mock" ? "模擬題" : "必讀題";
}
