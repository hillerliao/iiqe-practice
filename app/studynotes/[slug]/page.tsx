// app/studynotes/[slug]/page.tsx
// 研習手冊動態路由 — /studynotes/<slug>
// 頁面只剩一層 sticky header (HandbookSubHeader),
// 全域 header 由 GlobalHeader 在該路徑下隱藏。

import { notFound } from "next/navigation";

import { getHandbook, listHandbookEntries, listHandbookSlugs } from "@/lib/handbook";
import { HandbookTOC } from "./HandbookTOC";
import { HandbookSubHeader } from "./HandbookSubHeader";
import { BackToTop } from "./BackToTop";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const slugs = await listHandbookSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const data = await getHandbook(slug);
  if (!data) return { title: "找不到研習手冊" };
  return {
    title: `研習手冊 — ${data.title}`,
    description: `${data.title} (${data.version})`,
  };
}

export default async function HandbookPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const data = await getHandbook(slug);
  if (!data) notFound();

  // 與 app/layout.tsx 共用同一份 { slug, title, version } 清單
  const handbookEntries = await listHandbookEntries();
  const defaultSlug =
    handbookEntries.find((h) => h.slug === "exam1-2024")?.slug ??
    handbookEntries[0]?.slug ??
    "";

  return (
    <div className="max-w-7xl mx-auto">
      <HandbookSubHeader
        title={data.title}
        version={data.version}
        defaultSlug={defaultSlug}
        handbookEntries={handbookEntries}
      />

      <div className="flex">
        {/* TOC sidebar (client) */}
        <HandbookTOC chapters={data.chapters} />

        {/* Main content */}
        <article
          className="handbook-content flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-6 max-w-4xl mx-auto pb-24 lg:pb-6"
          dangerouslySetInnerHTML={{ __html: data.html }}
        />
      </div>

      {/* Handbook 內文用 raw HTML 注入,Tailwind dark: 變體不會作用,
          這裡補一段 CSS 讓 .dark 也能影響內文配色,
          並加入 mobile 排版優化 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .handbook-content { color: var(--foreground); line-height: 1.7; }
            .dark .handbook-content { color: #e5e7eb; }

            /* === 章節標題層級 === *
               Tailwind preflight 預設 reset 了 h1-h6 樣式,這裡重新建立層級。
               使用 !important 確保不被 Tailwind utility class 覆蓋。
               字級與間距遵循「字號 ≈ 1.25^n」幾何級數(major third) */
            .handbook-content h1 {
              font-size: 1.875rem !important;       /* 30px (章) */
              font-weight: 700 !important;          /* Bold */
              line-height: 1.3 !important;
              color: #1e3a8a !important;            /* 深藍 — 章 */
              margin-top: 48px !important;
              margin-bottom: 24px !important;
              padding-bottom: 12px !important;
              border-bottom: 3px solid #93c5fd !important;  /* 強調分隔 */
              letter-spacing: -0.01em !important;
            }
            .dark .handbook-content h1 {
              color: #93c5fd !important;
              border-bottom-color: #1e40af !important;
            }

            .handbook-content h2 {
              font-size: 1.5rem !important;         /* 24px (節) */
              font-weight: 600 !important;          /* Semi-bold */
              line-height: 1.35 !important;
              color: #1e40af !important;            /* 稍深藍 — 節 */
              margin-top: 36px !important;
              margin-bottom: 16px !important;
              padding-bottom: 8px !important;
              border-bottom: 1px solid #dbeafe !important;
            }
            .dark .handbook-content h2 {
              color: #93c5fd !important;
              border-bottom-color: #1e3a8a !important;
            }

            .handbook-content h3 {
              font-size: 1.25rem !important;        /* 20px (子節) */
              font-weight: 600 !important;
              line-height: 1.4 !important;
              color: #1e3a8a !important;            /* 深藍 — 子節 */
              margin-top: 28px !important;
              margin-bottom: 12px !important;
            }
            .dark .handbook-content h3 { color: #bfdbfe !important; }

            .handbook-content h4 {
              font-size: 1.125rem !important;       /* 18px (亞節) */
              font-weight: 600 !important;
              line-height: 1.45 !important;
              color: #374151 !important;            /* 中性灰 */
              margin-top: 22px !important;
              margin-bottom: 10px !important;
            }
            .dark .handbook-content h4 { color: #d1d5db !important; }

            /* === 內文段 === */
            .handbook-content p {
              font-size: 1rem !important;           /* 16px */
              line-height: 1.75 !important;
              margin-top: 0 !important;
              margin-bottom: 14px !important;
            }
            .handbook-content .handbook-indent-1 { padding-left: 2em !important; }
            .handbook-content .handbook-indent-2 { padding-left: 4em !important; }
            .handbook-content .handbook-indent-3 { padding-left: 6em !important; }
            .handbook-content .handbook-first-line-indent { text-indent: 2em !important; }
            .handbook-content p.handbook-list-item {
              padding-left: 8em !important;
            }
            .handbook-content ul,
            .handbook-content ol {
              font-size: 1rem !important;
              line-height: 1.75 !important;
              margin-top: 12px !important;
              margin-bottom: 14px !important;
              padding-left: 28px !important;
            }
            .handbook-content li {
              margin-bottom: 6px !important;
            }

            /* === 標題旁的 PDF 頁碼徽章 === */
            .handbook-content .page-badge {
              display: inline-block !important;
              font-size: 12px !important;          /* 比內文略小,不會喧賓奪主 */
              font-weight: 500 !important;
              padding: 3px 8px !important;
              margin-left: 10px !important;
              border-radius: 6px !important;
              background: #f3f4f6 !important;
              color: #4b5563 !important;
              text-decoration: none !important;
              vertical-align: middle !important;
            }
            .handbook-content .page-badge:hover {
              background: #dbeafe !important;
              color: #1e40af !important;
            }
            .dark .handbook-content .page-badge {
              background: #1f2937 !important;
              color: #9ca3af !important;
            }

            .handbook-content a { color: var(--primary, #2563eb); }
            .dark .handbook-content a { color: #60a5fa; }

            .handbook-content hr.handbook-divider {
              border: none;
              border-top: 1px dashed var(--border, #e5e7eb);
              margin: 22px auto;
              width: 60%;
            }
            .dark .handbook-content hr.handbook-divider { border-top-color: #374151; }

            /* 辭彙表兩欄排版(還原 PDF 兩欄版面) */
            .handbook-content .vocab-block {
              column-count: 2;
              column-gap: 32px;
              column-rule: 1px solid var(--border, #e5e7eb);
              font-size: 14px;
              line-height: 1.6;
              margin: 12px 0;
            }
            .handbook-content .vocab-block strong { color: #2563eb; }
            .dark .handbook-content .vocab-block strong { color: #60a5fa; }
            .handbook-content .vocab-block .vocab-section {
              display: inline-block;
              font-weight: 600;
              font-size: 15px;
              background: var(--muted, #f3f4f6);
              color: var(--foreground, #1a1a1a);
              border-radius: 4px;
              padding: 1px 6px;
              margin-top: 6px;
            }
            .dark .handbook-content .vocab-block .vocab-section {
              background: #1f2937;
              color: #f3f4f6;
            }
            .handbook-content .vocab-block .vocab-subsection {
              display: inline-block;
              font-weight: 500;
              color: var(--muted-foreground, #6b7280);
              font-size: 13px;
              margin-top: 4px;
            }
            @media (max-width: 768px) {
              .handbook-content .vocab-block { column-count: 1; }
              .handbook-content .handbook-indent-1 { padding-left: 1em !important; }
              .handbook-content .handbook-indent-2 { padding-left: 2em !important; }
              .handbook-content .handbook-indent-3 { padding-left: 3em !important; }
              .handbook-content .handbook-first-line-indent { text-indent: 1em !important; }
              .handbook-content p.handbook-list-item {
                padding-left: 6em !important;
              }
            }

            /* 內文內所有錨點加上 scroll-margin,避免被頂部單層 sticky header 擋住
               新的 sub-header: h-14 (=3.5rem=56px) + 內容區 padding-bottom
               為確保章節標題完整露出,scroll-margin-top 設為 76px */
            .handbook-content h1, .handbook-content h2,
            .handbook-content h3, .handbook-content h4 { scroll-margin-top: 76px; }
            /* 純錨點(內文單獨的 page-badge <a id="pdf-page-N">)也需避開 header */
            .handbook-content a[id^="pdf-page-"] { scroll-margin-top: 76px; }

            /* 行動裝置:略小字級以避免水平溢出,scroll-margin 也略小 */
            @media (max-width: 640px) {
              .handbook-content h1 { font-size: 1.5rem !important; margin-top: 32px !important; margin-bottom: 16px !important; }
              .handbook-content h2 { font-size: 1.25rem !important; margin-top: 24px !important; }
              .handbook-content h3 { font-size: 1.125rem !important; }
              .handbook-content h1, .handbook-content h2,
              .handbook-content h3, .handbook-content h4 { scroll-margin-top: 68px; }
              .handbook-content a[id^="pdf-page-"] { scroll-margin-top: 68px; }
            }
          `,
        }}
      />

      {/* 浮動返回頂部按鈕(僅在捲動後顯示) */}
      <BackToTop />
    </div>
  );
}
