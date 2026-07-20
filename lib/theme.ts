// 主題類型與持久化工具
// 三種模式:淺色、深色、跟隨系統

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "iiqe:theme";

export const DEFAULT_THEME: ThemeMode = "system";

export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

// 解析後的最終主題(把 system 展開為 light/dark)
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

/**
 * 快捷键切换语义：以当前解析后的实际主题为基准，light↔dark 对调。
 * 「跟随系统」模式下同样按解析结果翻转，并落地为显式模式。
 */
export function nextToggledMode(resolved: ResolvedTheme): ThemeMode {
  return resolved === "dark" ? "light" : "dark";
}
