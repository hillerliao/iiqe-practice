// app/studynotes/[slug]/page.tsx
// 研習手冊動態路由 — /studynotes/<slug>

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getHandbook, listHandbookSlugs } from "@/lib/handbook";
import { HandbookTOC } from "./HandbookTOC";

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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="px-4 lg:px-6 py-4 border-b flex items-center gap-3 sticky top-14 bg-background/95 backdrop-blur z-10">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首頁
        </Link>
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{data.title}</h1>
          <p className="text-xs text-muted-foreground">{data.version}</p>
        </div>
      </div>

      <div className="flex">
        {/* TOC sidebar (client) */}
        <HandbookTOC chapters={data.chapters} />

        {/* Main content */}
        <article
          className="handbook-content flex-1 min-w-0 px-4 lg:px-8 py-6 max-w-4xl mx-auto"
          dangerouslySetInnerHTML={{ __html: data.html }}
        />
      </div>

      {/* Handbook 內文用 raw HTML 注入,Tailwind dark: 變體不會作用,
          這裡補一段 CSS 讓 .dark 也能影響內文配色 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .handbook-content { color: var(--foreground); }
            .dark .handbook-content { color: #e5e7eb; }
            .handbook-content h1, .handbook-content h2,
            .handbook-content h3, .handbook-content h4 {
              color: var(--foreground);
              border-color: var(--border);
            }
            .dark .handbook-content h1,
            .dark .handbook-content h2,
            .dark .handbook-content h3,
            .dark .handbook-content h4 { color: #f3f4f6; border-color: #374151; }
            .handbook-content a { color: var(--primary, #2563eb); }
            .dark .handbook-content a { color: #60a5fa; }
            .handbook-content .page-badge {
              background: var(--muted, #f3f4f6);
              color: var(--muted-foreground, #6b7280);
            }
            .dark .handbook-content .page-badge {
              background: #1f2937; color: #9ca3af;
            }
          `,
        }}
      />
    </div>
  );
}
