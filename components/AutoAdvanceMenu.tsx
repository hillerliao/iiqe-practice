"use client";

import { TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAutoAdvancePreference } from "@/components/auto-advance-provider";
import {
  AUTO_ADVANCE_OPTIONS,
  autoAdvanceDelayFromValue,
  autoAdvanceDelayToValue,
  formatAutoAdvanceDelay,
} from "@/lib/auto-advance";

export function AutoAdvanceMenu({ side = "bottom" }: { side?: "top" | "bottom" }) {
  const { delay, isLoading, setDelay } = useAutoAdvancePreference();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={isLoading}
            title={`自動跳轉：${formatAutoAdvanceDelay(delay)}`}
          />
        }
      >
        <TimerReset className="w-4 h-4 md:mr-1" />
        <span className="hidden md:inline">{formatAutoAdvanceDelay(delay)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-64">
        <DropdownMenuRadioGroup
          value={autoAdvanceDelayToValue(delay)}
          onValueChange={(value) => {
            const next = autoAdvanceDelayFromValue(String(value));
            if (next !== undefined) setDelay(next);
          }}
        >
          <DropdownMenuLabel>答對後自動跳轉</DropdownMenuLabel>
          {AUTO_ADVANCE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={autoAdvanceDelayToValue(option.value)}
              value={autoAdvanceDelayToValue(option.value)}
              closeOnClick
              className="items-start py-2"
            >
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
