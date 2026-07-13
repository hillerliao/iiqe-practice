export const ANSWER_KEYS = ["a", "b", "c", "d"] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export type ModifierKeyState = Readonly<{
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}>;

export type KeyboardRepeatLike = Readonly<{ repeat: boolean }>;

export type InteractiveTargetDescriptor = Readonly<{
  tagName?: string | null;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}>;

export const INTERACTIVE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menu']",
  "[role='dialog']",
  "[data-keyboard-shortcuts='ignore']",
].join(",");

export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function noModifiers(event: ModifierKeyState): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function shiftOnly(event: ModifierKeyState): boolean {
  return event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function parseAnswerKey(key: string): AnswerKey | undefined {
  const normalized = normalizeKey(key);
  const numericIndex = ["1", "2", "3", "4"].indexOf(normalized);
  if (numericIndex >= 0) return ANSWER_KEYS[numericIndex];

  return ANSWER_KEYS.find((answer) => answer === normalized);
}

export function isInteractiveTagName(tagName?: string | null): boolean {
  switch (tagName?.toLowerCase()) {
    case "input":
    case "textarea":
    case "select":
      return true;
    default:
      return false;
  }
}

/** Testable without a DOM by passing a small target-shaped object. */
export function isInteractiveTargetDescriptor(
  target: InteractiveTargetDescriptor | null | undefined,
  selector = INTERACTIVE_TARGET_SELECTOR
): boolean {
  if (!target) return false;
  if (target.isContentEditable || isInteractiveTagName(target.tagName)) return true;

  if (typeof target.closest === "function") {
    try {
      return Boolean(target.closest(selector));
    } catch {
      return false;
    }
  }

  return false;
}

export function isInteractiveEventTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return isInteractiveTargetDescriptor(target);
}

/** Repeated keydown events are ignored unless a caller explicitly opts in. */
export function shouldHandleKeyRepeat(
  event: KeyboardRepeatLike,
  allowRepeat = false
): boolean {
  return allowRepeat || !event.repeat;
}
