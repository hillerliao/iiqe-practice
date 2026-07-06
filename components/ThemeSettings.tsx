"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTheme } from "@/components/theme-provider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

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

/**
 * 主題設定卡片 — 在「設定」頁面中提供完整的淺/深/跟隨系統選項。
 * Header 上的 ThemeToggle 是快捷入口;此卡片用於更明確的偏好選擇。
 */
export function ThemeSettings() {
  const { mode, setMode } = useTheme();

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">主題外觀</CardTitle>
        <CardDescription>
          選擇應用程式的淺色或深色模式。可跟隨作業系統的偏好設定。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={mode}
          onValueChange={(value) => {
            // 型別守衛:雖然 RadioGroup 會約束 value,但仍做一次驗證
            const next = value as ThemeMode;
            if (THEME_MODES.includes(next)) {
              setMode(next);
            }
          }}
          className="gap-2"
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer",
                  "hover:bg-muted/50 transition-colors",
                  "has-[[data-checked]]:border-primary has-[[data-checked]]:bg-muted/40"
                )}
              >
                <RadioGroupItem
                  value={opt.value}
                  aria-label={opt.label}
                  className="mt-0.5"
                />
                <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium leading-tight">
                    {opt.label}
                  </span>
                  <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                    {opt.description}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
