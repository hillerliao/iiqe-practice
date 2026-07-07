// app/studynotes/[slug]/HandbookTOC.tsx
// 側邊欄章節目錄(用 client component 處理捲動高亮與 hash 滾動)

"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ChapterEntry } from "@/lib/handbook";

type Props = {
  chapters: ChapterEntry[];
};

export function HandbookTOC({ chapters }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const tocRef = useRef<HTMLElement>(null);

  // 進入時若有 hash,捲動到該錨點
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        // 延遲一點讓 layout 完成
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        setActiveId(hash);
      }
    } else {
      setActiveId(chapters[0]?.id ?? null);
    }
  }, [chapters]);

  // 監聽捲動,高亮當前章節
  useEffect(() => {
    const headings = chapters
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 找出最靠近頂部且可見的 heading
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-70px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [chapters]);

  // 點擊側邊欄項時,主區捲動;側邊欄內部跟隨
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
      setActiveId(id);
    }
  };

  return (
    <aside
      ref={tocRef}
      className="hidden lg:block sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto border-r bg-muted/30 py-4 px-3 text-sm"
    >
      <h2 className="font-semibold mb-3 px-2 text-foreground">目錄</h2>
      <nav>
        <ul className="space-y-0.5">
          {chapters.map((ch) => {
            const isActive = ch.id === activeId;
            const indent = ch.level === 1 ? "" : ch.level === 2 ? "pl-3" : "pl-6";
            const size = ch.level === 1
              ? "font-semibold text-foreground"
              : ch.level === 2
                ? "text-foreground/90"
                : "text-muted-foreground text-xs";
            return (
              <li key={ch.id} className={indent}>
                <a
                  href={`#${ch.id}`}
                  onClick={(e) => handleClick(e, ch.id)}
                  className={cn(
                    "block rounded px-2 py-1 leading-snug transition-colors",
                    size,
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="text-muted-foreground mr-1.5">{ch.number}</span>
                  {ch.title}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
