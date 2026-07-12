"use client";

import { Moon, Monitor, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const current = OPTIONS.find((o) => o.value === mode) ?? OPTIONS[2];
  const CurrentIcon = current.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label="切換主題"
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
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
        {THEME_MODES.map((m) => {
          const opt = OPTIONS.find((o) => o.value === m)!;
          const Icon = opt.Icon;
          const active = m === mode;
          return (
            <DropdownMenuItem
              key={m}
              onSelect={() => setMode(m)}
              className={cn(
                "flex items-start gap-2.5",
                "hover:bg-muted hover:text-foreground",
                "focus:bg-muted focus:text-foreground",
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
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
