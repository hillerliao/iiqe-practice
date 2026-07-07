// lib/handbook-refs.ts
// 純函式:由 ref 產生研習手冊錨點 URL。不依賴 fs / node,可被 client component 引用。

import type { ChapterEntry } from "./handbook";

/**
 * 給定題目 ref(如 "1.1", "1.1.2a", "3.4"),產生研習手冊錨點 URL。
 * - "1.1"  -> "/studynotes/exam1-2024#ch-1-1"
 * - "1.1.2a" -> "/studynotes/exam1-2024#ch-1-1-2"(取前 3 段,忽略字母後綴)
 * - "3.4" -> "/studynotes/exam1-2024#ch-3-4"
 *
 * @param slug 研習手冊 slug
 * @param ref 題目 ref
 * @param chapterIds 可選,傳入所有章節 id 集合以驗證錨點存在(找不到回傳 null)
 */
export function getHandbookHref(
  slug: string,
  ref: string,
  chapterIds?: Iterable<string>,
): string | null {
  if (!ref) return null;
  const parts = ref.split(".").map((p) => p.match(/^\d+/)?.[0] ?? "").filter(Boolean);
  if (parts.length < 2) return null;
  const anchorId = `ch-${parts.join("-")}`;
  if (chapterIds) {
    let exists = false;
    for (const id of chapterIds) {
      if (id === anchorId) { exists = true; break; }
    }
    if (!exists) return null;
  }
  return `/studynotes/${slug}#${anchorId}`;
}

/** 從 chapters 陣列中提取 id 集合(方便傳給 getHandbookHref 驗證) */
export function chapterIdSet(chapters: ChapterEntry[]): Set<string> {
  return new Set(chapters.map((c) => c.id));
}
