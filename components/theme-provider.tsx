"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // 同步 color-scheme 讓瀏覽器原生元件(捲軸、表單)跟著切換
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 永遠以「跟隨系統」為 SSR/CSR 共同起點,避免 hydration mismatch。
  // 真實主題由 <head> 內的 inline script 在第一次繪製前就套用好。
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME);
  const [systemDark, setSystemDark] = useState<boolean>(false);

  // 讀取 localStorage 中的偏好、訂閱系統主題變化
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) {
      setModeState(stored);
    }

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mql.matches);

    const onSystemChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    mql.addEventListener("change", onSystemChange);
    return () => mql.removeEventListener("change", onSystemChange);
  }, []);

  // 每次 mode 或 system 改變都重新套用
  useEffect(() => {
    const resolved = resolveTheme(mode, systemDark);
    applyResolvedTheme(resolved);
  }, [mode, systemDark]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage 可能被禁用(隱私模式等),忽略
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved: resolveTheme(mode, systemDark),
      setMode,
    }),
    [mode, systemDark, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme 必須在 <ThemeProvider> 內使用");
  }
  return ctx;
}
