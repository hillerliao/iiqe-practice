// app/studynotes/[slug]/HandbookTOC.tsx
// 側邊欄章節目錄(client component,處理捲動高亮 + hash 滾動 + mobile drawer)

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChapterEntry } from "@/lib/handbook";

type Props = {
  chapters: ChapterEntry[];
};

export function HandbookTOC({ chapters }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopTocRef = useRef<HTMLElement>(null);
  const mobileTocRef = useRef<HTMLElement>(null);

  // 進入時若有 hash,捲動到該錨點
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
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

  // 目錄自動滾動：當 activeId 變化時，將目錄项滾動到可視區域（居中顯示）
  useEffect(() => {
    if (!activeId) return;

    // 優先使用桌面側邊欄，若無則用移動端抽屉（打開時）
    const container = desktopTocRef.current || (mobileOpen ? mobileTocRef.current : null);
    if (!container) return;

    const activeElement = container.querySelector(`li[id="toc-item-${activeId}"]`) as HTMLElement;
    if (!activeElement) return;

    // 檢查元素是否已經在可視區域内（上下各留 60px 緩衝）
    const containerRect = container.getBoundingClientRect();
    const itemRect = activeElement.getBoundingClientRect();
    const margin = 60;

    const isVisible =
      itemRect.top >= containerRect.top + margin &&
      itemRect.bottom <= containerRect.bottom - margin;

    if (isVisible) return; // 已經可見，不需要滾動

    // 計算滾動位置，讓元素居中顯示
    const relativeTop = itemRect.top - containerRect.top;
    const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  }, [activeId, mobileOpen]);

  // 點擊側邊欄項時捲動 + 在 mobile 自動關閉 drawer
  const handleClick = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `#${id}`);
        setActiveId(id);
        setMobileOpen(false);
      }
    },
    [],
  );

  const navList = (
    <ul className="space-y-0.5">
      {chapters.map((ch) => {
        const isActive = ch.id === activeId;
        const indent = ch.level === 1 ? "" : ch.level === 2 ? "pl-3" : "pl-6";
        const size =
          ch.level === 1
            ? "font-semibold text-foreground"
            : ch.level === 2
              ? "text-foreground/90"
              : "text-muted-foreground text-xs";
        return (
          <li key={ch.id} id={`toc-item-${ch.id}`} className={indent}>
            <a
              href={`#${ch.id}`}
              onClick={(e) => {
                e.preventDefault();
                handleClick(ch.id);
              }}
              className={cn(
                "block rounded px-2 py-1.5 leading-snug transition-colors",
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
  );

  return (
    <>
      {/* Mobile floating button:固定在左下,點擊切換 drawer */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="lg:hidden fixed bottom-4 left-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg px-4 h-11 text-sm font-medium hover:bg-primary/90 transition-colors"
        aria-label={mobileOpen ? "關閉目錄" : "開啟目錄"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        <span>{mobileOpen ? "關閉" : "目錄"}</span>
      </button>

      {/* Mobile drawer:點擊 backdrop 或連結時關閉 */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        ref={desktopTocRef}
        data-state={mobileOpen ? "open" : "closed"}
        className={cn(
          // 基礎 layout
          "bg-muted/30 text-sm border-r",
          // Desktop:sticky sidebar
          "hidden lg:block lg:sticky lg:top-14 lg:self-start lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:py-4 lg:px-3",
          // Mobile:抽屜式 drawer(transform 控制顯隱)
          "lg:transform-none",
        )}
        style={
          // 在 mobile 時用 inline style 控制顯隱(lg 之下 hidden)
          // 用 data-state 與 CSS attribute selector 處理
          undefined
        }
      >
        <h2 className="font-semibold mb-3 px-2 text-foreground">目錄</h2>
        <nav>{navList}</nav>
      </aside>

      {/* Mobile 專用 drawer(用 fixed 定位獨立於 desktop sidebar) */}
      <aside
        ref={mobileTocRef}
        data-mobile-toc
        className={cn(
          "lg:hidden fixed top-14 left-0 z-30 w-72 max-w-[85vw] h-[calc(100vh-3.5rem)]",
          "bg-background border-r overflow-y-auto",
          "transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="py-4 px-3">
          <h2 className="font-semibold mb-3 px-2 text-foreground">目錄</h2>
          <nav>{navList}</nav>
        </div>
      </aside>
    </>
  );
}
