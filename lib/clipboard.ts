function fallbackWriteText(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";

  const selection = document.getSelection?.();
  const selectedRanges: Range[] = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      selectedRanges.push(selection.getRangeAt(index).cloneRange());
    }
  }
  const activeElement = document.activeElement as HTMLElement | null;

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    activeElement?.focus?.({ preventScroll: true });
    if (selection && selectedRanges.length > 0) {
      selection.removeAllRanges();
      for (const range of selectedRanges) selection.addRange(range);
    }
  }

  return copied;
}

/** Writes text in a browser and resolves to whether copying succeeded. */
export async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission, secure-context, and browser-policy failures use the fallback.
  }

  return fallbackWriteText(text);
}
