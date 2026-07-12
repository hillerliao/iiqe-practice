// app/studynotes/[slug]/BackToTop.tsx
// 滾動後出現的「返回頂部」按鈕(client component,監聽 scroll event)

"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="返回頂部"
      className={cn(
        "fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6",
        "inline-flex items-center justify-center w-11 h-11 rounded-full",
        "bg-primary text-primary-foreground shadow-lg",
        "hover:bg-primary/90 active:scale-95 transition-all",
        "border border-primary/20",
        visible ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-2",
      )}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
