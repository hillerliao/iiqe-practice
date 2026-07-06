"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

const OPTIONS: {
  value: ThemeMode;
  label: string;
  description: string;
  Icon: typeof Sun;
}[] = [
  { value: "light", label: "淺色", description: "固定使用淺色模式", Icon: Sun },
  { value: "dark", label: "深色", description: "固定使用深色模式", Icon: Moon },
  {
    value: "system",
    label: "跟隨系統",
    description: "依作業系統設定自動切換",
    Icon: Monitor,
  },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 點外面或按 Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === mode) ?? OPTIONS[2];
  const CurrentIcon = current.Icon;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="切換主題"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "size-8 inline-flex items-center justify-center rounded-lg",
          "border border-transparent text-sm font-medium",
          "hover:bg-muted hover:text-foreground",
          "transition-all outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "dark:hover:bg-muted/50"
        )}
      >
        <CurrentIcon className="size-4" />
        <span className="sr-only">主題:{current.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-full mt-2 z-50 min-w-56",
            "rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg",
            "ring-1 ring-foreground/10",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          {THEME_MODES.map((m) => {
            const opt = OPTIONS.find((o) => o.value === m)!;
            const Icon = opt.Icon;
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setMode(m);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                  "hover:bg-muted hover:text-foreground",
                  "focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none",
                  active && "bg-muted/60"
                )}
              >
                <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium leading-tight">
                    {opt.label}
                  </span>
                  <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                    {opt.description}
                  </span>
                </span>
                {active && (
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-primary mt-2 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
