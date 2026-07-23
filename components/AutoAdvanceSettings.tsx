"use client";

import { TimerReset } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAutoAdvancePreference } from "@/components/auto-advance-provider";
import {
  AUTO_ADVANCE_OPTIONS,
  autoAdvanceDelayFromValue,
  autoAdvanceDelayToValue,
} from "@/lib/auto-advance";
import { cn } from "@/lib/utils";

export function AutoAdvanceSettings() {
  const { delay, isLoading, isSaving, syncError, setDelay } = useAutoAdvancePreference();

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TimerReset className="size-4" />
          答對後自動跳轉
        </CardTitle>
        <CardDescription>
          選擇答對後查看答案與解析的時間。設定會綁定目前識別碼並跨裝置同步。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={autoAdvanceDelayToValue(delay)}
          onValueChange={(value) => {
            const next = autoAdvanceDelayFromValue(String(value));
            if (next !== undefined) setDelay(next);
          }}
          disabled={isLoading}
          className="gap-2"
        >
          {AUTO_ADVANCE_OPTIONS.map((option) => (
            <label
              key={autoAdvanceDelayToValue(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer",
                "hover:bg-muted/50 transition-colors",
                "has-[[data-checked]]:border-primary has-[[data-checked]]:bg-muted/40",
                isLoading && "cursor-wait opacity-60",
              )}
            >
              <RadioGroupItem
                value={autoAdvanceDelayToValue(option.value)}
                aria-label={option.label}
                className="mt-0.5"
              />
              <span className="flex-1 min-w-0">
                <span className="block font-medium leading-tight">{option.label}</span>
                <span className="block text-xs text-muted-foreground leading-tight mt-0.5">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
        <p
          className={cn(
            "mt-3 text-xs",
            syncError ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {syncError
            ? `同步失敗：${syncError}`
            : isLoading
              ? "正在載入設定…"
              : isSaving
                ? "正在同步設定…"
                : "設定已儲存"}
        </p>
      </CardContent>
    </Card>
  );
}
