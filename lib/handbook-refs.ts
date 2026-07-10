// lib/handbook-refs.ts
// 純函式:由 ref 產生研習手冊錨點 URL。不依賴 fs / node,可被 client component 引用。

import type { ChapterEntry } from "./handbook";

/**
 * 依試卷代碼取得對應的研習手冊 slug。
 * P1 → exam1-2024(保險原理及實務 2024)
 * P3 → exam3-2022(長期保險 2022 年版)
 * 其它/未知 → 回傳 null,呼叫端 fallback 不跳
 */
export function getHandbookSlugByPaper(paperCode: string | null | undefined): string | null {
  if (!paperCode) return null;
  const code = paperCode.trim().toUpperCase();
  if (code === "P1") return "exam1-2024";
  if (code === "P3") return "exam3-2022";
  return null;
}

/**
 * 給定題目 ref(如 "1.1", "1.1.2a", "3.4"),產生研習手冊錨點 URL。
 * - "1.1"  -> "/handbook/exam1-2024.html#ch-1-1"
 * - "1.1.2a" -> "/handbook/exam1-2024.html#ch-1-1-2"(取前 3 段,忽略字母後綴)
 * - "3.4" -> "/handbook/exam1-2024.html#ch-3-4"
 *
 * 注意:URL 指向 public/handbook/<slug>.html 靜態 HTML(Next 直接 serve),
 * 不再走 /studynotes/[slug] SSR 路由。
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
  return `/handbook/${slug}.html#${anchorId}`;
}

/**
 * 一站式:給定 paperCode 與 ref,直接產生正確的研習手冊錨點 URL。
 * - 找不到對應 slug 或 ref 格式不對 → 回傳 null
 * - chapterIds 傳入時會順手驗證錨點是否存在
 */
export function getHandbookHrefForQuestion(
  paperCode: string | null | undefined,
  ref: string,
  chapterIdsBySlug?: Record<string, Iterable<string>>,
): string | null {
  const slug = getHandbookSlugByPaper(paperCode);
  if (!slug) return null;
  const ids = chapterIdsBySlug?.[slug];
  return getHandbookHref(slug, ref, ids);
}

/** 從 chapters 陣列中提取 id 集合(方便傳給 getHandbookHref 驗證) */
export function chapterIdSet(chapters: ChapterEntry[]): Set<string> {
  return new Set(chapters.map((c) => c.id));
}
