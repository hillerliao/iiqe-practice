// lib/handbook.ts
// 研習手冊共用工具 (server-side):載入 public/handbook/<slug>.json
// 純函式 (client-safe) 已拆到 ./handbook-refs.ts
// 注意:本檔使用 node:fs/path,僅供 server component / route handler 使用。
//        client component 請改 import from "./handbook-refs"。

import fs from "node:fs/promises";
import path from "node:path";

export type ChapterEntry = {
  id: string;          // e.g. "ch-1", "ch-1-1", "ch-1-1-1"
  level: 1 | 2 | 3;
  number: string;      // e.g. "第一章", "1.1", "1.1.1"
  title: string;
  page: number;        // PDF 頁碼
  parent?: string;
};

export type HandbookData = {
  slug: string;
  title: string;
  version: string;
  language?: string;
  chapters: ChapterEntry[];
  html: string;             // 預渲染的內文 HTML(含章節錨點)
  pdfPageStarts: number[];
};

/** public/handbook/ 內所有 .json slug(供 generateStaticParams) */
export async function listHandbookSlugs(): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", "handbook");
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/** 對 layout / sub-header 共用的手冊清單({ slug, title, version }) */
export async function listHandbookEntries(): Promise<
  { slug: string; title: string; version: string }[]
> {
  const slugs = await listHandbookSlugs();
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      const h = await getHandbook(slug);
      return h ? { slug, title: h.title, version: h.version } : null;
    }),
  );
  return entries.filter(
    (e): e is { slug: string; title: string; version: string } => e !== null,
  );
}

/** 載入指定 slug 的研習手冊;找不到回傳 null */
export async function getHandbook(slug: string): Promise<HandbookData | null> {
  // 防止 path traversal
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  const file = path.join(process.cwd(), "public", "handbook", `${slug}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as HandbookData;
  } catch {
    return null;
  }
}

// re-export 純函式供 server code 使用
export { getHandbookHref, chapterIdSet } from "./handbook-refs";
