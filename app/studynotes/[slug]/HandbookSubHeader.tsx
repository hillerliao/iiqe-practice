"use client";

// 手冊頁 sticky sub-header(取代原本的全域 header + 頁內第二層 sub-header)。
// 單層結構,top-0,h-14:返回首頁 / 標題 / 版本 / 卷切換下拉 / 換膚按鈕。

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { HandbookArrowLeft, HandbookBookOpen } from "@/components/HandbookPageIcons";
import {
  HandbookNavLink,
  type HandbookNavItem,
} from "@/components/HandbookNavLink";

export function HandbookSubHeader({
  title,
  version,
  defaultSlug,
  handbookEntries,
}: {
  title: string;
  version: string;
  defaultSlug: string;
  handbookEntries: HandbookNavItem[];
}) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-3 lg:px-6 h-14 flex items-center gap-2 lg:gap-3 min-w-0">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
          aria-label="返回首頁"
        >
          <HandbookArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">返回首頁</span>
        </Link>
        <HandbookBookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base lg:text-lg font-semibold truncate">{title}</h1>
          <p className="text-xs text-muted-foreground truncate leading-tight hidden sm:block">
            {version}
          </p>
        </div>
        <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
          {defaultSlug && handbookEntries.length > 0 && (
            <HandbookNavLink
              defaultSlug={defaultSlug}
              handbooks={handbookEntries}
              variant="embedded"
            />
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
