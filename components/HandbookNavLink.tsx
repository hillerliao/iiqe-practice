"use client";

import { usePathname, useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";

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
 *   - 純點擊展開(無 hover/click delay,desktop/mobile 統一行為)
 *   - Trigger 是 <button>:點擊展開菜單,點擊菜單項走程式化 router.push
 *     (避免 base-ui render=Link 與 mousedown 監聽在 hydration 上的邊界情況)
 *   - 「鍵盤 Enter」也能展開(menu trigger 默認 button,鍵盤 ok)
 *   - 當前訪問的 handbook 用 data-active 高亮
 */
export function HandbookNavLink({
  defaultSlug,
  handbooks,
}: {
  defaultSlug: string;
  handbooks: HandbookNavItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const activeSlug = (() => {
    const m = pathname?.match(/^\/handbook\/([^/.]+)\.html$/);
    return m ? m[1] : null;
  })();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap text-sm"
        title="研習手冊"
      >
        <BookOpen className="w-4 h-4" />
        <span className="hidden md:inline">研習手冊</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-[240px]">
        {handbooks.map((h) => {
          const href = `/handbook/${h.slug}.html`;
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
