"use client";

// 全站顶栏 client 包装。
// 目的:在 `/studynotes/<slug>` 路徑下完全不渲染頂部 header,
//       讓研習手冊頁改用單獨的 HandbookSubHeader,
//       從而把原本堆疊的兩層 sticky header (≈120~144px) 壓回單層 (~56px)。

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  HandbookNavLink,
  type HandbookNavItem,
} from "@/components/HandbookNavLink";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  NavHome,
  NavBarChart3,
  NavBookOpen,
  NavStar,
  NavSettings,
} from "@/components/NavIcons";

export function GlobalHeader({
  defaultSlug,
  handbookEntries,
}: {
  defaultSlug: string;
  handbookEntries: HandbookNavItem[];
}) {
  const pathname = usePathname();

  // 手冊頁有自己的 sub-header,此處不再渲染全局導航以節省垂直空間
  if (pathname?.startsWith("/studynotes")) return null;

  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 h-14 flex items-center gap-2 sm:gap-6 min-w-0">
        <Link
          href="/"
          className="font-semibold text-base sm:text-lg flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap"
        >
          <NavBookOpen className="w-5 h-5 shrink-0" />
          <span className="hidden min-[380px]:inline">IIQE 做題家</span>
          <span className="min-[380px]:hidden">IIQE</span>
        </Link>
        <nav className="flex gap-0.5 sm:gap-1 text-sm items-center flex-1 min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/"
            className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <NavHome className="w-4 h-4" />
            <span className="hidden md:inline">首頁</span>
          </Link>
          <Link
            href="/stats"
            className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <NavBarChart3 className="w-4 h-4" />
            <span className="hidden md:inline">統計</span>
          </Link>
          <Link
            href="/wrongbook"
            className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <NavBookOpen className="w-4 h-4" />
            <span className="hidden md:inline">錯題本</span>
          </Link>
          <Link
            href="/favorites"
            className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <NavStar className="w-4 h-4" />
            <span className="hidden md:inline">收藏</span>
          </Link>
          {defaultSlug && handbookEntries.length > 0 && (
            <HandbookNavLink
              defaultSlug={defaultSlug}
              handbooks={handbookEntries}
            />
          )}
          <Link
            href="/settings"
            className="px-2 sm:px-3 py-1.5 rounded-md hover:bg-muted hover:text-foreground flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <NavSettings className="w-4 h-4" />
            <span className="hidden md:inline">設定</span>
          </Link>
        </nav>
        <div className="shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
