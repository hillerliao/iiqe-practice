"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type HandbookNavItem = {
  slug: string;
  title: string;
  version: string;
};

/**
 * 顶部「研習手冊」下拉菜单
 *   - PC (≥ 768px) 滑鼠懸停就展開;手機/平板維持原來點擊展開
 *   - Trigger 是 <button>:點擊或鍵盤 Enter 都能展開;
 *     點擊菜單項走程式化 router.push
 *     (避免 base-ui render=Link 與 mousedown 監聽在 hydration 上的邊界情況)
 *   - 當前訪問的 handbook 用 data-active 高亮
 *   - variant="embedded":用於手册页 sticky sub-header,trigger 更緊湊
 *     (去掉 "md:inline" 標題寬度斷點、padding 略小)
 */
export function HandbookNavLink({
  defaultSlug,
  handbooks,
  variant = "header",
}: {
  defaultSlug: string;
  handbooks: HandbookNavItem[];
  variant?: "header" | "embedded";
}) {
  const router = useRouter();
  const pathname = usePathname();
  // 預設 SSR 為 false (視為手機),待 useEffect 校正成 PC
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    // Safari < 14 用 addListener,其他用 addEventListener
    if (mql.addEventListener) {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }
    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, []);

  const activeSlug = (() => {
    const m = pathname?.match(/^\/studynotes\/([^/]+)$/);
    return m ? m[1] : null;
  })();

  const isEmbedded = variant === "embedded";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap text-sm",
          isEmbedded
            ? "h-9 px-2.5"
            : "px-2 sm:px-3 py-1.5",
        )}
        title="研習手冊"
        openOnHover={isDesktop}
        delay={100}
        closeDelay={150}
      >
        <BookOpen className="w-4 h-4" />
        <span className={isEmbedded ? "inline" : "hidden md:inline"}>
          研習手冊
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-[240px]">
        {handbooks.map((h) => {
          const href = `/studynotes/${h.slug}`;
          const isActive = h.slug === activeSlug;
          return (
            <DropdownMenuItem
              key={h.slug}
              data-active={isActive ? "true" : undefined}
              onClick={() => router.push(href)}
              title={h.version}
            >
              <span className="font-medium">{h.title}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
