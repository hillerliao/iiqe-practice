"use client";

import { useEffect, useRef } from "react";
import {
  isInteractiveEventTarget,
  shouldHandleKeyRepeat,
} from "@/lib/practice-shortcuts";

export type UseWindowKeydownOptions = Readonly<{
  enabled?: boolean;
  allowRepeat?: boolean;
  allowInteractiveTargets?: boolean;
}>;

export function useWindowKeydown(
  handler: (event: KeyboardEvent) => void,
  {
    enabled = true,
    allowRepeat = false,
    allowInteractiveTargets = false,
  }: UseWindowKeydownOptions = {}
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    function onKeydown(event: KeyboardEvent) {
      if (!shouldHandleKeyRepeat(event, allowRepeat)) return;
      if (!allowInteractiveTargets && isInteractiveEventTarget(event.target)) return;
      handlerRef.current(event);
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [enabled, allowRepeat, allowInteractiveTargets]);
}
