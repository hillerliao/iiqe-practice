"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useWindowKeydown } from "@/hooks/use-window-keydown";
import { shiftOnly } from "@/lib/practice-shortcuts";
import { nextToggledMode, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** 快捷键物理键位（event.code，不受键盘布局/输入法影响）。 */
export const THEME_SHORTCUT_CODE = "KeyD";
/** 展示用快捷键标签。 */
export const THEME_SHORTCUT_LABEL = "⇧D";

const HUD_DURATION_MS = 1200;

/**
 * 全局主题快捷键：⇧D 在当前实际显示主题（light↔dark）之间对调。
 *
 * - 复用 useWindowKeydown 默认行为：忽略长按重复、焦点在输入框/对话框时跳过；
 * - 挂载于 layout 的 ThemeProvider 内，覆盖 /studynotes/* 等无 Header 路由；
 * - 切换后顶部弹出瞬时 HUD 胶囊（约 1.2s 淡出），aria-live 对屏幕阅读器播报。
 */
export function ThemeShortcut() {
  const { resolved, setMode } = useTheme();
  const [feedback, setFeedback] = useState<ThemeMode | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useWindowKeydown((event) => {
    if (!shiftOnly(event) || event.code !== THEME_SHORTCUT_CODE) return;
    event.preventDefault();

    const next = nextToggledMode(resolved);
    setMode(next);

    // 连续快速按键时重置定时器而非叠加渲染
    setFeedback(next);
    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), HUD_DURATION_MS);
  });

  const isDark = feedback === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center"
    >
      <div
        role="status"
        className={cn(
          "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm",
          "border-zinc-200/80 bg-white/90 text-zinc-800",
          "dark:border-zinc-700/70 dark:bg-zinc-900/90 dark:text-zinc-100",
          "transition-all duration-300 ease-out",
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "-translate-y-2 scale-95 opacity-0"
        )}
      >
        <Icon
          className={cn(
            "size-4 transition-colors",
            isDark ? "text-indigo-300" : "text-amber-500"
          )}
        />
        <span>
          {feedback === null
            ? ""
            : isDark
              ? "已切換至深色模式"
              : "已切換至淺色模式"}
        </span>
        <kbd className="rounded border border-current/20 px-1.5 py-0.5 font-sans text-[10px] tracking-wider opacity-60">
          {THEME_SHORTCUT_LABEL}
        </kbd>
      </div>
    </div>
  );
}
